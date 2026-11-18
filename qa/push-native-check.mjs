// Real Chromium SW with a DevTools-injected push, not a real user's push provider.
// Confirms closed app-tab delivery without a production account.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
try{
 const context=await browser.newContext({permissions:['notifications']}),control=await context.newPage();
 const session=await context.newCDPSession(control),registrations=[];
 session.on('ServiceWorker.workerRegistrationUpdated',e=>registrations.push(...e.registrations));await session.send('ServiceWorker.enable');
 const page=await context.newPage();await page.goto('http://127.0.0.1:5177/?home=1');
 await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration('/'))?.active),{timeout:20000});
 await page.evaluate(()=>navigator.serviceWorker.ready);
 const registration=registrations.find(r=>r.scopeURL==='http://127.0.0.1:5177/'&&!r.isDeleted);assert.ok(registration,'native root registration');
 await page.close();assert.equal(context.pages().filter(p=>p.url().startsWith('http://127.0.0.1:5177')).length,0);
 await session.send('ServiceWorker.deliverPushMessage',{origin:'http://127.0.0.1:5177',registrationId:registration.registrationId,data:JSON.stringify({title:'더컵에듀 테스트 알림',body:'새 상담이 접수되었습니다.',eventId:'1'.repeat(32),audience:'STAFF',topic:'consultations'})});
 for(let i=0;i<40&&!context.serviceWorkers().length;i++)await new Promise(r=>setTimeout(r,100));
 const worker=context.serviceWorkers().find(w=>w.url()==='http://127.0.0.1:5177/sw.js');assert.ok(worker);
 let notes=[];for(let i=0;i<40;i++){notes=await worker.evaluate(async()=>Array.from(await self.registration.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag})));if(notes.length)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(notes[0]?.title,'더컵에듀 테스트 알림');assert.equal(notes[0]?.tag,'thecup-edu:'+'1'.repeat(32));
 // A synthetic notificationclick cannot grant native user activation/openWindow.
 // Fixed-route click behavior is tested separately in push-service-worker.test.mjs.
 console.log('PASS native Chromium root SW: app tab closed → DevTools-injected push → notification entry. OS permission was simulated; no real push-provider, native click or phone delivery claimed.');
}finally{await browser.close();}
