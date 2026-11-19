// Local memory DB only. Production URLs and writes are intentionally not configurable.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder = 'outputs/qa/admin-schedule', report = { checks: [], errors: [] };
await mkdir(folder, { recursive: true });
for (const [engineName, engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch({ headless:true, ...(engineName==='chromium' && { executablePath:process.env.QA_BROWSER }) });
  try {
    const context = await browser.newContext({ baseURL:'http://127.0.0.1:5173', viewport:{width:1440,height:1000} });
    if(engineName==='webkit')await context.addInitScript(()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}})},configurable:true}));
    const api = async (path, data) => { const r = data ? await context.request.post(path,{data}) : await context.request.get(path); assert.ok(r.ok(),path+' '+r.status()+' '+await r.text()); return r.json(); };
    let response = await context.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
    if(response.status()!==201)await api('/api/auth/login',{name:'QA 운영자',phone:'01000009901',securityCode:'7319'});
    const date = engineName==='chromium'?'2027-01-04':'2027-01-06', secondDate=engineName==='chromium'?'2027-01-05':'2027-01-07';
    const data = await api('/api/booking/admin?month=2027-01');
    for(const old of data.reservations.filter(row=>row.memberName.startsWith('QA 일정 '+engineName)&&['REQUESTED','CONFIRMED'].includes(row.status)))await api('/api/booking/admin',{action:'decideReservation',reservationId:old.id,decision:'CANCELLED'});
    const stationIds=data.stations.filter(s=>s.active).map(s=>s.id);
    await api('/api/booking/admin',{action:'generateSlots',month:'2027-01',dates:[date,secondDate],stationIds,times:[{start:'09:00',end:'11:30'},{start:'12:30',end:'15:00'},{start:'15:30',end:'18:00'}]});
    const name='QA '+engineName+' course '+Date.now();
    const course=await api('/api/course-openings',{name,category:'Q_GRADER',courseMonth:'2027-01',openingMinimum:6,capacity:12,isPublic:false,statusOverride:'AUTO',durationHours:48,tuition:1500000,feeNote:'시험비 별도'});
    const suffix=Date.now().toString().slice(-7),studentName='QA 일정 '+engineName,phone='0101'+suffix;
    const member=await api('/api/booking/admin',{action:'createMember',name:studentName,phone,approvalStatus:'APPROVED'});
    await api('/api/learning/admin',{action:'enroll',memberId:member.id,courseKey:'barista:foundation',totalSessions:3,sessionMinutes:150,paidAmount:240000,priceType:'SUBSCRIBER',instructorId:1,paymentConfirmed:true,requestKey:crypto.randomUUID()});
    const student=await browser.newContext({baseURL:'http://127.0.0.1:5173'});
    if(engineName==='webkit')await student.addInitScript(()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}})},configurable:true}));
    assert.equal((await student.request.post('/api/member-auth/login',{data:{name:studentName,phone,securityCode:'08372'}})).status(),200);
    const studentData=await(await student.request.get('/api/booking/member?month=2027-01')).json();
    const morning=studentData.slots.find(s=>s.stationType==='ESPRESSO'&&s.startAt===date+'T09:00:00+09:00');
    response=await student.request.post('/api/booking/member',{data:{action:'requestReservation',slotId:morning.id,enrollmentId:studentData.enrollments[0].id,purpose:'바리스타 수업',materialPlan:'CENTER'}});assert.equal(response.status(),201,await response.text());
    const bookingId=(await response.json()).id;
    const page=await context.newPage();
    let consultationCount=0;
    await page.route('**/api/learning/notifications',route=>route.fulfill({json:{newConsultations:consultationCount,latestId:1}}));
    page.on('pageerror',error=>report.errors.push(engineName+': '+error.message));
    await page.route('**/api/booking/calendar?*',route=>route.fulfill({json:{month:'2027-01',syncedAt:new Date().toISOString(),warning:'',detailsWarning:'',flowEvents:[{id:'private-qa-event',title:'PRIVATE FLOW CLASS',location:'PRIVATE VENUE',startAt:date+'T14:00',endAt:date+'T15:00',startDate:date,endDate:date,allDay:false,endUnknown:false,timingPending:false,blockStartAt:date+'T14:00:00+09:00',blockEndAt:date+'T15:00:00+09:00'}],conflicts:[]}}));
    await page.goto('/admin');await page.waitForLoadState('networkidle');
    await page.locator('.side-nav').getByRole('button',{name:'상담 · 수업 관리',exact:true}).click();
    await page.getByRole('heading',{name:'일정 · 개강',exact:true}).waitFor();
    await page.getByLabel('일정 조회 월',{exact:true}).fill('2027-01');
    await page.locator(`.schedule-days [data-date="${date}"]`).waitFor();
    await page.locator(`.schedule-days [data-date="${date}"]`).click();
    assert.equal(await page.locator('.schedule-slot-row').count(),8); // Bounded, never a whole-month feed.
    assert.match(await page.locator('.schedule-day').innerText(),/1 \/ 2/);
    await page.getByRole('button',{name:'다음 달',exact:true}).click();
    await page.locator('.schedule-days [data-date="2027-02-01"]').waitFor();
    await page.getByRole('button',{name:'이전 달',exact:true}).click();
    await page.locator(`.schedule-days [data-date="${date}"]`).click();
    await page.locator(`.schedule-days [data-date="${date}"]`).focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(`.schedule-days [data-date="${secondDate}"]`).getAttribute('aria-pressed'),'true');
    await page.locator(`.schedule-days [data-date="${date}"]`).click();
    await page.getByLabel('스테이션 필터',{exact:true}).selectOption(String(stationIds[0]));
    assert.equal(await page.locator('.schedule-slot-row').count(),3);
    await page.getByLabel('스테이션 필터',{exact:true}).selectOption('all');
    for(const width of [320,360,520,768,884,1090,1440]){
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,engineName+' schedule '+width);
      assert.equal(await page.locator('.schedule-workbench').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      if([360,884,1440].includes(width))await page.screenshot({path:`${folder}/${engineName}-schedule-${width}.png`,fullPage:true});
    }
    await page.locator('.schedule-day-tabs').getByRole('button',{name:/^FLOW/}).click();await page.getByRole('heading',{name:'PRIVATE FLOW CLASS'}).waitFor();
    await page.locator('.schedule-day-tabs').getByRole('button',{name:/^예약 /}).click();await page.locator('.schedule-day').getByText('담당 강사 · QA 운영자',{exact:true}).first().waitFor();
    page.once('dialog',dialog=>dialog.accept('현장 일정 확인'));
    await page.locator('.schedule-day .status-requested').getByRole('button',{name:'승인',exact:true}).click();
    await page.locator('.schedule-day .status-confirmed .booking-admin-request-status').getByText('확정',{exact:true}).waitFor();
    assert.equal((await api('/api/booking/admin?month=2027-01')).reservations.find(r=>r.id===bookingId).status,'CONFIRMED');
    assert.equal(await page.getByRole('button',{name:'하루 마감',exact:true}).isDisabled(),true);
    await page.locator('.schedule-day-tabs').getByRole('button',{name:/^시간표/}).click();
    await page.locator('.schedule-slot-row').filter({hasText:'12:30–15:00'}).first().click();
    await page.getByRole('dialog').getByLabel('마감 사유 (필수)').fill('QA 장비 점검');
    await page.getByRole('dialog').getByRole('button',{name:'마감 저장',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.locator('.schedule-slot-row').filter({hasText:'QA 장비 점검'}).first().click();
    await page.getByRole('dialog').getByRole('button',{name:'예약 다시 열기'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.locator('.schedule-openings > summary').click();
    for(let n=0;n<20&&!await page.locator('.schedule-course-cards').getByRole('button',{name:new RegExp(name)}).isVisible();n++)await page.locator('.schedule-openings').getByRole('button',{name:'다음',exact:true}).click();
    await page.locator('.schedule-course-cards').getByRole('button',{name:new RegExp(name)}).click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('과정명',{exact:true}).fill(name+' revised');
    await dialog.getByLabel('모집 상태',{exact:true}).selectOption('CLOSED');
    await dialog.getByRole('button',{name:'변경 내용 저장',exact:true}).click();
    await dialog.getByRole('heading',{name:'개강 모집과 수강 희망자'}).waitFor();
    for(const width of [360,884,1440]){await page.setViewportSize({width,height:1000});assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,engineName+' course dialog '+width);}
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.locator('.schedule-course-cards').getByRole('button',{name:new RegExp(name+' revised')}).waitFor();
    const savedCourses=await api('/api/course-openings?month=2027-01');assert.equal(savedCourses.courses.find(c=>c.id===course.id).statusOverride,'CLOSED');
    await page.getByRole('button',{name:'일정 추가',exact:true}).click();
    for(const width of [320,360,768,1090]){await page.setViewportSize({width,height:1000});assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,engineName+' tools '+width);if(width===360)await dialog.screenshot({path:`${folder}/${engineName}-tools-360.png`});}
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'상담·수강',exact:true}).click();await page.getByRole('heading',{name:'상담부터 수업 확정까지.'}).waitFor();
    await page.getByRole('button',{name:'일정·개강',exact:true}).click();await page.getByRole('heading',{name:'일정 · 개강',exact:true}).waitFor();
    assert.equal(await page.locator(`.schedule-days [data-date="${date}"]`).getAttribute('aria-pressed'),'true','selected day survives switching tabs');
    consultationCount=1;await page.evaluate(()=>window.dispatchEvent(new Event('thecup:consultations-updated')));
    await page.getByRole('button',{name:'상담 확인하기'}).click();await page.getByRole('heading',{name:'상담부터 수업 확정까지.'}).waitFor();
    const visitor=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width:884,height:1000}});
    if(engineName==='webkit')await visitor.addInitScript(()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}})},configurable:true}));
    const guest=await visitor.newPage();guest.on('pageerror',error=>report.errors.push(engineName+' guest '+error.message));
    await guest.route('**/api/booking/public/availability*',async route=>{
      const response=await route.fetch(),data=await response.json();await route.fulfill({json:{...data,consultationUrl:'http://pf.kakao.com/_XRQdn/chat',busyDays:[{date,label:'마감'}],busySlots:[{startAt:date+'T12:30:00+09:00',endAt:date+'T15:00:00+09:00',label:'마감'}]}});
    });
    await guest.goto('/?view=visitor');await guest.waitForLoadState('networkidle');await guest.getByLabel('조회 월',{exact:true}).fill('2027-01');await guest.locator('.portal-calendar .days > button').nth(Number(date.slice(8))-1).click();
    await guest.locator('.portal-busy-slot').getByText('마감',{exact:true}).waitFor();assert.doesNotMatch(await guest.content(),/PRIVATE FLOW CLASS|PRIVATE VENUE/);
    const button=guest.locator('.portal-guest-action > a');assert.deepEqual(await button.evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor,s.borderRadius]}),['rgb(255, 255, 255)','rgb(29, 29, 31)','999px']);
    for(const width of [320,360,520,884,1440]){await guest.setViewportSize({width,height:1000});assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,engineName+' guest '+width);if([360,884].includes(width))await guest.screenshot({path:`${folder}/${engineName}-guest-${width}.png`,fullPage:true});}
    assert.equal((await visitor.request.get('/api/booking/calendar?month=2027-01')).status(),401);
    await api('/api/booking/admin',{action:'decideReservation',reservationId:bookingId,decision:'CANCELLED'});
    await student.close();await visitor.close();await context.close();
    report.checks.push(engineName+': bounded calendar/list, month navigation, keyboard date selection, filters, real booking confirmation, manual close/reopen, real course edit, native dialogs, private FLOW details, readable rounded consultation CTA, 320–1440px without horizontal overflow');
    console.log('PASS '+report.checks.at(-1));
  }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
