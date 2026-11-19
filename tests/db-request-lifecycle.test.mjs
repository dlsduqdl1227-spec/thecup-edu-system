import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const result = await build({ stdin: { contents: `
  export {ensureDatabase} from './lib/db';
  export {jsonError} from './lib/http';
  export {AuthError} from './lib/auth';
  export {GET as status} from './app/api/auth/status/route';
`, loader: 'ts', resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'request-local-d1', setup(builder) {
  builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'lifecycle' }));
  builder.onLoad({ filter: /.*/, namespace: 'lifecycle' }, () => ({ contents: 'export const env=globalThis.__requestLifecycleEnv;' }));
} }] });

async function fixture(t, hook = () => {}, staleReads = false) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const scope = new AsyncLocalStorage();
  const metrics = { operations: 0, duplicateColumns: 0 };
  const prepare = (sql, args = []) => {
    const execute = () => {
      try {
        const statement = sqlite.prepare(sql);
        if (statement.columns().length) return { success: true, results: statement.all(...args), meta: {} };
        const r = statement.run(...args);
        return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      } catch (error) { if (/duplicate column/i.test(error.message)) metrics.duplicateColumns++; throw error; }
    };
    const operation = async () => {
      metrics.operations++;
      await hook(scope.getStore(), sql);
      if (scope.getStore()?.ended) throw new Error('owner_request_ended');
      const data = execute();
      if (staleReads && sql.startsWith('PRAGMA table_info')) await new Promise(resolve => setImmediate(resolve));
      return data;
    };
    return { bind: (...values) => prepare(sql, values), execute, run: operation, all: operation,
      first: async column => { const row = (await operation()).results[0] ?? null; return column ? row?.[column] ?? null : row; } };
  };
  globalThis.__requestLifecycleEnv = { DB: { prepare, batch: async statements => {
    metrics.operations++;
    await hook(scope.getStore(), 'BATCH');
    if (scope.getStore()?.ended) throw new Error('owner_request_ended');
    sqlite.exec('BEGIN');
    try { const rows = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return rows; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } };
  const freshApi = () => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64') + '#' + crypto.randomUUID());
  const api = await freshApi();
  t.after(() => { sqlite.close(); delete globalThis.__requestLifecycleEnv; });
  return { api, freshApi, sqlite, scope, metrics };
}

test('a second request can initialize and log in while the first request is still pending', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  let held = false;
  const { api, scope, metrics } = await fixture(t, async (owner, sql) => {
    if (owner?.id === 'slow' && sql === 'BATCH' && !held) { held = true; entered.resolve(); await release.promise; }
  });
  const owner = { id: 'slow', ended: false };
  const slow = scope.run(owner, () => api.ensureDatabase()).then(() => null, error => error);
  await entered.promise;
  let timer;
  try {
    const response = await Promise.race([
      scope.run({ id: 'fresh' }, () => api.status(new Request('https://qa.invalid/api/auth/status'))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Fresh request waited for another request promise')), 3000); }),
    ]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).bootstrapRequired, true);
    // Ending an old owner must not reset a newer successful initialization.
    owner.ended = true; release.resolve();
    assert.match((await slow).message, /owner_request_ended/);
    const count = metrics.operations;
    await scope.run({ id: 'next' }, () => api.ensureDatabase());
    assert.equal(metrics.operations, count, 'completed state skips repeated initialization');
  } finally { clearTimeout(timer); release.resolve(); await slow; }
});

test('an interrupted first request cannot leave a promise for later requests to await', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  let held = false;
  const { api, scope } = await fixture(t, async (owner, sql) => {
    if (owner?.id === 'aborted' && sql === 'BATCH' && !held) { held = true; entered.resolve(); await release.promise; }
  });
  const owner = { id: 'aborted', ended: false };
  const aborted = scope.run(owner, () => api.ensureDatabase()).then(() => null, error => error);
  await entered.promise; owner.ended = true;
  let timer;
  try {
    await Promise.race([scope.run({ id: 'healthy' }, () => api.ensureDatabase()), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Aborted owner poisoned later initialization')), 3000); })]);
    release.resolve(); assert.match((await aborted).message, /owner_request_ended/);
  } finally { clearTimeout(timer); release.resolve(); await aborted; }
});

test('failed initialization is retryable and only a full success is cached', async t => {
  let failed = false;
  const { api, scope, metrics } = await fixture(t, (owner, sql) => {
    if (owner?.id === 'failed' && sql === 'BATCH' && !failed) { failed = true; throw new Error('transient_d1_failure'); }
  });
  await assert.rejects(scope.run({ id: 'failed' }, () => api.ensureDatabase()), /transient_d1_failure/);
  await scope.run({ id: 'retry' }, () => api.ensureDatabase());
  const operations = metrics.operations;
  await scope.run({ id: 'warm' }, () => api.ensureDatabase());
  assert.equal(metrics.operations, operations);
});

test('concurrent cold starts tolerate stale column checks without duplicate seeds', async t => {
  const { api, scope, sqlite, metrics } = await fixture(t, undefined, true);
  await Promise.all([scope.run({ id: 'one' }, () => api.ensureDatabase()), scope.run({ id: 'two' }, () => api.ensureDatabase())]);
  assert.ok(metrics.duplicateColumns > 0, 'test actually exercised concurrent ALTER attempts');
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM inventory_items').get().count, 4);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM monthly_finance').get().count, 60);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM pragma_table_info('roasting_profiles') WHERE name='turning_point_seconds'").get().count, 1);
});

test('only request-lifecycle failures become retryable Korean 503 responses', async t => {
  const { api } = await fixture(t);
  const log = t.mock.method(console, 'error', () => {});
  for (const message of ['This promise was created by a request that has since ended, so it can never settle.', 'Cannot perform I/O on behalf of a different request.']) {
    const response = api.jsonError(new Error(message));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');
    assert.match(response.headers.get('cache-control'), /no-store/);
    const data = await response.json(); assert.match(data.error, /다시 시도/); assert.doesNotMatch(data.error, /promise|I\/O|handle_cross_request/);
  }
  assert.equal(log.mock.callCount(), 2);
  assert.equal(api.jsonError(new api.AuthError('로그인이 필요합니다.', 401)).status, 401);
  assert.equal(api.jsonError(new Error('이름을 입력해 주세요.')).status, 400);
});

test('an actual schema failure is not mistaken for a concurrent successful ALTER', async t => {
  let fail = true;
  const { api, sqlite } = await fixture(t, (_owner, sql) => {
    if (fail && sql === 'ALTER TABLE roasting_profiles ADD COLUMN turning_point_seconds INTEGER') { fail = false; throw new Error('simulated_schema_failure'); }
  });
  await assert.rejects(api.ensureDatabase(), /simulated_schema_failure/);
  await api.ensureDatabase();
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM pragma_table_info('roasting_profiles') WHERE name='turning_point_seconds'").get().count, 1);
});

test('concurrent reinitialization preserves staff permissions, security settings and business rows', async t => {
  const { api, freshApi, sqlite, scope } = await fixture(t);
  await api.ensureDatabase();
  sqlite.exec(`INSERT INTO staff(id,name,phone_hash,phone_last4,role,can_finance,can_inventory,can_roasting) VALUES(1,'Existing staff','original-phone-hash','1234','employee',0,1,0);
    INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status) VALUES(1,'Existing student','original-student-hash','5678','APPROVED');
    INSERT INTO app_settings(key,value) VALUES('auth_security_operator','unchanged-operator-config'),('auth_security_student','unchanged-student-config');
    INSERT INTO finance_transactions(kind,category,amount,transaction_date,description,created_by) VALUES('income','교육',80000,'2026-11-19','Keep original content',1);`);
  const tables=['staff','booking_members','app_settings','finance_transactions','monthly_finance','inventory_items'];
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const before=snapshot(),cold=await freshApi();
  await Promise.all([scope.run({id:'cold-one'},()=>cold.ensureDatabase()),scope.run({id:'cold-two'},()=>cold.ensureDatabase())]);
  assert.deepEqual(snapshot(),before);
});
