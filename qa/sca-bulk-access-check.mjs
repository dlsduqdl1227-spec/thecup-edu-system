import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Registration and permission changes run only against the isolated in-memory local QA server.
const baseURL = 'http://127.0.0.1:5173';
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : 'playwright');
const browser = await chromium.launch({ headless:true, executablePath:process.env.QA_BROWSER });
const admin = await browser.newContext({ baseURL, viewport:{width:1440,height:1000} });
const student = await browser.newContext({baseURL,viewport:{width:360,height:800}});
const page = await admin.newPage(), pupil = await student.newPage();
const report = {checks:[],errors:[]};
for(const p of [page,pupil]) p.on('pageerror',e=>report.errors.push(e.message));
const pass = text => {report.checks.push(text);console.log(`PASS ${text}`);};
const api = async (path,data) => {const r=data?await admin.request.post(path,{data}):await admin.request.get(path);assert.ok(r.ok(),`${r.status()} ${await r.text()}`);return r.json();};
const names = i=>`QA 일괄 ${String(i).padStart(2,'0')}`, phone=i=>`0107000${String(i).padStart(4,'0')}`;
const checkMember = i=>page.getByRole('checkbox',{name:`${names(i)} (${String(i).padStart(4,'0')}) 선택`,exact:true});
const eduList = page.locator('.sca-compact-list'), bookingList=page.locator('.booking-compact-list');
const pager = page.getByRole('navigation',{name:'교육자료 수강생 목록 페이지'});
const bulk = async enabled => {
  const response = page.waitForResponse(r=>r.url().endsWith('/api/edu/members/bulk')&&r.request().method()==='PUT');
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:enabled?'선택 레벨 일괄 승인':'선택 레벨 일괄 해제',exact:true}).click();
  const r=await response;
  await page.getByRole('button',{name:'목록 새로고침'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.sca-bulk-apply')?.getAttribute('aria-busy')||document.querySelector('.sca-bulk-apply')?.getAttribute('aria-busy')==='false');
  return r;
};
const capture=async name=>{
  await page.locator('.toast').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name);
  await page.screenshot({path:`outputs/qa/${name}.png`,fullPage:true});
  if(await page.locator('.sca-bulk-layout').count()) {
    await page.locator('.sca-bulk-layout > section').first().screenshot({path:`outputs/qa/${name}-people.png`});
    await page.locator('.sca-bulk-layout > section').last().screenshot({path:`outputs/qa/${name}-levels.png`});
  }
};
try {
  await mkdir('outputs/qa',{recursive:true});
  await api('/api/auth/bootstrap',{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'});
  const ids=[];
  for(let i=1;i<=32;i++) ids.push((await api('/api/booking/admin',{action:'createMember',name:names(i),phone:phone(i),approvalStatus:i>=31?'PENDING':'APPROVED',adminMemo:'로컬 QA 메모'})).id);
  await admin.request.put(`/api/edu/members/${ids[0]}/courses/roasting/levels/Intermediate`,{data:{enabled:true}});
  await page.goto('/admin');
  await page.locator('.side-nav').getByRole('button',{name:'수강생 목록',exact:false}).click();
  await bookingList.locator('article').first().waitFor();
  assert.equal(await bookingList.locator('article').count(),20);
  assert.equal(await bookingList.getByRole('button',{name:'정보 수정',exact:true}).count(),0,'details start collapsed');
  const bookingPager=page.getByRole('navigation',{name:'수강생 목록 페이지'});
  await bookingPager.getByRole('button',{name:'다음',exact:true}).click();
  assert.equal(await bookingList.locator('article').count(),12);
  await page.getByLabel('수강생 검색').fill('0031');
  assert.equal(await bookingList.locator('article').count(),1);
  const pending=bookingList.locator('article').first();
  await pending.getByRole('button',{name:'관리',exact:true}).click();
  await pending.getByRole('button',{name:'정보 수정',exact:true}).click();
  const edit=pending.getByRole('form');await edit.getByLabel('관리자 메모').fill('접힌 목록 수정 QA');
  page.once('dialog',d=>d.accept());await edit.getByRole('button',{name:'저장',exact:true}).click();
  await edit.waitFor({state:'detached'});
  assert.match(await pending.innerText(),/접힌 목록 수정 QA/);
  await page.getByLabel('수강생 검색').fill('');
  await page.getByLabel('정렬',{exact:true}).selectOption('NAME');
  assert.match(await bookingList.locator('article').first().innerText(),/QA 일괄 01/);
  await capture('students-compact-desktop');
  for(const width of [768,360]){await page.setViewportSize({width,height:900});await capture(`students-compact-${width}`);}
  pass('32명 수강생 리스트·20명 페이지 이동·검색·이름 정렬·접힌 관리/수정·PC/태블릿/360px');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.side-nav').getByRole('button',{name:'SCA 교육자료'}).click();
  await eduList.locator('article').first().waitFor();
  assert.equal(await eduList.locator('article').count(),10);
  await checkMember(1).check();
  assert.equal(await page.getByRole('checkbox',{name:'현재 페이지 전체 선택'}).evaluate(el=>el.indeterminate),true);
  await pager.getByRole('button',{name:'다음',exact:true}).click();await checkMember(11).check();
  await pager.getByRole('button',{name:'이전',exact:true}).click();assert.equal(await checkMember(1).isChecked(),true);
  await page.getByRole('checkbox',{name:'현재 페이지 전체 선택'}).check();
  assert.match(await page.locator('.sca-bulk-apply').innerText(),/11명/);
  await page.getByRole('checkbox',{name:'모든 과목·레벨 선택'}).check();
  assert.match(await page.locator('.sca-bulk-apply').innerText(),/18개 레벨/);
  await page.getByRole('checkbox',{name:'모든 과목·레벨 선택'}).uncheck();
  await page.getByRole('checkbox',{name:'브루잉 Foundation',exact:true}).check();
  await page.getByRole('checkbox',{name:'지속가능성 Foundation',exact:true}).check();
  assert.equal(await page.getByRole('checkbox',{name:'브루잉 전체 레벨',exact:true}).evaluate(el=>el.indeterminate),true);
  let calls=0;
  await page.route('**/api/edu/members/bulk',async route=>{calls++;await route.continue();});
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'선택 레벨 일괄 승인',exact:true}).click();
  assert.equal(calls,0);
  await capture('education-bulk-desktop');
  assert.equal((await bulk(true)).status(),200);assert.equal(calls,1);
  await page.unroute('**/api/edu/members/bulk');
  const list=(await api('/api/edu/members')).members;
  for(let i=0;i<11;i++){const levels=list.find(m=>m.id===ids[i]).levels;assert.ok(levels.some(l=>l.courseId==='brewing'&&l.level==='Foundation'));assert.ok(levels.some(l=>l.courseId==='sustainability'));}
  assert.equal(list.find(m=>m.id===ids[11]).levels.length,0);
  assert.ok(list.find(m=>m.id===ids[0]).levels.some(l=>l.courseId==='roasting'));
  assert.equal(await checkMember(1).isChecked(),false);
  pass('페이지 간 선택 유지·현재 페이지 전체/부분 선택·레벨 체크·취소 시 미저장·11명×2레벨 단일 요청');

  await pupil.goto('/?view=student');await pupil.locator('input[name="name"]').fill(names(1));await pupil.locator('input[name="phone"]').fill(phone(1));
  await pupil.getByLabel('보안코드',{exact:true}).fill('08372');await pupil.getByRole('button',{name:'로그인',exact:true}).click();
  await pupil.locator('.portal-mobile-nav').getByRole('button',{name:'교육',exact:true}).click();await pupil.locator('.sca-stage').waitFor();
  assert.equal((await student.request.get('/api/edu/decks/brewing/Foundation')).status(),200);
  await checkMember(1).check();await checkMember(2).check();await page.getByRole('checkbox',{name:'브루잉 Foundation',exact:true}).check();
  assert.equal((await bulk(false)).status(),200);
  assert.equal((await student.request.get('/api/edu/decks/brewing/Foundation')).status(),404);
  assert.equal((await student.request.get('/api/edu/decks/roasting/Intermediate')).status(),200);
  assert.equal((await student.request.get('/api/booking/member')).status(),200);
  assert.ok((await api('/api/edu/members')).members.find(m=>m.id===ids[10]).levels.some(l=>l.courseId==='brewing'));
  pass('수강생 실제 자료 열람·일괄 해제 즉시 차단·다른 레벨/수강생/예약 권한 유지');

  await checkMember(3).check();await page.getByLabel('수강생 찾기').fill('0011');
  assert.match(await page.locator('.sca-bulk-apply').innerText(),/0명/);
  await page.getByLabel('수강생 찾기').fill('');await page.getByLabel('회원 상태').selectOption('PENDING');
  await checkMember(31).check();await page.getByRole('checkbox',{name:'브루잉 Foundation',exact:true}).check();
  assert.equal(await page.getByRole('button',{name:'선택 레벨 일괄 승인',exact:true}).isDisabled(),true);
  await page.getByLabel('회원 상태').selectOption('APPROVED');
  await checkMember(4).check();await checkMember(5).check();
  await api('/api/booking/admin',{action:'approveMember',memberId:ids[3],approved:false});
  const before=(await api('/api/edu/members')).members.find(m=>m.id===ids[4]).levels;
  assert.equal((await bulk(true)).status(),409);
  await page.getByRole('alert').filter({hasText:'아무 권한도 변경하지 않았습니다'}).waitFor();
  assert.deepEqual((await api('/api/edu/members')).members.find(m=>m.id===ids[4]).levels,before);
  pass('검색/필터 변경 시 숨은 선택 초기화·미승인 승인 금지·도중 계정 회수 시 전체 변경 차단');

  await checkMember(3).check();
  await page.getByRole('checkbox',{name:'물과 예방정비 Foundation',exact:true}).check();
  await page.route('**/api/edu/members/bulk',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA 일시적인 연결 오류'})}));
  assert.equal((await bulk(true)).status(),503);await page.getByRole('alert').filter({hasText:'QA 일시적인 연결 오류'}).waitFor();
  await page.unroute('**/api/edu/members/bulk');
  assert.ok(!(await api('/api/edu/members')).members.find(m=>m.id===ids[2]).levels.some(l=>l.courseId==='water-maintenance'));
  pass('저장 실패 안내·목록 재확인·권한 오표시 방지');
  await checkMember(1).check(); await checkMember(1).uncheck();
  for(const width of [768,360]){
    await page.setViewportSize({width,height:900});
    await capture(`education-bulk-${width}`);
  }
  await checkMember(1).focus();await page.keyboard.press('Space');assert.equal(await checkMember(1).isChecked(),true);
  await page.getByRole('button',{name:/선택한 1명에게 적용할 과목 선택/}).click();
  assert.equal(await page.getByRole('region',{name:'일괄 처리 과목과 레벨 선택'}).evaluate(el=>el===document.activeElement),true);
  pass('PC/태블릿/360px 가로 넘침 없음·키보드 체크·모바일 과목 선택 이동');
  assert.deepEqual(report.errors,[]);
} finally {await writeFile('outputs/qa/sca-bulk-access-report.json',JSON.stringify(report,null,2));await browser.close();}
