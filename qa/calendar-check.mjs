// Two disposable local servers only. Does not log in to or write production.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder='outputs/qa/calendar';await mkdir(folder,{recursive:true});
const report={checks:[],errors:[]};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:process.env.QA_BROWSER}:{})});
 try{
  const edu=await browser.newContext({baseURL:'http://127.0.0.1:5174',viewport:{width:1440,height:960}});
  let r=await edu.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(r.status()!==201)assert.equal((await edu.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}})).status(),200);
  const page=await edu.newPage();page.on('pageerror',e=>report.errors.push(name+': '+e.message));
  await page.goto('/admin');await page.getByRole('button',{name:'상담 · 수업 관리',exact:true}).click();
  await page.getByRole('heading',{name:'기본 시간표는 자동으로.'}).waitFor();
  await page.getByRole('button',{name:'시간표·기존 예약·회원',exact:true}).click();
  await page.getByRole('navigation',{name:'예약 운영 메뉴'}).getByRole('button',{name:'스케줄',exact:true}).click();
  await page.getByRole('heading',{name:'추가 일정 만들기',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const widths=[320,360,390,520,640,768,884,1024,1025,1090,1280,1440,1920];
  for(const width of widths){
   await page.setViewportSize({width,height:850});await page.waitForTimeout(100);
   const issues=await page.evaluate(()=>{
    const out=[];if(document.documentElement.scrollWidth>innerWidth+1)out.push('page overflow '+document.documentElement.scrollWidth+'/'+innerWidth);
    for(const root of document.querySelectorAll('.booking-batch-builder,.booking-batch-config,.booking-batch-calendar,.calendar-sync-panel')){
     const b=root.getBoundingClientRect();if(b.left<0||b.right>innerWidth+1)out.push(root.className+' outside viewport');
     if(root.scrollWidth>root.clientWidth+2)out.push(root.className+' content overflow '+root.scrollWidth+'/'+root.clientWidth);
    }
    for(const el of document.querySelectorAll('.booking-batch-config input,.booking-batch-config button,.booking-batch-config select')){
     const b=el.getBoundingClientRect(),p=el.closest('.booking-batch-config').getBoundingClientRect();
     if(b.left<p.left-1||b.right>p.right+1)out.push(el.tagName+' outside configuration');
    }return out;
   });assert.deepEqual(issues,[],name+' '+width+'px');
   if([360,884,1090,1440].includes(width)){await page.locator('.booking-batch-builder').scrollIntoViewIfNeeded();await page.screenshot({path:`${folder}/${name}-schedule-${width}.png`});}
  }
  report.checks.push(`${name}: schedule and sync panel 320–1920px; no viewport, calendar or control overflow`);
  if(name==='chromium'){
   const flow=await browser.newContext({baseURL:'http://127.0.0.1:5176',viewport:{width:1280,height:900}});
   r=await flow.request.post('/api/auth',{data:{action:'setup',token:'local-calendar-qa',name:'QA FLOW 운영자',username:'calendarqa',code:'local-only-qa',team:'교육팀'}});
   if(r.status()!==200)assert.equal((await flow.request.post('/api/auth',{data:{action:'login',username:'calendarqa',code:'local-only-qa'}})).status(),200);
   const oldFixtures=(await(await flow.request.get('/api/state')).json()).records.filter(e=>e.data.title==='로컬 예약 차단 테스트');
   for(const e of oldFixtures)assert.equal((await flow.request.post('/api/actions',{data:{action:'delete',id:e.id,version:e.updatedAt}})).status(),200);
   await edu.request.post('/api/booking/calendar');
   const flowPage=await flow.newPage();flowPage.on('pageerror',e=>report.errors.push('FLOW: '+e.message));
   await flowPage.goto('/');await flowPage.waitForTimeout(2100);
   const calendarButton=flowPage.getByRole('button',{name:'캘린더',exact:true});await calendarButton.first().click();
   await flowPage.getByRole('button',{name:'이 날짜에 일정 추가',exact:true}).click();
   const checkbox=flowPage.getByRole('checkbox',{name:'더컵에듀 예약 차단',exact:true});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);await checkbox.check();assert.equal(await checkbox.isChecked(),true);
   await flowPage.screenshot({path:folder+'/flow-checkbox-desktop.png'});
   await flowPage.setViewportSize({width:360,height:800});assert.equal(await flowPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await flowPage.screenshot({path:folder+'/flow-checkbox-mobile.png'});
   const dates=['2027-01-12','2027-01-13'];
   const availability=async()=>await(await edu.request.get('/api/booking/public/availability?month=2027-01')).json();
   assert.ok((await availability()).slots.some(s=>s.startAt.startsWith(dates[0])));
   let saved=await flow.request.post('/api/actions',{data:{action:'create',kind:'event',data:{title:'로컬 예약 차단 테스트',start:dates[0]+'T10:00',end:dates[0]+'T11:00',eduBookingBlock:true}}});assert.equal(saved.status(),200,await saved.text());let event=(await saved.json()).entry;
   async function waitForDate(date,blocked){for(let attempt=0;attempt<40;attempt++){const slots=(await availability()).slots;if(slots.some(s=>s.startAt.startsWith(date))!==blocked)return;await new Promise(resolve=>setTimeout(resolve,250));}assert.fail('Immediate sync did not update '+date);}
   await waitForDate(dates[0],true);
   saved=await flow.request.post('/api/actions',{data:{action:'update',id:event.id,version:event.updatedAt,data:{start:dates[1]+'T10:00',end:dates[1]+'T11:00'}}});assert.equal(saved.status(),200);event=(await saved.json()).entry;
   await waitForDate(dates[0],false);await waitForDate(dates[1],true);
   saved=await flow.request.post('/api/actions',{data:{action:'delete',id:event.id,version:event.updatedAt}});assert.equal(saved.status(),200);await waitForDate(dates[1],false);
   report.checks.push('Real local FLOW save → authenticated webhook → EDU availability: blocked immediately; move releases old day; delete releases new day; no production writes');
   await flow.close();
  }
  await edu.close();
 }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
