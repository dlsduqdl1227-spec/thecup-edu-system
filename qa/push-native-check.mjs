// Real Chromium SW with a DevTools-injected push, not a real user's push provider.
// Confirms closed app-tab delivery without a production account.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['lib/push-preview.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {buildNotificationPreview}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
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
 const examples=[['CONSULTATION_NEW','STAFF'],['RESERVATION_REQUESTED','STAFF'],['RESERVATION_CONFIRMED','MEMBER'],['RESERVATION_CANCELLED','MEMBER']].map(([kind,audience],index)=>({...buildNotificationPreview(kind,audience,{interests:'["barista:foundation"]',courseKey:'barista:foundation',startAt:'2026-11-24T09:00:00+09:00',endAt:'2026-11-24T11:30:00+09:00'}),eventId:String(index+1).repeat(32),audience,topic:kind.startsWith('CONSULTATION')?'consultations':'reservations'}));
 for(const example of examples)await session.send('ServiceWorker.deliverPushMessage',{origin:'http://127.0.0.1:5177',registrationId:registration.registrationId,data:JSON.stringify(example)});
 for(let i=0;i<40&&!context.serviceWorkers().length;i++)await new Promise(r=>setTimeout(r,100));
 const worker=context.serviceWorkers().find(w=>w.url()==='http://127.0.0.1:5177/sw.js');assert.ok(worker);
 let notes=[];for(let i=0;i<40;i++){notes=await worker.evaluate(async()=>Array.from(await self.registration.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag})));if(notes.length===examples.length)break;await new Promise(r=>setTimeout(r,100));}
 for(const example of examples){const note=notes.find(n=>n.tag==='thecup-edu:'+example.eventId);assert.equal(note?.title,example.title);assert.equal(note?.body,example.body.replace(/\s+/g,' ').trim());}
 // A synthetic notificationclick cannot grant native user activation/openWindow.
 // Fixed-route click behavior is tested separately in push-service-worker.test.mjs.
 console.log('PASS native Chromium root SW: app tab closed → 4 injected consultation/reservation pushes → exact event titles, catalog course and KST schedule previews. OS permission was simulated; no real push-provider, native click or phone delivery claimed.');
}finally{await browser.close();}
