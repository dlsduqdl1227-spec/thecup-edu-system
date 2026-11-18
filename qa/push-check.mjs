// Only localhost. Mock the OS subscription, never a real provider or production user.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createECDH,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const report={checks:[],errors:[]},folder='outputs/qa/push';await mkdir(folder,{recursive:true});
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(engineName==='chromium'?{executablePath:process.env.QA_BROWSER}:{})});
 try{
  const ctx=await browser.newContext({baseURL:'http://127.0.0.1:5177',viewport:{width:1440,height:900}});
  let r=await ctx.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(r.status()!==201)assert.equal((await ctx.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}})).status(),200);
  const ec=createECDH('prime256v1');ec.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/LOCAL-QA-'+engineName,keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  await ctx.addInitScript(({subscription})=>{
   let linked=false;let permission='default';
   const notification=function(){};Object.defineProperty(notification,'permission',{get:()=>permission});notification.requestPermission=async()=>{permission='granted';return permission;};
   Object.defineProperty(window,'Notification',{value:notification,configurable:true});
   Object.defineProperty(window,'PushManager',{value:function(){},configurable:true});
   const device={...subscription,options:{},toJSON(){return subscription;},unsubscribe:async()=>{linked=false;return true;}};
   const registration={update:async()=>{},pushManager:{getSubscription:async()=>linked?device:null,subscribe:async()=>{linked=true;return device;}}};
   Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,getRegistration:async()=>registration,ready:Promise.resolve(registration)},configurable:true});
  },{subscription});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(engineName+': '+e.message));
  await page.goto('/admin');await page.getByRole('button',{name:/알림 설정/}).click();
  const dialog=page.getByRole('dialog',{name:'기기 알림 설정'});await dialog.waitFor();
  await dialog.getByRole('button',{name:'이 기기 알림 켜기',exact:true}).click();await dialog.getByText('이 기기 알림 켜짐',{exact:true}).waitFor();
  assert.equal((await ctx.request.get('/api/push?audience=STAFF')).status(),200);
  await dialog.getByLabel('상담 접수·배정',{exact:true}).uncheck();await dialog.getByRole('button',{name:'선택 저장'}).click();await dialog.getByText('알림 종류를 저장했습니다.',{exact:true}).waitFor();
  let state=await(await ctx.request.post('/api/push',{data:{action:'status',audience:'STAFF',endpoint:subscription.endpoint}})).json();assert.equal(state.consultations,false);
  await dialog.getByRole('button',{name:'테스트 알림 보내기'}).click();await dialog.getByText('테스트 알림 확인 중',{exact:true}).waitFor();
  state=await(await ctx.request.post('/api/push',{data:{action:'status',audience:'STAFF',endpoint:subscription.endpoint}})).json();assert.equal(state.test.state,'PENDING');
  for(const width of [320,360,390,520,768,884,1024,1440,1920]){
   await page.setViewportSize({width,height:800});
   const issues=await dialog.evaluate(el=>{const b=el.getBoundingClientRect();return [b.left<0,b.right>innerWidth+1,el.scrollWidth>el.clientWidth+2,document.documentElement.scrollWidth>innerWidth+1].some(Boolean);});assert.equal(issues,false,engineName+' '+width+'px');
   if([360,1440].includes(width))await page.screenshot({path:`${folder}/${engineName}-staff-${width}.png`});
  }
  await dialog.getByRole('button',{name:'이 기기 알림 끄기'}).click();await dialog.getByText('이 계정의 기기 알림을 껐습니다.',{exact:true}).waitFor();
  state=await(await ctx.request.post('/api/push',{data:{action:'status',audience:'STAFF',endpoint:subscription.endpoint}})).json();assert.equal(state.enabled,false);
  await page.waitForFunction(()=>document.querySelector('dialog')?.getAttribute('aria-busy')==='false');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.match(await page.evaluate(()=>document.activeElement?.textContent),/알림 설정/);
  report.checks.push(engineName+': staff enable, save preferences, queued-test feedback, disable, Escape/focus return; 320–1920px no overflow');
  const suffix=Date.now().toString().slice(-6)+(engineName==='chromium'?'1':'2'),studentName='알림 QA '+engineName+' '+suffix,phone='0107'+suffix;
  r=await ctx.request.post('/api/booking/admin',{data:{action:'createMember',name:studentName,phone,approvalStatus:'APPROVED'}});assert.equal(r.status(),201,await r.text());
  const student=await browser.newContext({baseURL:'http://127.0.0.1:5177',viewport:{width:360,height:800}});
  // UI-only checks; native SW is independently checked in Chromium and the SW VM suite.
  // Windows WebKit's service-worker process may hang on localhost registration.
  const noNativeWorker=()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}}),getRegistration:async()=>null},configurable:true});
  await student.addInitScript(noNativeWorker);
  r=await student.request.post('/api/member-auth/login',{data:{name:studentName,phone,securityCode:'08372'}});assert.equal(r.status(),200,await r.text());
  const s=await student.newPage();s.on('pageerror',e=>report.errors.push(engineName+' student: '+e.message));await s.goto('/?view=student');
  await s.waitForLoadState('networkidle');await s.evaluate(()=>document.fonts.ready);
  try{await s.getByRole('button',{name:/알림 설정/}).click();}catch(error){await s.screenshot({path:`${folder}/${engineName}-student-error.png`});console.log(await s.getByRole('button',{name:/알림 설정/}).evaluate(el=>({html:el.outerHTML,bounds:el.getBoundingClientRect().toJSON(),scroll:scrollY})));throw error;}await s.getByRole('dialog',{name:'기기 알림 설정'}).waitFor();
  await s.getByText(/본인의 예약 소식/).waitFor();assert.equal(await s.getByLabel('상담 접수·배정',{exact:true}).count(),0);
  assert.equal(await s.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await s.screenshot({path:`${folder}/${engineName}-student-360.png`});
  report.checks.push(engineName+': approved student notification settings opens without staff controls or consultation data');
  await student.close();await ctx.close();
  if(engineName==='webkit'){
   const iphone=await browser.newContext({baseURL:'http://127.0.0.1:5177',viewport:{width:390,height:844},isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'});
   await iphone.addInitScript(noNativeWorker);
   await iphone.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}});const p=await iphone.newPage();await p.goto('/admin');await p.getByRole('button',{name:/알림 설정/}).click();await p.getByText('Safari의 공유 버튼을 누릅니다.',{exact:true}).waitFor();await p.screenshot({path:folder+'/iphone-install.png'});report.checks.push('iPhone Safari displays Home Screen installation instructions, without triggering a permission popup');await iphone.close();
  }
 }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
