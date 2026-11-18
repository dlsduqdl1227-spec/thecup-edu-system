import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['lib/push-preview.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {buildNotificationPreview:preview}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('each notification is identifiable in its title without expanding the body',()=>{
 const labels={CONSULTATION_NEW:'새 상담 신청',CONSULTATION_ASSIGNED:'담당 상담 배정',RESERVATION_REQUESTED:'새 예약 신청 · 승인 대기',RESERVATION_CONFIRMED:'예약 확정',RESERVATION_REJECTED:'예약 신청 미승인',RESERVATION_CANCELLED:'예약 취소',MEMBER_APPROVED:'수강생 이용 승인',TEST:'알림 미리보기 테스트'};
 for(const [kind,label] of Object.entries(labels)){const item=preview(kind,'STAFF');assert.equal(item.title,label+' · 더컵에듀');assert.ok(item.body.length>0);assert.ok(Array.from(item.body).length<=180);}
 assert.equal(preview('toString','STAFF').title,'새 알림 · 더컵에듀');
});
test('reservation previews include the exact Korean date, time and approved course label',()=>{
 const value=preview('RESERVATION_CONFIRMED','MEMBER',{startAt:'2026-11-24T09:00:00+09:00',endAt:'2026-11-24T11:30:00+09:00',courseKey:'barista:foundation'});
 assert.match(value.body,/2026년 11월 24일\(화\) 09:00–11:30 · 바리스타 · 파운데이션/);assert.match(value.body,/예약이 확정/);
 const utc=preview('RESERVATION_REQUESTED','STAFF',{startAt:'2026-11-23T23:30:00Z',endAt:'2026-11-24T02:00:00Z',courseKey:'brewing:intermediate'});
 assert.match(utc.body,/11월 24일\(화\) 08:30–11:00/);assert.match(utc.body,/브루잉 · 인터미디엇/);
 const local=preview('RESERVATION_CANCELLED','STAFF',{startAt:'2026-11-24T09:00',endAt:'2026-11-24T11:30',stationType:'ROASTING'});assert.match(local.body,/09:00–11:30 · 로스팅 시간대/);assert.match(local.body,/담당 일정/);
 const multi=preview('RESERVATION_CANCELLED','MEMBER',{startAt:'2026-12-31T23:00:00+09:00',endAt:'2027-01-01T01:00:00+09:00'});assert.match(multi.body,/2026년 12월 31일\(목\) 23:00–2027년 1월 1일\(금\) 01:00/);assert.match(multi.body,/내 예약/);
});
test('missing and malformed legacy fields cannot break notifications or expose untrusted text',()=>{
 for(const startAt of [null,'PRIVATE PHONE 01012345678','2026-02-31T09:00:00+09:00','2026-11-24T25:00','2026-11-24T09:00:00+99:00']){
  const value=preview('RESERVATION_REJECTED','MEMBER',{startAt,courseKey:'PRIVATE MEMO',stationType:'toString',name:'DO NOT SHOW',phone:'01012345678',courseName:'PRIVATE COURSE'});
  assert.match(value.body,/승인되지 않았습니다/);assert.doesNotMatch(value.body,/PRIVATE|DO NOT SHOW|01012345678|NaN|Invalid|function/);
 }
 const time=preview('RESERVATION_CONFIRMED','MEMBER',{startAt:'2026-11-24T09:00:00+09:00',endAt:'2026-11-24T08:00:00+09:00'});assert.doesNotMatch(time.body,/08:00/);
});
test('consultation summaries allow only catalog interests, deduplicate and bound long selections',()=>{
 const value=preview('CONSULTATION_NEW','STAFF',{interests:JSON.stringify(['barista:foundation','barista:foundation','PRIVATE MEMO','corporate','q-grader:course',{name:'DO NOT SHOW'}]),name:'DO NOT SHOW',phone:'01012345678',message:'PRIVATE MEMO'});
 assert.match(value.body,/바리스타 · 파운데이션 \/ 기업교육 외 1개/);assert.match(value.body,/상담 신청 1건/);assert.doesNotMatch(JSON.stringify(value),/PRIVATE|DO NOT SHOW|01012345678/);
 for(const interests of [null,'broken','{}','[null,{},123]'])assert.equal(preview('CONSULTATION_ASSIGNED','STAFF',{interests}).body,'새 담당 상담이 배정됐습니다. 상담 접수함에서 확인해 주세요.');
});
