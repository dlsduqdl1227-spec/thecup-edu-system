import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readStockQuantity, inventoryChange } from '../lib/inventory-movement.ts';
import { formatBeanQuantity, formatInventoryQuantity } from '../lib/quantity.ts';

test('zero remains zero, blanks are not zero, and small balances do not display as zero', () => {
  for (const value of [0, '0', '00', '0.00']) assert.equal(readStockQuantity(value), 0);
  assert.equal(readStockQuantity('01'), 1);
  assert.equal(readStockQuantity('.1'), 0.1);
  for (const value of ['', ' ', null, undefined, false, [], 'bad', '1,000', -1, Infinity, '1e2', 0.0000000001]) assert.throws(() => readStockQuantity(value));
  assert.equal(formatBeanQuantity(1, 'g'), '0.001kg');
  assert.equal(formatInventoryQuantity(0.001, 'kg'), '0.001kg');
  assert.equal(formatInventoryQuantity(0, 'kg'), '0kg');
  assert.deepEqual(inventoryChange(0.1 + 0.2, 0, 'adjust'), {nextQuantity:0, delta:-0.3});
  assert.deepEqual(inventoryChange(0.3, 0.3, 'out'), {nextQuantity:0, delta:-0.3});
  assert.equal(inventoryChange(0.1, 0.2, 'in').nextQuantity, 0.3);
  assert.throws(() => inventoryChange(1, 2, 'out'));
});

test('inventory counts preserve history, restock depleted items and commit atomically', async t => {
  process.env.SESSION_SECRET='local-stock-test-secret-never-use-in-production';
  process.env.OPERATOR_INITIAL_SECURITY_CODE='7319';
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  let beforeBatch;
  const prepare=(sql,args=[])=>{
    const execute=()=>{const s=sqlite.prepare(sql);if(s.columns().length)return {success:true,results:s.all(...args),meta:{}};
      const r=s.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};};
    return {bind:(...next)=>prepare(sql,next),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>execute(),run:async()=>execute(),execute};
  };
  globalThis.__inventoryZeroEnv={DB:{prepare,batch:async statements=>{if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}sqlite.exec('BEGIN');
    try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
  t.after(()=>{sqlite.close();delete globalThis.__inventoryZeroEnv;});
  const output=await build({stdin:{contents:`export { POST } from './app/api/inventory/route.ts'; export { GET as dashboard } from './app/api/dashboard/route.ts'; export { PATCH as editItem } from './app/api/inventory/items/[id]/route.ts'; export { ensureDatabase } from './lib/db'; export { createSession } from './lib/auth';`,loader:'ts',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'stock-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'stock'}));b.onLoad({filter:/.*/,namespace:'stock'},()=>({contents:'export const env=globalThis.__inventoryZeroEnv;'}));}}]});
  const routes=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text+'\n//# sourceURL=inventory-zero-qa-bundle.mjs').toString('base64')}`);await routes.ensureDatabase();
  sqlite.prepare("INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES(1,'QA','qa','0000','admin'),(2,'QA2','qa2','0001','instructor')").run();
  const cookie=`thecup_session=${(await routes.createSession(1)).token}`,restricted=`thecup_session=${(await routes.createSession(2)).token}`;
  const request=(payload,auth=cookie,origin='https://qa.invalid')=>new Request('https://qa.invalid/api/inventory',{method:'POST',headers:{cookie:auth,origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const item=(quantity=1,category='roasted',unit='kg')=>Number(sqlite.prepare("INSERT INTO inventory_items(category,name,unit,quantity,created_by) VALUES(?,'QA stock',?,?,1)").run(category,unit,quantity).lastInsertRowid);
  const balance=id=>sqlite.prepare('SELECT quantity,active FROM inventory_items WHERE id=?').get(id);
  const counts=()=>[sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n];
  const payload=(id,quantity,type='adjust',extra={})=>({action:'movement',itemId:id,quantity,movementType:type,movementDate:'2026-09-28',note:'local QA',...extra});
  await t.test('anonymous, cross-origin and insufficient permission cannot change inventory',async()=>{
    const id=item();for(const [auth,origin,expected] of [['','https://qa.invalid',401],[restricted,'https://qa.invalid',403],[cookie,'https://other.invalid',403]])assert.equal((await routes.POST(request(payload(id,0),auth,origin))).status,expected);
    assert.equal(balance(id).quantity,1);
  });
  await t.test('0 is exact for kg, gram-backed beans and milk; previous rows survive',async()=>{
    for(const [amount,category,unit] of [[0.1,'roasted','kg'],[100,'gusto','g'],[0.1+0.2,'roasted','kg'],[3,'milk','팩']]){
      const id=item(amount,category,unit);const previous=sqlite.prepare("INSERT INTO inventory_movements(item_id,movement_type,quantity,movement_date,created_by) VALUES(?,'in',?,'2026-09-27',1)").run(id,amount).lastInsertRowid;
      const r=await routes.POST(request(payload(id,'0','adjust',{expectedQuantity:amount})));assert.equal(r.status,201,await r.clone().text());assert.equal((await r.json()).quantity,0);
      assert.equal(balance(id).quantity,0);assert.equal(balance(id).active,1);assert.ok(sqlite.prepare('SELECT id FROM inventory_movements WHERE id=?').get(previous));
      const restock=await routes.POST(request(payload(id,2,'in',{expectedQuantity:0})));assert.equal(restock.status,201);assert.equal(balance(id).quantity,2);
    }
  });
  await t.test('retired categories cannot be created or changed; archive balances survive',async()=>{
    for (const category of ['green','other']) {
      const id=item(4,category), before=counts();
      for(const type of ['in','out','adjust']) assert.equal((await routes.POST(request(payload(id,1,type)))).status,400);
      assert.equal((await routes.POST(request({action:'create_item',category,name:'Blocked',unit:'kg',reorderLevel:0}))).status,400);
      assert.equal(balance(id).quantity,4);assert.deepEqual(counts(),before);
    }
  });
  await t.test('dashboard excludes retired stock while preserving its ledger, profiles and financial history',async()=>{
    const archived=item(8,'green'), milk=item(2,'milk','팩');
    const movementId=Number(sqlite.prepare("INSERT INTO inventory_movements(item_id,movement_type,quantity,movement_date,created_by) VALUES(?,'in',8,'2026-10-01',1)").run(archived).lastInsertRowid);
    sqlite.prepare("INSERT INTO finance_transactions(kind,category,amount,transaction_date,description,inventory_movement_id,created_by) VALUES('expense','생두',12000,'2026-10-01','Archived cost',?,1)").run(movementId);
    const before=JSON.stringify(sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(archived));
    const profiles=sqlite.prepare('SELECT COUNT(*) AS n FROM roasting_profiles').get().n;
    const result=await routes.dashboard(new Request('https://qa.invalid/api/dashboard',{headers:{cookie}}));
    assert.equal(result.status,200);const data=await result.json();
    assert.ok(data.inventory.some(i=>i.id===milk));assert.ok(data.inventory.every(i=>['roasted','gusto','milk'].includes(i.category)));
    assert.ok(!data.movements.some(m=>m.itemId===archived));assert.ok(!('profiles' in data));
    assert.ok(data.transactions.some(t=>t.description==='Archived cost'&&t.amount===12000));
    const edit=await routes.editItem(new Request('https://qa.invalid/api/inventory/items/'+archived,{method:'PATCH',headers:{cookie,origin:'https://qa.invalid','content-type':'application/json'},body:JSON.stringify({name:'Archived',category:'roasted',unit:'kg',reorderLevel:0})}),{params:Promise.resolve({id:String(archived)})});
    assert.equal(edit.status,404);
    assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM inventory_items WHERE id=?').get(archived)),before);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM roasting_profiles').get().n,profiles);
    assert.ok(sqlite.prepare('SELECT id FROM inventory_movements WHERE id=?').get(movementId));
  });
  await t.test('empty or invalid adjustment and ambiguous zero movement never erase stock',async()=>{
    const id=item();const before=counts();for(const value of ['',null,undefined,'no',-1])assert.equal((await routes.POST(request(payload(id,value)))).status,400);
    for(const type of ['in','out'])assert.equal((await routes.POST(request(payload(id,0,type)))).status,400);
    assert.equal(balance(id).quantity,1);assert.deepEqual(counts(),before);
  });
  await t.test('complete use reaches exact zero; small remaining amount is kept; overspend rejected',async()=>{
    const id=item(0.3);assert.equal((await routes.POST(request(payload(id,0.299,'out')))).status,201);assert.equal(balance(id).quantity,0.001);
    assert.equal((await routes.POST(request(payload(id,0.002,'out')))).status,400);
    assert.equal((await routes.POST(request(payload(id,0.001,'out')))).status,201);assert.equal(balance(id).quantity,0);
  });
  await t.test('stale page and concurrent writes cannot overwrite or create orphan records',async()=>{
    const id=item(2),before=counts();assert.equal((await routes.POST(request(payload(id,0,'adjust',{expectedQuantity:1})))).status,409);
    beforeBatch=()=>sqlite.prepare('UPDATE inventory_items SET quantity=3 WHERE id=?').run(id);
    assert.equal((await routes.POST(request(payload(id,0,'adjust',{expectedQuantity:2})))).status,409);assert.equal(balance(id).quantity,3);assert.deepEqual(counts(),before);
  });
  await t.test('failed movement insert rolls back balance and audit; audit failure also changes nothing',async()=>{
    const id=item(),before=counts();
    for(const table of ['inventory_movements','audit_logs']){
      sqlite.exec(`CREATE TRIGGER qa_fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'database QA failure'); END;`);
      const original=console.error;console.error=()=>{};try{assert.equal((await routes.POST(request(payload(id,0)))).status,500);}finally{console.error=original;sqlite.exec('DROP TRIGGER qa_fail');}
      assert.equal(balance(id).quantity,1);assert.deepEqual(counts(),before);
    }
  });
});
