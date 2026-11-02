// Local UI test only: notification replies are fixtures; never creates production consultations.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const safari=process.argv.includes('--webkit');
const browser=await(safari?webkit:chromium).launch({headless:true,...(!safari&&{executablePath:process.env.QA_BROWSER})});
const context=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:960}});
const page=await context.newPage(),folder='outputs/qa/consultation-counter'+(safari?'-webkit':'');
await mkdir(folder,{recursive:true});const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
let count=1,failed=false,calls=0;
await page.route('**/api/learning/notifications',route=>{calls++;return failed?route.abort():route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({newConsultations:count,latestId:count})});});
const pass=message=>{report.checks.push(message);console.log('PASS '+message)};
async function current(value){
 await page.waitForFunction(value=>document.querySelector('.consultation-alert-number')?.textContent===String(value),value);
 const wide=page.locator('.side-nav button').filter({hasText:'상담 · 수업 관리'});
 assert.equal(await wide.locator('.navigation-count-badge').textContent(),String(value));
 const description=await wide.getAttribute('aria-describedby');assert.ok(description);
 assert.equal(await page.locator('#'+description).textContent(),'새 상담 '+value+'건');
 assert.equal(await page.locator('.mobile-dock button').filter({hasText:'수업'}).locator('.navigation-count-badge').textContent(),String(value));
}
async function capture(width,height,value){
 await page.setViewportSize({width,height});await page.evaluate(()=>{window.scrollTo(0,0);return document.fonts.ready;});
 await current(value);
 const box=await page.locator('.consultation-alert-number').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height,'counter visible on first screen '+width);
 assert.ok(Number.parseFloat(await page.locator('.consultation-alert-number').evaluate(el=>getComputedStyle(el).fontSize))>=48);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 if(width>1024){const menu=page.locator('.side-nav button').filter({hasText:'상담 · 수업 관리'}),button=await menu.boundingBox(),badge=await menu.locator('.navigation-count-badge').boundingBox();assert.ok(Math.abs((badge.y+badge.height/2)-(button.y+button.height/2))<4,'sidebar badge stays on the same row');}
 await page.screenshot({path:folder+'/'+value+'-'+width+'.png'});
}
try{
 const boot=await context.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
 if(boot.status()!==201)assert.equal((await context.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}})).status(),200);
 await page.goto('/admin');await current(1);await page.waitForLoadState('networkidle');
 for(const [width,height] of [[1440,960],[768,1024],[390,844],[320,800],[844,390]])await capture(width,height,1);
 assert.ok(calls<=2,'one notification poll shared across all badges; no duplicate polling from parent renders');
 pass('첫 직원 화면에서 1건 → 큰 숫자 1, PC/모바일 수업 메뉴 배지 1, 320–1440px·가로 화면 첫 화면에 노출');
 count=2;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await current(2);
 await capture(390,844,2);await page.reload();await current(2);
 pass('2건이면 숫자·메뉴 배지가 2로 갱신되고 첫 진입/새로고침에도 바로 표시');
 await page.locator('.mobile-dock').getByRole('button',{name:'전체 메뉴',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'전체 메뉴'});
 assert.equal(await menu.getByRole('button',{name:'상담 · 수업 관리',exact:false}).locator('.navigation-count-badge').textContent(),'2');
 await page.keyboard.press('Escape');
 await page.locator('.consultation-alert').getByRole('button',{name:'상담 확인하기',exact:false}).click();await page.getByRole('heading',{name:'상담 접수함',exact:true}).waitFor();
 pass('전체 메뉴에도 같은 숫자 표시, 상담 확인 버튼은 접수함으로 이동, 기존 메뉴 이름/키보드 조작 보존');
 failed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.consultation-alert').getByText(/알림 갱신이 지연/).waitFor();
 await current(2);failed=false;count=1;await page.locator('.consultation-alert').getByRole('button',{name:'다시 확인',exact:true}).click();await current(1);
 pass('통신 실패 시 마지막 숫자를 유지하고 재시도 후 정확한 건수로 복구');
 count=0;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.consultation-alert').waitFor({state:'hidden'});
 assert.equal(await page.locator('.navigation-count-badge').count(),0);
 pass('확인할 상담이 0건이면 알림 카드와 모든 숫자 배지 제거');
 count=2;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await current(2);
 await page.setViewportSize({width:1440,height:960});await page.locator('.sidebar-user').getByRole('button',{name:'로그아웃',exact:true}).click();
 await page.getByRole('heading',{name:'직원 로그인',exact:true}).waitFor();assert.equal(await page.locator('.consultation-alert,.navigation-count-badge').count(),0);
 assert.deepEqual(report.errors,[]);pass('로그아웃 시 숫자와 알림 제거, 페이지 JS 오류 없음');
}finally{await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
