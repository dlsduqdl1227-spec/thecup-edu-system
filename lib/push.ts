import {env} from "cloudflare:workers";
import {Buffer} from "node:buffer";
import {createECDH} from "node:crypto";
import webpush from "web-push";
import {AuthError, getSessionUser, sha256} from "./auth";
import {getMemberSession} from "./member-auth";
import {ensureDatabase,getD1} from "./db";
import {buildNotificationPreview,type PushPreviewContext} from "./push-preview";

export type PushAudience="STAFF"|"MEMBER";
export type PushActor={audience:PushAudience;id:number;sessionHash:string;securityVersion:string};
type PushEnv={WEB_PUSH_VAPID_PUBLIC_KEY?:string;WEB_PUSH_VAPID_PRIVATE_KEY?:string};
export type PushDevice={id:string;audience:PushAudience;actor_id:number;session_hash:string;security_version:string;endpoint:string;p256dh:string;auth:string;enabled:number;consultations:number;bookings:number;last_status:number;created_at:string};
export type PushCandidate=PushDevice&{eventId:string;kind:string;entityId:number;memberId:number|null;staffId:number|null;testDeviceId:string|null;eventCreatedAt:string};
export function pushKeys(){
  const values=env as unknown as PushEnv, publicKey=values.WEB_PUSH_VAPID_PUBLIC_KEY??"",privateKey=values.WEB_PUSH_VAPID_PRIVATE_KEY??"";
  try{
    if(!/^[A-Za-z0-9_-]{87}$/.test(publicKey)||!/^[A-Za-z0-9_-]{43}$/.test(privateKey))return null;
    const key=createECDH("prime256v1");key.setPrivateKey(Buffer.from(privateKey,"base64url"));
    if(key.getPublicKey().toString("base64url")!==publicKey)return null;
    return {publicKey,privateKey};
  }catch{return null;}
}
export async function activatePush(){
  await ensureDatabase();
  if(!pushKeys())return false;
  await getD1().prepare("UPDATE edu_push_control SET enabled=1,activated_at=? WHERE id=1 AND enabled=0").bind(new Date().toISOString()).run();
  return true;
}
export async function pushActor(request:Request,audience:unknown):Promise<PushActor>{
  if(audience!=="STAFF"&&audience!=="MEMBER")throw new AuthError("알림 계정 구분을 확인해 주세요.",400);
  const user=audience==="STAFF"?await getSessionUser(request):await getMemberSession(request);
  if(!user)throw new AuthError("로그인 후 알림을 설정해 주세요.",401);
  const cookieName=audience==="STAFF"?"thecup_session":"thecup_member_session";
  const token=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(cookieName+"="))?.slice(cookieName.length+1)??"";
  return {audience,id:user.id,sessionHash:await sha256(token),securityVersion:token.split(".")[0]};
}
export function validPushEndpoint(value:unknown):value is string{
  if(typeof value!=="string"||value.length>4096)return false;
  try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&!url.hash&&(
    url.hostname==="fcm.googleapis.com"||url.hostname==="updates.push.services.mozilla.com"||url.hostname.endsWith(".push.services.mozilla.com")||url.hostname==="web.push.apple.com"||url.hostname.endsWith(".notify.windows.com"));}catch{return false;}
}
export function validPushKeys(value:unknown):value is {p256dh:string;auth:string}{
  if(!value||typeof value!=="object")return false;
  const keys=value as {p256dh?:unknown;auth?:unknown};
  if(typeof keys.p256dh!=="string"||typeof keys.auth!=="string"||!/^[-_A-Za-z0-9]{87}={0,2}$/.test(keys.p256dh)||!/^[-_A-Za-z0-9]{22}={0,2}$/.test(keys.auth))return false;
  try{const pub=Buffer.from(keys.p256dh,"base64url"),auth=Buffer.from(keys.auth,"base64url");if(pub.length!==65||pub[0]!==4||auth.length!==16)return false;const ec=createECDH("prime256v1");ec.generateKeys();ec.computeSecret(pub);return true;}catch{return false;}
}
export const validPushSessionSQL=(s="s")=>`(
  ${s}.security_version=COALESCE(json_extract((SELECT value FROM app_settings WHERE key=CASE ${s}.audience WHEN 'STAFF' THEN 'auth_security_operator' ELSE 'auth_security_student' END),'$.version'),'')
  AND ((${s}.audience='STAFF' AND EXISTS(SELECT 1 FROM sessions x JOIN staff u ON u.id=x.staff_id
    WHERE x.token_hash=${s}.session_hash AND x.staff_id=${s}.actor_id AND x.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND u.active=1 AND u.deleted_at IS NULL))
   OR (${s}.audience='MEMBER' AND EXISTS(SELECT 1 FROM member_sessions x JOIN booking_members m ON m.id=x.member_id
    WHERE x.token_hash=${s}.session_hash AND x.member_id=${s}.actor_id AND x.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND m.approval_status='APPROVED' AND m.deleted_at IS NULL))))`;

export function notificationPayload(event:Pick<PushCandidate,"kind"|"audience"|"eventId">,context:PushPreviewContext={}){
  return {...buildNotificationPreview(event.kind,event.audience,context),eventId:event.eventId,audience:event.audience,
    topic:event.kind.startsWith("CONSULTATION")?"consultations":event.kind.startsWith("RESERVATION")?"reservations":"home"};
}
export async function sendWebPush(device:PushCandidate,payload:ReturnType<typeof notificationPayload>){
  const keys=pushKeys();if(!keys)throw new Error("push_not_configured");
  if(!validPushEndpoint(device.endpoint)||!validPushKeys(device))return 410;
  const details=webpush.generateRequestDetails({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify(payload),{
    vapidDetails:{subject:"https://thecup-edu.pages.dev/",...keys},TTL:3600,urgency:"high",contentEncoding:"aes128gcm"});
  const response=await fetch(details.endpoint,{method:"POST",headers:details.headers,body:new Uint8Array(details.body),redirect:"manual",signal:AbortSignal.timeout(7000)});
  await response.body?.cancel();return response.status;
}
async function sourcePreview(row:PushCandidate):Promise<PushPreviewContext|null>{
  const db=getD1();
  if(row.kind==="TEST")return row.testDeviceId===row.id?{}:null;
  if(row.kind==="MEMBER_APPROVED")return row.audience==="MEMBER"&&row.memberId===row.actor_id&&await db.prepare("SELECT 1 FROM booking_members WHERE id=? AND approval_status='APPROVED' AND deleted_at IS NULL").bind(row.entityId).first()?{}:null;
  if(row.kind.startsWith("CONSULTATION")){
    const consult=await db.prepare(`SELECT c.status,c.instructor_id AS teacher,c.interests FROM learning_consultations c JOIN booking_members m ON m.id=c.member_id WHERE c.id=? AND c.deleted_at IS NULL AND m.deleted_at IS NULL`).bind(row.entityId).first<{status:string;teacher:number|null;interests:string}>();
    if(!consult||consult.status==="CLOSED"||row.audience!=="STAFF")return null;
    const allowed=row.kind==="CONSULTATION_NEW"
      ?consult.status==="NEW"&&Boolean(await db.prepare("SELECT 1 FROM staff WHERE id=? AND role='admin'").bind(row.actor_id).first())
      :consult.teacher===row.actor_id&&row.staffId===row.actor_id&&Boolean(await db.prepare("SELECT 1 FROM staff WHERE id=? AND role IN ('admin','instructor')").bind(row.actor_id).first());
    return allowed?{interests:consult.interests}:null;
  }
  if(!row.kind.startsWith("RESERVATION_"))return null;
  const booking=await db.prepare(`SELECT r.member_id AS memberId,r.status,e.instructor_id AS teacher,r.slot_start_at AS startAt,sl.end_at AS endAt,e.course_key AS courseKey,st.type AS stationType FROM reservations r
    JOIN booking_members m ON m.id=r.member_id JOIN booking_slots sl ON sl.id=r.slot_id JOIN stations st ON st.id=sl.station_id LEFT JOIN course_enrollments e ON e.id=r.enrollment_id
    WHERE r.id=? AND m.deleted_at IS NULL AND m.approval_status='APPROVED'`).bind(row.entityId).first<{memberId:number;status:string;teacher:number|null}&PushPreviewContext>();
  if(!booking||row.memberId!==booking.memberId||row.kind!=="RESERVATION_"+booking.status)return null;
  const allowed=row.audience==="MEMBER"?booking.memberId===row.actor_id&&row.kind!=="RESERVATION_REQUESTED"
    :["RESERVATION_REQUESTED","RESERVATION_CANCELLED"].includes(row.kind)&&Boolean(await db.prepare("SELECT 1 FROM staff WHERE id=? AND (role='admin' OR (role='instructor' AND id=?))").bind(row.actor_id,booking.teacher).first());
  return allowed?{startAt:booking.startAt,endAt:booking.endAt,courseKey:booking.courseKey,stationType:booking.stationType}:null;
}
export async function dispatchPush({limit=8,send=sendWebPush}:{limit?:number;send?:(device:PushCandidate,payload:ReturnType<typeof notificationPayload>)=>Promise<number>}={}){
  if(!await activatePush())return {configured:false,accepted:0,failed:0};
  const db=getD1(),now=Date.now();
  await db.prepare(`UPDATE edu_push_subscriptions AS s SET enabled=0 WHERE enabled=1 AND NOT ${validPushSessionSQL()}`).run();
  const rows=(await db.prepare(`SELECT s.*,e.id AS eventId,e.kind,e.entity_id AS entityId,e.member_id AS memberId,e.staff_id AS staffId,
    e.test_device_id AS testDeviceId,e.created_at AS eventCreatedAt FROM edu_push_events e JOIN edu_push_subscriptions s
    ON s.enabled=1 AND e.created_at>=s.created_at
    WHERE e.created_at>=? AND (e.kind='TEST' OR e.created_at>=CASE WHEN e.kind LIKE 'CONSULTATION_%' THEN s.consultations_since ELSE s.bookings_since END)
    AND ${validPushSessionSQL()} AND (
      (e.kind='TEST' AND e.test_device_id=s.id) OR
      (e.kind='MEMBER_APPROVED' AND s.audience='MEMBER' AND s.actor_id=e.member_id AND s.bookings=1) OR
      (e.kind='CONSULTATION_NEW' AND s.audience='STAFF' AND s.consultations=1 AND EXISTS(SELECT 1 FROM staff u WHERE u.id=s.actor_id AND u.role='admin')) OR
      (e.kind='CONSULTATION_ASSIGNED' AND s.audience='STAFF' AND s.consultations=1 AND s.actor_id=e.staff_id) OR
      (e.kind LIKE 'RESERVATION_%' AND s.bookings=1 AND (
        (s.audience='MEMBER' AND s.actor_id=e.member_id AND e.kind<>'RESERVATION_REQUESTED') OR
        (s.audience='STAFF' AND e.kind IN ('RESERVATION_REQUESTED','RESERVATION_CANCELLED') AND EXISTS(SELECT 1 FROM staff u WHERE u.id=s.actor_id AND
          (u.role='admin' OR (u.role='instructor' AND EXISTS(SELECT 1 FROM reservations r JOIN course_enrollments c ON c.id=r.enrollment_id WHERE r.id=e.entity_id AND c.instructor_id=u.id))))))))
    AND NOT EXISTS(SELECT 1 FROM edu_push_deliveries d WHERE d.event_id=e.id AND d.subscription_id=s.id AND
      (d.state IN ('ACCEPTED','DISPLAYED','FAILED','SKIPPED') OR d.attempts>=3 OR d.lease_until>? OR d.retry_at>?))
    ORDER BY CASE e.kind WHEN 'TEST' THEN 0 ELSE 1 END,e.created_at,e.id LIMIT ?`)
    .bind(new Date(now-86400000).toISOString(),now,now,Math.max(1,Math.min(16,Math.floor(limit)))).all<PushCandidate>()).results;
  let accepted=0,failed=0;
  async function deliver(row:PushCandidate){
    await db.prepare("INSERT OR IGNORE INTO edu_push_deliveries(event_id,subscription_id,session_hash) VALUES (?,?,?)").bind(row.eventId,row.id,row.session_hash).run();
    const claim=await db.prepare("UPDATE edu_push_deliveries SET state='SENDING',attempts=attempts+1,lease_until=? WHERE event_id=? AND subscription_id=? AND state IN ('PENDING','SENDING') AND attempts<3 AND lease_until<=? AND retry_at<=?").bind(Date.now()+30000,row.eventId,row.id,Date.now(),Date.now()).run();
    if(!claim.meta.changes)return;
    const current=await db.prepare(`SELECT 1 FROM edu_push_subscriptions s WHERE s.id=? AND s.session_hash=? AND s.audience=? AND s.actor_id=? AND s.enabled=1 AND ${validPushSessionSQL()}`).bind(row.id,row.session_hash,row.audience,row.actor_id).first();
    const preview=current?await sourcePreview(row):null;
    if(!preview){
      await db.prepare("UPDATE edu_push_deliveries SET state='SKIPPED',lease_until=0 WHERE event_id=? AND subscription_id=?").bind(row.eventId,row.id).run();return;
    }
    let status=0;try{status=await send(row,notificationPayload(row,preview));}catch{ /* Retry without logging endpoint credentials. */ }
    const ok=status>=200&&status<300,terminal=[400,401,403,404,410].includes(status)||status>=300&&status<400;
    await db.batch([
      db.prepare("UPDATE edu_push_subscriptions SET last_status=?,enabled=CASE WHEN ? IN (404,410) THEN 0 ELSE enabled END,updated_at=? WHERE id=? AND session_hash=?").bind(status,status,new Date().toISOString(),row.id,row.session_hash),
      db.prepare(`UPDATE edu_push_deliveries SET state=CASE WHEN displayed_at IS NOT NULL THEN 'DISPLAYED' WHEN ?=1 THEN 'ACCEPTED'
        WHEN ?=1 OR attempts>=3 THEN 'FAILED' ELSE 'PENDING' END,provider_status=?,lease_until=0,retry_at=?,updated_at=? WHERE event_id=? AND subscription_id=?`)
        .bind(ok?1:0,terminal?1:0,status,Date.now()+30000,new Date().toISOString(),row.eventId,row.id),
    ]);
    if(ok)accepted++;else failed++;
  }
  for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(deliver));
  return {configured:true,accepted,failed};
}
export async function scheduledPush(){
  const result=await dispatchPush();
  await getD1().batch([
    getD1().prepare("DELETE FROM edu_push_deliveries WHERE event_id IN (SELECT id FROM edu_push_events WHERE created_at<?)").bind(new Date(Date.now()-30*86400000).toISOString()),
    getD1().prepare("DELETE FROM edu_push_events WHERE created_at<?").bind(new Date(Date.now()-30*86400000).toISOString()),
  ]);
  return result;
}
