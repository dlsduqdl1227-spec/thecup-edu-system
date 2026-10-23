import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// All stock mutations are isolated in the local in-memory QA database, never production.
const {chromium}=await import(process.env.QA_PLAYWRIGHT?pathToFileURL(process.env.QA_PLAYWRIGHT).href:'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
const ctx=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:1000}});
const page=await ctx.newPage(),report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
const pass=s=>{report.checks.push(s);console.log(`PASS ${s}`);};
const api=async(path,data)=>{const r=data?await ctx.request.post(path,{data}):await ctx.request.get(path);assert.ok(r.ok(),await r.text());return r.json();};
const current=async id=>(await api('/api/dashboard')).inventory.find(i=>i.id===id);
const qty=()=>page.locator('input[name="quantity"]');
const work=()=>page.locator('select[name="movementType"]');
const submit=async(expected=201)=>{const r=page.waitForResponse(r=>r.url().endsWith('/api/inventory')&&r.request().method()==='POST');
  await page.locator('.inventory-form-fields button.secondary-button').click();const result=await r;assert.equal(result.status(),expected,await result.text());
  await page.waitForFunction(()=>!document.querySelector('.inventory-form-fields')?.disabled);return result;};
const choose=async(id,type)=>{await page.getByRole('tab',{name:'빠른 입력',exact:true}).click();await page.locator('select[name="itemId"]').selectOption(String(id));await work().selectOption(type);};
const capture=async name=>{await page.locator('.toast').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`outputs/qa/${name}.png`,fullPage:true});};
try{
  await mkdir('outputs/qa',{recursive:true});
  await api('/api/auth/bootstrap',{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'});
  const ids=[];
  for(const [name,category,unit,quantity] of [['QA 원두 kg','roasted','kg',0.1],['QA 원두 g','gusto','g',100],['QA 실사 원두','roasted','kg',2],['QA 우유','milk','팩',2]]){
    ids.push((await api('/api/inventory',{action:'create_item_with_stock',name,category,unit,initialQuantity:quantity,reorderLevel:0,movementDate:'2026-09-28',lot:'QA LOT',process:'워시드'})).id);
  }
  await page.goto('/admin');await page.locator('.side-nav').getByRole('button',{name:/재고 관리/}).click();
  for(const [id,type] of [[ids[0],'in'],[ids[1],'out'],[ids[2],'adjust']]){
    await choose(id,type);assert.equal(await qty().inputValue(),'');assert.equal(await page.locator('.inventory-form-fields button.secondary-button').isDisabled(),true);
    await qty().fill('0');await qty().blur();assert.equal(await qty().inputValue(),'0');assert.match(await page.locator('.inventory-balance-preview').innerText(),/→ 0kg/);
    page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'0으로 처리 · 목록에서 제외',exact:true}).click();assert.ok((await current(id)).quantity>0);
    page.once('dialog',d=>d.accept());await submit();assert.equal((await current(id)).quantity,0);
    const records=(await api('/api/dashboard')).movements.filter(m=>m.itemId===id);assert.ok(records.some(m=>m.movementType==='in'));assert.ok(records.some(m=>m.movementType==='adjust'));
  }
  pass('입고·출고·실사 0 입력이 정확히 0kg 저장 · 취소 시 미변경 · 기존 입고 기록 보관');
  await page.getByRole('tab',{name:'재고 현황',exact:true}).click();assert.equal(await page.locator('.inventory-card').filter({hasText:'QA 원두 kg'}).count(),0);
  await page.getByLabel('재고 상태',{exact:true}).selectOption('empty');await page.getByLabel('품목 검색',{exact:true}).fill('QA 원두 kg');
  const card=page.locator('.inventory-card').filter({hasText:'QA 원두 kg'});await card.waitFor();assert.match(await card.innerText(),/0kg/);await card.getByRole('button',{name:'입고',exact:true}).click();
  assert.equal(await page.locator('select[name="itemId"]').inputValue(),String(ids[0]));await qty().fill('000.5');await qty().blur();assert.equal(await qty().inputValue(),'0.5');await submit();assert.equal((await current(ids[0])).quantity,0.5);
  await page.getByRole('tab',{name:'재고 현황',exact:true}).click();await page.getByLabel('재고 상태',{exact:true}).selectOption('available');await card.waitFor();
  pass('기본 목록에서 소진 품목 제외 · 검색/소진 보기 · 같은 품목 재입고로 복귀 · 선행 0 정리');
  await card.getByRole('button',{name:'실사',exact:true}).click();await qty().fill('0.001');await submit();assert.equal((await current(ids[0])).quantity,0.001);
  assert.match(await page.locator('.inventory-selected-item').innerText(),/0.001kg/);
  await work().selectOption('out');await qty().fill('1');await page.getByRole('alert').filter({hasText:'현재 재고보다 많습니다'}).waitFor();assert.equal(await page.locator('.inventory-form-fields button.secondary-button').isDisabled(),true);
  await page.getByRole('button',{name:'남은 수량 전체 사용',exact:true}).click();assert.equal(await qty().inputValue(),'0.001');page.once('dialog',d=>d.accept());await submit();assert.equal((await current(ids[0])).quantity,0);
  pass('0.001kg 작은 잔량 정확히 표시 · 재고 초과 차단 · 남은 수량 전체 사용');
  await choose(ids[3],'adjust');await qty().fill('1');
  await page.route('**/api/inventory',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA 저장 실패'})}):r.continue());
  await submit(503);assert.equal(await qty().inputValue(),'1');assert.equal((await current(ids[3])).quantity,2);await page.getByRole('alert').filter({hasText:'QA 저장 실패'}).waitFor();await page.unroute('**/api/inventory');
  await api('/api/inventory',{action:'movement',itemId:ids[3],quantity:1,movementType:'in',movementDate:'2026-09-28'});
  await submit(409);assert.equal((await current(ids[3])).quantity,3);await page.getByRole('button',{name:'현재 수량 다시 불러오기'}).click();await page.getByRole('alert').filter({hasText:'다른 작업'}).waitFor({state:'detached'});
  assert.match(await page.locator('.inventory-selected-item').innerText(),/3팩/);
  pass('저장 실패 시 입력 보존 · 다른 작업과 충돌 시 덮어쓰기 차단 · 현재 수량 새로 불러오기');
  await choose(ids[2],'out');await page.getByRole('button',{name:'재고 비우기 (0)',exact:true}).click();assert.equal(await work().inputValue(),'adjust');assert.equal(await qty().inputValue(),'0');
  for(const width of [1440,768,360]){await page.setViewportSize({width,height:900});await capture(`inventory-zero-entry-${width}`);}
  await page.getByRole('tab',{name:'재고 현황',exact:true}).click();await page.getByLabel('품목 검색',{exact:true}).fill('');await page.getByLabel('재고 상태',{exact:true}).selectOption('all');
  for(const width of [1440,768,360]){await page.setViewportSize({width,height:900});await capture(`inventory-zero-overview-${width}`);}
  pass('0 처리 바로가기 · PC/태블릿/360px 입력 및 재고 현황 가로 넘침 없음');
  assert.deepEqual(report.errors,[]);
}finally{await writeFile('outputs/qa/inventory-zero-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
