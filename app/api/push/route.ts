import {AuthError,sha256} from "../../../lib/auth";
import {ensureDatabase,getD1} from "../../../lib/db";
import {assertSameOrigin,jsonError} from "../../../lib/http";
import {activatePush,pushActor,pushKeys,validPushEndpoint,validPushKeys,type PushActor,type PushDevice} from "../../../lib/push";

const headers={"Cache-Control":"private, no-store","Vary":"Cookie"};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
async function inputJSON(request:Request):Promise<Record<string,unknown>>{
  if(!request.headers.get("content-type")?.includes("application/json"))throw new AuthError("요청 형식을 확인해 주세요.",400);
  const reader=request.body?.getReader();if(!reader)throw new AuthError("입력 내용을 확인해 주세요.",400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new AuthError("알림 설정 정보가 너무 큽니다.",413);}chunks.push(value);}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  try{const parsed=JSON.parse(new TextDecoder().decode(body));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();return parsed;}catch{throw new AuthError("입력 내용을 확인해 주세요.",400);}
}
async function ownDevice(actor:PushActor,endpoint:unknown){
  if(!validPushEndpoint(endpoint))throw new AuthError("이 기기의 알림 정보를 다시 확인해 주세요.",400);
  const device=await getD1().prepare("SELECT * FROM edu_push_subscriptions WHERE endpoint_hash=? AND audience=? AND actor_id=?").bind(await sha256(endpoint),actor.audience,actor.id).first<PushDevice&{last_test_id:string|null}>();
  if(!device)throw new AuthError("이 계정에서 이 기기의 알림을 먼저 켜 주세요.",404);
  return device;
}
export async function GET(request:Request){
  try{
    await ensureDatabase();const actor=await pushActor(request,new URL(request.url).searchParams.get("audience")||"STAFF");
    const configured=await activatePush(),keys=pushKeys();
    const count=await getD1().prepare("SELECT COUNT(*) AS n FROM edu_push_subscriptions WHERE audience=? AND actor_id=? AND enabled=1").bind(actor.audience,actor.id).first<{n:number}>();
    return json({configured,publicKey:keys?.publicKey??"",devices:count?.n??0});
  }catch(error){return jsonError(error);}
}
export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    if(request.headers.get("sec-fetch-site")==="cross-site")throw new AuthError("허용되지 않은 요청입니다.",403);
    const input=await inputJSON(request);await ensureDatabase();const actor=await pushActor(request,input.audience||"STAFF"),db=getD1();
    if(input.action==="subscribe"){
      if(!await activatePush())throw new AuthError("알림 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",503);
      const sub=input.subscription as {endpoint?:unknown;keys?:unknown}|undefined;
      if(!sub||!validPushEndpoint(sub.endpoint)||!validPushKeys(sub.keys))throw new AuthError("알림 구독 정보가 올바르지 않습니다.",400);
      for(const key of ["consultations","bookings"])if(input[key]!==undefined&&typeof input[key]!=="boolean")throw new AuthError("알림 종류를 확인해 주세요.",400);
      const at=new Date().toISOString();
      await db.prepare(`INSERT INTO edu_push_subscriptions(id,audience,actor_id,session_hash,security_version,endpoint_hash,endpoint,p256dh,auth,enabled,consultations,bookings,consultations_since,bookings_since,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET audience=excluded.audience,actor_id=excluded.actor_id,
        session_hash=excluded.session_hash,security_version=excluded.security_version,p256dh=excluded.p256dh,auth=excluded.auth,enabled=1,last_status=0,
        consultations=excluded.consultations,bookings=excluded.bookings,
        consultations_since=CASE WHEN edu_push_subscriptions.actor_id=excluded.actor_id AND edu_push_subscriptions.audience=excluded.audience AND edu_push_subscriptions.session_hash=excluded.session_hash AND edu_push_subscriptions.enabled=1 AND edu_push_subscriptions.consultations=1 THEN edu_push_subscriptions.consultations_since ELSE excluded.consultations_since END,
        bookings_since=CASE WHEN edu_push_subscriptions.actor_id=excluded.actor_id AND edu_push_subscriptions.audience=excluded.audience AND edu_push_subscriptions.session_hash=excluded.session_hash AND edu_push_subscriptions.enabled=1 AND edu_push_subscriptions.bookings=1 THEN edu_push_subscriptions.bookings_since ELSE excluded.bookings_since END,
        created_at=CASE WHEN edu_push_subscriptions.audience=excluded.audience AND edu_push_subscriptions.actor_id=excluded.actor_id
          AND edu_push_subscriptions.session_hash=excluded.session_hash AND edu_push_subscriptions.enabled=1 THEN edu_push_subscriptions.created_at ELSE excluded.created_at END,
        updated_at=excluded.updated_at`)
        .bind(crypto.randomUUID(),actor.audience,actor.id,actor.sessionHash,actor.securityVersion,await sha256(sub.endpoint),sub.endpoint,sub.keys.p256dh,sub.keys.auth,
          input.consultations===false?0:1,input.bookings===false?0:1,at,at,at,at).run();
      return json({ok:true});
    }
    const device=await ownDevice(actor,input.endpoint),bound=device.session_hash===actor.sessionHash&&device.security_version===actor.securityVersion;
    if(input.action==="status"){
      const testId=typeof input.testId==="string"&&/^[a-f0-9]{32}$/.test(input.testId)?input.testId:device.last_test_id;
      const test=bound&&testId?await db.prepare(`SELECT e.id AS id,e.created_at AS requestedAt,COALESCE(d.state,'PENDING') AS state,
        d.provider_status AS providerStatus,d.displayed_at AS displayedAt
        FROM edu_push_events e LEFT JOIN edu_push_deliveries d ON d.event_id=e.id AND d.subscription_id=? AND d.session_hash=?
        WHERE e.id=? AND e.kind='TEST' AND e.test_device_id=? AND e.created_at>=?`).bind(device.id,actor.sessionHash,testId,device.id,device.created_at).first():null;
      return json({enabled:!!device.enabled,bound,lastStatus:device.last_status,consultations:!!device.consultations,bookings:!!device.bookings,test});
    }
    if(!bound)throw new AuthError("다시 로그인한 계정에 알림을 연결해 주세요.",409);
    if(input.action==="unsubscribe"){
      await db.prepare("UPDATE edu_push_subscriptions SET enabled=0,updated_at=? WHERE id=? AND session_hash=?").bind(new Date().toISOString(),device.id,actor.sessionHash).run();
      return json({ok:true});
    }
    if(input.action==="preferences"){
      if(typeof input.consultations!=="boolean"||typeof input.bookings!=="boolean")throw new AuthError("알림 종류를 선택해 주세요.",400);
      const at=new Date().toISOString();
      await db.prepare(`UPDATE edu_push_subscriptions SET consultations_since=CASE WHEN consultations=0 AND ?=1 THEN ? ELSE consultations_since END,
        bookings_since=CASE WHEN bookings=0 AND ?=1 THEN ? ELSE bookings_since END,consultations=?,bookings=?,updated_at=? WHERE id=? AND session_hash=?`)
        .bind(input.consultations?1:0,at,input.bookings?1:0,at,input.consultations?1:0,input.bookings?1:0,at,device.id,actor.sessionHash).run();
      return json({ok:true});
    }
    if(input.action==="test"){
      if(!device.enabled)throw new AuthError("이 기기의 알림을 먼저 켜 주세요.",409);
      if(!await activatePush())throw new AuthError("알림 서버가 준비되지 않았습니다.",503);
      const id=crypto.randomUUID().replaceAll("-",""),at=new Date().toISOString(),cutoff=new Date(Date.now()-30000).toISOString();
      const results=await db.batch([
        db.prepare("UPDATE edu_push_subscriptions SET last_test_at=?,last_test_id=? WHERE id=? AND session_hash=? AND enabled=1 AND (last_test_at IS NULL OR last_test_at<=?)").bind(at,id,device.id,actor.sessionHash,cutoff),
        db.prepare("INSERT INTO edu_push_events(id,kind,test_device_id) SELECT ?,'TEST',id FROM edu_push_subscriptions WHERE id=? AND last_test_id=? AND session_hash=?").bind(id,device.id,id,actor.sessionHash),
      ]);
      if(!results[0].meta.changes)throw new AuthError("테스트 알림은 30초 후 다시 요청해 주세요.",429,30);
      return json({ok:true,testId:id,pending:true},202);
    }
    if(input.action==="ack"){
      if(typeof input.eventId!=="string"||!/^[a-f0-9]{32}$/.test(input.eventId)||typeof input.displayed!=="boolean")throw new AuthError("알림 확인 정보가 올바르지 않습니다.",400);
      const result=await db.prepare(`UPDATE edu_push_deliveries SET state=?,displayed_at=?,updated_at=? WHERE event_id=? AND subscription_id=? AND session_hash=?`)
        .bind(input.displayed?"DISPLAYED":"FAILED",input.displayed?new Date().toISOString():null,new Date().toISOString(),input.eventId,device.id,actor.sessionHash).run();
      return json({ok:!!result.meta.changes},result.meta.changes?200:404);
    }
    throw new AuthError("지원하지 않는 알림 작업입니다.",400);
  }catch(error){
    if(String(error).includes("edu_push_device_limit"))return json({error:"알림 기기는 계정당 최대 10개까지 연결할 수 있습니다."},409);
    return jsonError(error);
  }
}
