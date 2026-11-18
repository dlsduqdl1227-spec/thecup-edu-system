import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function worker({showNotification=async()=>{},pages=[]}={}){
 const handlers={},calls=[],opened=[],visible=[];
 const self={location:{origin:'https://thecup.test'},registration:{showNotification:async(...args)=>{visible.push(args);return showNotification(...args);},pushManager:{getSubscription:async()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture'})}},clients:{claim:async()=>{},matchAll:async()=>pages,openWindow:async url=>opened.push(url)},skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,fetch:async(url,options)=>{calls.push({url,options});return new Response('{}');}});
 const dispatch=(name,event)=>{let result;handlers[name]({...event,waitUntil:p=>{result=p;}});return result;};
 return {handlers,calls,opened,visible,dispatch};
}
test('service worker is network-only and confirms display only after showNotification succeeds',async()=>{
 let release;const w=worker({showNotification:()=>new Promise(resolve=>release=resolve)}),id='a'.repeat(32);
 const pending=w.dispatch('push',{data:{json:()=>({eventId:id,audience:'MEMBER',topic:'reservations',title:'더컵에듀',body:'예약이 확정되었습니다.'})}});assert.equal(w.calls.length,0);release();await pending;
 assert.equal(w.calls.length,1);assert.equal(w.calls[0].url,'/api/push');assert.equal(JSON.parse(w.calls[0].options.body).displayed,true);assert.equal(w.handlers.fetch,undefined);assert.ok(!w.calls[0].options.body.includes('예약이 확정'));
});
test('denied device notifications report failure instead of falsely marking success',async()=>{
 const w=worker({showNotification:async()=>{throw Error('permission denied');}});
 await assert.rejects(w.dispatch('push',{data:{json:()=>({eventId:'b'.repeat(32)})}}),/permission denied/);assert.equal(JSON.parse(w.calls[0].options.body).displayed,false);
});
test('malformed payloads remain visible and cannot redirect outside the app or leak arbitrary data in an ack',async()=>{
 const w=worker();await w.dispatch('push',{data:{json:()=>{throw Error('bad JSON');}}});assert.equal(w.visible[0][0],'더컵에듀');assert.equal(w.calls.length,0);
 await w.dispatch('notificationclick',{notification:{close(){},data:{url:'https://evil.test/',audience:'MEMBER',topic:'https://evil.test/'}}});assert.equal(w.opened[0],'/?view=student');
});
test('clicks navigate a same-origin matching account page and do not focus a foreign site',async()=>{
 const navigated=[],w=worker({pages:[{url:'https://evil.test/admin',navigate:async()=>{throw Error('foreign');}},{url:'https://thecup.test/admin',navigate:async url=>{navigated.push(url);return {focus:async()=>{}};}}]});
 await w.dispatch('notificationclick',{notification:{close(){},data:{audience:'STAFF',topic:'consultations'}}});assert.deepEqual(navigated,['/admin?push=consultations']);assert.equal(w.opened.length,0);
});
