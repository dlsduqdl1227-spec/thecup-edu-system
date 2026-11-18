// Network-only. Do not cache pages, API responses, receipts or education material.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const clean=(value,max)=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f\s]+/g,' ').trim()).slice(0,max).join(''):'';
self.addEventListener('push',event=>{
 let input={};try{const value=event.data?.json();if(value&&typeof value==='object'&&!Array.isArray(value))input=value;}catch{}
 const audience=input.audience==='MEMBER'?'MEMBER':'STAFF';
 const topic=['consultations','reservations','home'].includes(input.topic)?input.topic:'home';
 const eventId=typeof input.eventId==='string'&&/^[a-f0-9]{32}$/.test(input.eventId)?input.eventId:'';
 event.waitUntil((async()=>{
  let displayed=false;
  try{await self.registration.showNotification(clean(input.title,60)||'더컵에듀',{
   body:clean(input.body,180)||'앱에서 새 알림을 확인해 주세요.',icon:'/icons/app-192.png',badge:'/icons/badge-96.png',
   tag:eventId?'thecup-edu:'+eventId:'thecup-edu',data:{audience,topic,eventId}
  });displayed=true;}
  finally{if(eventId)try{const subscription=await self.registration.pushManager.getSubscription();if(subscription)await fetch('/api/push',{
   method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ack',audience,endpoint:subscription.endpoint,eventId,displayed})
  });}catch{ /* A logged-out device must not regain access to acknowledge a push. */ }}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const data=event.notification.data||{},member=data.audience==='MEMBER';
  const topic=['consultations','reservations'].includes(data.topic)?data.topic:'home';
  const target=member?'/?view=student'+(topic==='reservations'?'&push=reservations':''):'/admin'+(topic!=='home'?'?push='+topic:'');
  const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const page=pages.find(p=>{try{const u=new URL(p.url);return u.origin===self.location.origin&&(member?u.pathname!=='/admin':u.pathname==='/admin');}catch{return false;}});
  if(page)try{const moved=await page.navigate(target);if(moved){await moved.focus();return;}}catch{}
  await self.clients.openWindow(target);
 })());
});
