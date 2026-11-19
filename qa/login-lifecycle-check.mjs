// Real login workflows against the isolated localhost memory DB only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder='outputs/qa/login-lifecycle',report={checks:[],errors:[]};await mkdir(folder,{recursive:true});
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(engineName==='chromium'&&{executablePath:process.env.QA_BROWSER})});
 const contexts=[];
 const create=async()=>{const context=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:960}});contexts.push(context);if(engineName==='webkit')await context.addInitScript(()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}})},configurable:true}));return context;};
 try{
  const admin=await create();
  const first=await Promise.all(Array.from({length:6},()=>admin.request.get('/api/auth/status')));for(const r of first){assert.equal(r.status(),200);assert.ok(!('error' in await r.json()));}
  const boot=await admin.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(boot.status()!==201)assert.equal((await admin.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}})).status(),200);
  const suffix=Date.now().toString().slice(-7),employeeName='QA 직원 '+engineName,teacherName='QA 강사 '+engineName,employeePhone='0102'+suffix,teacherPhone='0103'+suffix,studentPhone='0104'+suffix,studentName='QA 수강생 '+engineName;
  for(const [name,phone,role] of [[employeeName,employeePhone,'employee'],[teacherName,teacherPhone,'instructor']]){const r=await admin.request.post('/api/staff',{data:{name,phone,role,canFinance:role==='employee',canInventory:role==='employee'}});assert.equal(r.status(),201,await r.text());}
  const student=await admin.request.post('/api/booking/admin',{data:{action:'createMember',name:studentName,phone:studentPhone,approvalStatus:'APPROVED'}});assert.equal(student.status(),201,await student.text());
  for(const [name,phone,role] of [['QA 운영자','01000009901','admin'],[employeeName,employeePhone,'employee'],[teacherName,teacherPhone,'instructor']]){
   const context=await create(),page=await context.newPage();page.on('pageerror',error=>report.errors.push(engineName+' '+role+': '+error.message));
   await page.goto('/admin');await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'직원 로그인',exact:true}).waitFor();
   await page.getByLabel('이름',{exact:true}).fill(name);await page.getByLabel('휴대폰 번호',{exact:true}).fill(phone);await page.getByLabel('보안코드',{exact:true}).fill('7319');
   if(role==='employee'){
    let intercepted=0;
    await page.route('**/api/auth/login',route=>{intercepted++;return route.fulfill({status:503,json:{error:'서버 연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'},headers:{'Retry-After':'1'}})});
    await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('.toast.error').filter({hasText:'서버 연결을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'}).waitFor();
    assert.equal(intercepted,1,'failed writes are not replayed automatically');assert.equal((await context.request.get('/api/auth/status')).status(),200);assert.equal((await(await context.request.get('/api/auth/status')).json()).user,null);
    await page.unroute('**/api/auth/login');
   }
   const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST'),page.getByRole('button',{name:'로그인',exact:true}).click()]);assert.equal(response.status(),200,await response.text());
   await page.locator('.sidebar-user strong').getByText(name,{exact:true}).waitFor();
   let status=await(await context.request.get('/api/auth/status')).json();assert.equal(status.user.role,role);
   if(role==='employee'){assert.equal(status.user.canFinance,true);assert.equal(status.user.canInventory,true);}
   const privateResult=await context.request.get('/api/booking/calendar?month=2026-11');assert.equal(privateResult.status(),role==='admin'?200:403);
   await page.reload();await page.waitForLoadState('networkidle');status=await(await context.request.get('/api/auth/status')).json();assert.equal(status.user.role,role,'reload keeps a valid session');
   if(role==='admin'){
    await page.locator('.side-nav').getByRole('button',{name:'상담 · 수업 관리',exact:true}).click();await page.getByRole('heading',{name:'일정 · 개강',exact:true}).waitFor();
    await page.getByRole('button',{name:'상담·수강',exact:true}).click();await page.getByRole('heading',{name:'상담부터 수업 확정까지.'}).waitFor();
   }
   await page.locator('.sidebar-user').getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('heading',{name:'직원 로그인',exact:true}).waitFor();
   assert.equal((await(await context.request.get('/api/auth/status')).json()).user,null);
   if(role==='admin')for(const width of [360,884,1440]){await page.setViewportSize({width,height:960});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${folder}/${engineName}-login-${width}.png`});}
  }
  const studentContext=await create(),page=await studentContext.newPage();page.on('pageerror',error=>report.errors.push(engineName+' student: '+error.message));await page.goto('/?view=student');await page.waitForLoadState('networkidle');
  await page.getByLabel('이름',{exact:true}).fill(studentName);await page.getByLabel('등록된 휴대폰 번호',{exact:true}).fill(studentPhone);await page.getByLabel('보안코드',{exact:true}).fill('08372');
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/member-auth/login')&&r.request().method()==='POST'),page.getByRole('button',{name:'로그인',exact:true}).click()]);assert.equal(response.status(),200,await response.text());await page.locator('.portal-member-header').waitFor();
  assert.equal((await(await studentContext.request.get('/api/member-auth/status')).json()).member.name,studentName);
  assert.equal((await studentContext.request.get('/api/booking/calendar?month=2026-11')).status(),401);
  assert.doesNotMatch(await page.locator('body').innerText(),/promise was created|handle_cross_request/);
  report.checks.push(engineName+': six simultaneous cold status requests; admin, employee, instructor and student form logins; permissions, refresh and logout; Korean retryable failure without automatic POST replay; admin calendar/consultation links; 360–1440px');console.log('PASS '+report.checks.at(-1));
 }finally{for(const context of contexts)await context.close();await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
