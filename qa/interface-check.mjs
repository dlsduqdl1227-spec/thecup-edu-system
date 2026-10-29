// Local in-memory database only. No production users, permissions, or bookings are changed.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const safari=process.argv.includes('--webkit');
const browser=await(safari?webkit:chromium).launch({headless:true,...(!safari&&{executablePath:process.env.QA_BROWSER})});
const baseURL='http://127.0.0.1:5173',folder=`outputs/qa/interface${safari?'-webkit':''}`;
await mkdir(folder,{recursive:true});
const admin=await browser.newContext({baseURL,viewport:{width:1440,height:1000}}),student=await browser.newContext({baseURL,viewport:{width:360,height:800}});
const page=await admin.newPage(),pupil=await student.newPage(),report={checks:[],errors:[]};
for(const p of [page,pupil])p.on('pageerror',e=>report.errors.push(e.message));
const api=async(path,data,method='POST')=>{const r=data?await admin.request.fetch(path,{method,data}):await admin.request.get(path);assert.ok(r.ok(),`${path}: ${await r.text()}`);return r.json();};
const pass=s=>{report.checks.push(s);console.log(`PASS ${s}`);};
async function capture(p,name){await p.evaluate(()=>document.fonts.ready);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name);await p.screenshot({path:`${folder}/${name}.png`,fullPage:true});await p.screenshot({path:`${folder}/${name}-viewport.png`});}
async function mobileNav(p,label){await p.locator('.mobile-dock').getByRole('button',{name:label,exact:true}).click();}
try{
  const bootstrap=await admin.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(bootstrap.status()!==201)await api('/api/auth/login',{name:'QA 운영자',phone:'01000009901',securityCode:'7319'});
  await page.goto('/admin');await page.locator('.side-nav button').first().waitFor();
  assert.equal(await page.locator('.side-nav').getByRole('button',{name:'로스팅 프로파일'}).count(),0);
  const data=await api('/api/dashboard');assert.ok(data.inventory.every(i=>['roasted','gusto','milk'].includes(i.category)));assert.ok(!('profiles' in data));
  for(const path of ['/api/roasting','/api/roasting/order','/api/inventory/roast'])assert.equal((await admin.request.get(path)).status(),404);
  const green=await admin.request.post('/api/inventory',{data:{action:'create_item',name:'Should not exist',category:'green',unit:'kg',reorderLevel:0}});assert.equal(green.status(),400);
  pass('프로파일 메뉴/API 제거 · 원두/우유만 조회 · 생두 신규 등록 차단');
  for(const name of ['매출 내역','수업 사용 기록','재고 관리','매출 및 지출 등록','상담 · 수업 관리','SCA 교육자료','수강생 목록','직원 목록 · 권한']){
    await page.locator('.side-nav').getByRole('button',{name,exact:true}).click();
    await page.locator('.page-section h1').first().waitFor();await capture(page,`desktop-${name.replaceAll(' ','-').replaceAll('·','')}`);
  }
  pass('PC 관리자 8개 메뉴 모두 열림');
  for(const width of [1024,768,390,360,320]){
    await page.setViewportSize({width,height:900});
    for(const label of ['재고','교육','수업','매출']){
      await mobileNav(page,label);await page.locator('.page-section h1').first().waitFor();
      for(const b of await page.locator('.mobile-dock button').all()){const r=await b.boundingBox();assert.ok(r.width>=44&&r.height>=44);assert.ok(Number.parseFloat(await b.evaluate(el=>getComputedStyle(el).fontSize))>=13);}
      assert.equal(await page.locator('.mobile-dock button').count(),5);await capture(page,`admin-${width}-${label}`);
    }
    await mobileNav(page,'전체 메뉴');await page.getByRole('dialog',{name:'전체 메뉴'}).waitFor();
    await capture(page,`menu-${width}`);await page.getByRole('dialog').getByRole('button',{name:'수강생 목록'}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('heading',{name:'수강생 목록',exact:true}).waitFor();
    assert.equal(await page.locator('.mobile-dock button.active').innerText(),'전체 메뉴');
  }
  pass('320–1024px 메뉴 5개 고정 · 교육 바로가기 · 전체 메뉴로 수강생 이동 · 44px 이상 터치 영역 · 가로 넘침 없음');
  await mobileNav(page,'전체 메뉴');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-haspopup')),'dialog');
  await mobileNav(page,'전체 메뉴');await page.setViewportSize({width:1440,height:900});await page.getByRole('dialog').waitFor({state:'hidden'});
  pass('Escape 닫기 · 실행 버튼으로 포커스 복귀 · PC 전환 시 모달 닫힘');
  const suffix=Date.now().toString().slice(-8),name=`QA UI ${suffix}`,phone=`010${suffix}`;
  const member=await api('/api/booking/admin',{action:'createMember',name,phone,approvalStatus:'APPROVED'});
  await api(`/api/edu/members/${member.id}/courses/roasting/levels/Intermediate`,{enabled:true},'PUT');
  const login=await student.request.post('/api/member-auth/login',{data:{name,phone,securityCode:'08372'}});assert.equal(login.status(),200,await login.text());
  await pupil.goto('/?view=student');
  for(const width of [360,768,1024]){
    await pupil.setViewportSize({width,height:900});
    for(const label of ['스케줄','내 예약','실습 기록','교육자료']){await mobileNav(pupil,label);await capture(pupil,`student-${width}-${label}`);}
  }
  assert.ok((await(await student.request.get('/api/edu/catalog')).json()).courses.some(c=>c.id==='roasting'));
  pass('승인 수강생 스케줄/예약/기록/교육 메뉴 · 로스팅 교육과 레벨별 권한 보존');
  await mobileNav(pupil,'홈');await pupil.getByRole('heading',{name:'커피를 이해하는 나만의 다음 단계.',exact:true}).waitFor();await capture(pupil,'home');
  assert.deepEqual(report.errors,[]);
}finally{await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
