// Isolated in-memory QA database only. Never point this workflow at production.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const safari=process.argv.includes('--webkit');
const browser=await(safari?webkit:chromium).launch({headless:true,...(!safari&&{executablePath:process.env.QA_BROWSER})});
const baseURL='http://127.0.0.1:5173', folder=`outputs/qa/learning${safari?'-webkit':''}`;
await mkdir(folder,{recursive:true});
const context=await browser.newContext({baseURL,viewport:{width:1440,height:960}}), admin=await browser.newContext({baseURL,viewport:{width:1440,height:960}}),teacher=await browser.newContext({baseURL,viewport:{width:1440,height:960}});
const page=await context.newPage(),staff=await admin.newPage(),trainer=await teacher.newPage();
const report={checks:[],errors:[]};
for(const p of [page,staff,trainer]){p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))report.errors.push(m.text());});}
const ok=message=>{report.checks.push(message);console.log('PASS '+message);};
const api=async(c,path,data)=>{const r=data?await c.request.post(path,{data}):await c.request.get(path);assert.ok(r.ok(),`${path}: ${r.status()} ${await r.text()}`);return r.json();};
async function capture(p,name){await p.evaluate(()=>document.fonts.ready);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${name}`);await p.screenshot({path:`${folder}/${name}.png`,fullPage:true});await p.screenshot({path:`${folder}/${name}-viewport.png`});}
try{
  await page.goto('/?home=1');await page.getByRole('heading',{name:'커피를 이해하는 나만의 다음 단계.'}).waitFor();
  // Screenshot caret suppression mutates input styles: wait for hydration before any capture.
  await page.waitForLoadState('networkidle');
  for(const width of [1440,768,390,360,320]){await page.setViewportSize({width,height:900});await capture(page,`home-${width}`);assert.match(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily),/Pretendard/);}
  ok('과정 우선 홈 · 5개 모듈/추가 과정/패키지/기업교육 · Pretendard · 320–1440px 가로 넘침 없음');
  const suffix=Date.now().toString().slice(-7),name=`QA 교육 ${suffix}`,phone=`0101${suffix}`,teacherName=`QA 강사 ${suffix}`,teacherPhone=`0102${suffix}`;
  await page.goto('/?view=consultation#consult');await page.getByLabel('성함',{exact:true}).fill(name);await page.getByLabel('연락처',{exact:true}).fill(phone);await page.getByLabel('연령대',{exact:true}).selectOption('30대');await page.getByLabel('더컵에듀를 알게 된 경로').selectOption('SNS');
  await page.locator('.learning-interest-groups input[type=checkbox]').first().check();await page.locator('input[name=consent]').check();await page.getByRole('button',{name:'교육 상담 신청하기'}).click();await page.getByRole('heading',{name:'만나 뵙게 되어 반갑습니다.'}).waitFor();await capture(page,'consultation-success');
  ok('모바일에서 과정 체크 → 연락처·동의 → 상담 접수 성공');
  const boot=await admin.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(boot.status()!==201)await api(admin,'/api/auth/login',{name:'QA 운영자',phone:'01000009901',securityCode:'7319'});
  const instructor=await api(admin,'/api/staff',{name:teacherName,phone:teacherPhone,role:'instructor'});
  const list=await api(admin,'/api/learning/admin');const member=list.members.find(m=>m.name===name);assert.ok(member);
  await staff.goto('/admin');await staff.locator('.side-nav').getByRole('button',{name:'상담 · 수업 관리',exact:true}).click();
  await staff.locator('.learning-member-list').getByRole('button',{name:new RegExp(name)}).click();await staff.locator('.learning-contact').getByRole('link',{name:`${phone} · 전화`}).waitFor();
  await staff.getByRole('button',{name:'+ 결제 확인 · 수강 과정 등록',exact:true}).click();
  const form=staff.locator('.learning-enroll-form');await form.getByLabel('담당 강사',{exact:true}).selectOption(String(instructor.id));await form.getByLabel('요금 구분',{exact:true}).selectOption('SUBSCRIBER');assert.equal(await form.getByLabel('이 과정 결제 확인 금액(원)').inputValue(),'240000');await form.locator('input[type=checkbox]').check();await form.getByRole('button',{name:'수강 등록 · 회원 승인',exact:true}).click();await staff.locator('.learning-enrollment').getByRole('heading',{name:'바리스타 · 파운데이션'}).waitFor();
  for(const width of [1440,768,360,320]){await staff.setViewportSize({width,height:900});await capture(staff,`admin-${width}`);}
  ok('관리자 상담 DB 확인 · 전체 연락처 · 결제 확인 · 3회 등록 · 회원 자동 승인');
  await api(admin,'/api/booking/admin',{action:'generateSlots',month:'2099-10',dates:['2099-10-12','2099-10-13','2099-10-14','2099-10-15'],stationIds:[1],times:[{start:'09:00',end:'11:30'}]});
  await page.goto('/?view=student');await page.getByLabel('이름',{exact:true}).fill(name);await page.getByLabel('등록된 휴대폰 번호').fill(phone);await page.getByLabel('보안코드',{exact:true}).fill('08372');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'내 수업 예약'}).waitFor();await page.getByLabel('조회 월',{exact:true}).fill('2099-10');await page.locator('.portal-day-panel').getByRole('button',{name:'이 시간 신청'}).waitFor();
  for(const day of ['12','13','14']){
    await page.locator('.portal-calendar .days').getByRole('button',{name:new RegExp(`2099년 10월 ${day}일`)}).click();
    await page.locator('.portal-day-panel').getByRole('button',{name:'이 시간 신청'}).click();await page.getByRole('dialog').getByRole('button',{name:'수업 신청하기',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('status').filter({hasText:'수업을 신청했습니다.'}).waitFor();
  }
  assert.equal(await page.getByRole('button',{name:'이 시간 신청'}).count(),0);await capture(page,'student-three-requested');
  const memberData=await api(context,'/api/booking/member?month=2099-10');assert.equal(memberData.enrollments[0].usedSessions,3);
  ok('새 수강생 로그인 → 과목 자동 장비 배정 → 시간 3회 신청 → 초과 신청 방지');
  await api(teacher,'/api/auth/login',{name:teacherName,phone:teacherPhone,securityCode:'7319'});await trainer.goto('/admin');await trainer.locator('.side-nav').getByRole('button',{name:'상담 · 수업 관리',exact:true}).click();await trainer.getByRole('button',{name:'수업 승인·완료',exact:true}).click();await trainer.locator('.learning-request').first().getByRole('button',{name:'수업 확정',exact:true}).click();await trainer.getByRole('dialog').getByRole('button',{name:'확인하여 처리'}).click();await trainer.getByRole('dialog').waitFor({state:'hidden'});
  await trainer.locator('.learning-request').filter({hasText:'승인 대기'}).first().getByRole('button',{name:'신청 거절',exact:true}).click();await trainer.getByRole('dialog').getByRole('textbox').fill('상담 후 시간 변경');await trainer.getByRole('dialog').getByRole('button',{name:'확인하여 처리'}).click();await trainer.getByRole('dialog').waitFor({state:'hidden'});
  const after=await api(context,'/api/booking/member?month=2099-10');assert.equal(after.enrollments[0].usedSessions,2);assert.equal(after.enrollments[0].confirmedSessions,1);
  for(const width of [1440,360]){await trainer.setViewportSize({width,height:900});await capture(trainer,`instructor-${width}`);}
  ok('담당 강사 직원 로그인 · 배정된 수업 확정/거절 · 거절된 회차 복구');
  await page.reload();await page.getByRole('heading',{name:'내 수업 예약'}).waitFor();await page.locator('.learning-my-courses').getByText('예약할 수 있는 회차 1 / 3회').waitFor();
  for(const [width,height] of [[360,800],[844,390],[768,1024]]){await page.setViewportSize({width,height});await capture(page,`student-${width}`);}
  await page.locator('.mobile-dock').getByRole('button',{name:'교육자료',exact:true}).click();await capture(page,'student-materials');
  assert.deepEqual(report.errors,[]);ok('모바일 세로/가로 · 수강생 교육자료 탭 보존 · JS 콘솔 오류 없음');
}finally{await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
