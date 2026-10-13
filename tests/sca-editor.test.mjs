import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('deployed slide editor remains authorized, persistent and compatible with English', async t => {
  process.env.SESSION_SECRET = 'local-editor-test-secret-never-use-in-production';
  process.env.OPERATOR_INITIAL_SECURITY_CODE = '7319';
  process.env.STUDENT_INITIAL_SECURITY_CODE = '08372';
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const prepare = (sql, args=[]) => {
    const execute = () => { const s=db.prepare(sql); if(s.columns().length)return {success:true,results:s.all(...args),meta:{}};
      const r=s.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}; };
    return {bind:(...a)=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>execute(),run:async()=>execute(),execute};
  };
  globalThis.__eduEditorTestEnv={DB:{prepare,batch:async statements=>{db.exec('BEGIN');try{const r=statements.map(s=>s.execute());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  t.after(()=>{db.close();delete globalThis.__eduEditorTestEnv;});
  const out=await build({stdin:{contents:`
    export {PUT as save} from './app/api/edu/decks/[course]/[level]/slides/[slideId]/route.ts';
    export {GET as deck} from './app/api/edu/decks/[course]/[level]/route.ts';
    export {ensureDatabase} from './lib/db';
    export {createSession} from './lib/auth';
    export {createMemberSession} from './lib/member-auth';
    export {EDU_DECKS} from './lib/sca-edu/decks';
    export {slideSourceHash} from './lib/sca-edu/edits';
  `,loader:'ts',resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'isolated-editor',setup(b){
    b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'isolated'}));
    b.onLoad({filter:/.*/,namespace:'isolated'},()=>({contents:'export const env=globalThis.__eduEditorTestEnv;'}));
  }}]});
  const r=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text+'\n//# sourceURL=thecup-editor-tests.mjs').toString('base64'));
  await r.ensureDatabase();
  for(const file of ['0016_workable_namora.sql','0017_wealthy_gertrude_yorkes.sql','0018_big_dragon_man.sql','0019_education_slide_edits.sql'])db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  for(const [i,role] of ['admin','employee'].entries())db.prepare('INSERT INTO staff(id,name,phone_hash,phone_last4,role) VALUES(?,?,?,?,?)').run(i+1,role,role,'0000',role);
  db.prepare("INSERT INTO booking_members(id,name,phone_hash,phone_last4,approval_status) VALUES(1,'QA learner','qa','0000','APPROVED')").run();
  db.exec("INSERT INTO edu_member_levels(member_id,course_id,level,approval_stamp,updated_by) SELECT 1,'brewing','Foundation',COALESCE(approved_at,created_at),'1' FROM booking_members WHERE id=1");
  const admin='thecup_session='+(await r.createSession(1)).token;
  const employee='thecup_session='+(await r.createSession(2)).token;
  const student='thecup_member_session='+(await r.createMemberSession(1)).token;
  const course='brewing',level='Foundation',slideId='source-1';
  const context={params:Promise.resolve({course,level,slideId})};
  const original=r.EDU_DECKS[`${course}/${level}`].slides[0],sourceHash=await r.slideSourceHash(original);
  const put=(data,cookie=admin,origin)=>r.save(new Request('https://qa.invalid/api/edu/decks/brewing/Foundation/slides/source-1',{method:'PUT',headers:{cookie,'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(data)}),context);
  const get=(language='ko',cookie=admin)=>r.deck(new Request(`https://qa.invalid/api/edu/decks/brewing/Foundation?lang=${language}`,{headers:{cookie}}),context);
  const body={sourceHash,revision:0,slide:{...original,title:'QA edited title'}};
  await t.test('anonymous, employees, students and cross-origin writes are rejected',async()=>{
    for(const c of ['',employee,student])assert.ok([401,403].includes((await put(body,c)).status));
    assert.equal((await put(body,admin,'https://elsewhere.invalid')).status,403);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM edu_slide_edits').get().n,0);
  });
  await t.test('save preserves Korean and English content without exposing editor metadata to students',async()=>{
    const res=await put(body);assert.equal(res.status,200,await res.clone().text());
    const result=await res.json();assert.equal(result.slides[0].title,body.slide.title);assert.equal(result.editing[slideId].revision,1);
    assert.equal((await (await get()).json()).slides[0].title,body.slide.title);
    for(const lang of ['ko','en']){const d=await (await get(lang,student)).json();assert.equal(d.slides[0].title,body.slide.title);assert.equal(d.editing,undefined);assert.ok(d.slides.every(s=>s.notes===undefined));}
  });
  await t.test('stale revisions and source hashes cannot overwrite existing edits',async()=>{
    assert.equal((await put(body)).status,409);
    assert.equal((await put({...body,revision:1,sourceHash:'stale'})).status,409);
    assert.equal(db.prepare('SELECT revision FROM edu_slide_edits').get().revision,1);
  });
  await t.test('layout, image links and malformed values remain protected',async()=>{
    assert.equal((await put({...body,revision:1,slide:{...body.slide,layout:'image',asset:'unapproved'}})).status,400);
    assert.equal((await put({...body,revision:1,slide:{...body.slide,title:''}})).status,400);
  });
  await t.test('new untranslated edits are never silently replaced by stale English',async()=>{
    assert.equal((await put({...body,revision:1,slide:{...original,title:'새로운번역검수대기문장'}})).status,200);
    assert.equal((await get('en')).status,503);assert.equal((await get('ko')).status,200);
    const res=await put({sourceHash,revision:2,reset:true});assert.equal(res.status,200);
    assert.equal((await res.json()).slides[0].title,original.title);assert.equal((await get('en')).status,200);
  });
  await t.test('audit failure rolls back the edited page',async()=>{
    db.exec("CREATE TRIGGER qa_fail_edit BEFORE INSERT ON audit_logs WHEN NEW.action='edit_edu_slide' BEGIN SELECT RAISE(ABORT,'QA audit failure'); END;");
    assert.notEqual((await put({...body,revision:3})).status,200);
    assert.equal(db.prepare('SELECT revision FROM edu_slide_edits').get().revision,3);
    assert.equal((await (await get()).json()).slides[0].title,original.title);
  });
});
