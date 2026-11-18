import {courseOptions,interestOptions} from "./learning-catalog";

// Only structured scheduling fields and approved catalog keys reach a lock screen.
// Never accept free-text names, course names, purposes, memos or contact details.
export type PushPreviewContext={startAt?:string|null;endAt?:string|null;courseKey?:string|null;stationType?:string|null;interests?:string|null};
const titles:Record<string,string>={
  CONSULTATION_NEW:"새 상담 신청",CONSULTATION_ASSIGNED:"담당 상담 배정",
  RESERVATION_REQUESTED:"새 예약 신청 · 승인 대기",RESERVATION_CONFIRMED:"예약 확정",
  RESERVATION_REJECTED:"예약 신청 미승인",RESERVATION_CANCELLED:"예약 취소",
  MEMBER_APPROVED:"수강생 이용 승인",TEST:"알림 미리보기 테스트",
};
const stations:Record<string,string>={ESPRESSO:"에스프레소 시간대",BREWING:"브루잉 시간대",ROASTING:"로스팅 시간대"};
function koreanDate(value:string|null|undefined){
  if(typeof value!=="string")return null;
  const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if(!parts)return null;
  const [year,month,day,hour,minute]=parts.slice(1,6).map(Number),calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||hour>23||minute>59)return null;
  const time=Date.parse(value+(parts[7]?"":"+09:00"));
  return Number.isFinite(time)?{time,date:new Date(time+9*3600000)}:null;
}
function schedule(start:string|null|undefined,end:string|null|undefined){
  const first=koreanDate(start);if(!first)return "";
  const label=(date:Date)=>`${date.getUTCFullYear()}년 ${date.getUTCMonth()+1}월 ${date.getUTCDate()}일(${"일월화수목금토"[date.getUTCDay()]})`;
  const clock=(date:Date)=>`${String(date.getUTCHours()).padStart(2,"0")}:${String(date.getUTCMinutes()).padStart(2,"0")}`;
  const last=koreanDate(end),sameDay=last&&first.date.toISOString().slice(0,10)===last.date.toISOString().slice(0,10);
  return `${label(first.date)} ${clock(first.date)}`+(last&&last.time>first.time?`–${sameDay?"":label(last.date)+" "}${clock(last.date)}`:"");
}
function interests(value:string|null|undefined){
  try{
    const keys:unknown=JSON.parse(value??"[]");if(!Array.isArray(keys))return "";
    const labels=[...new Set(keys.flatMap(key=>{const item=interestOptions.find(option=>option.id===key);return item?[item.name]:[];}))];
    return labels.slice(0,2).join(" / ")+(labels.length>2?` 외 ${labels.length-2}개`:"");
  }catch{return "";}
}
export function buildNotificationPreview(kind:string,audience:"STAFF"|"MEMBER",context:PushPreviewContext={}){
  const title=(Object.hasOwn(titles,kind)?titles[kind]:"새 알림")+" · 더컵에듀";
  let body="앱에서 알림 내용을 확인해 주세요.";
  if(kind.startsWith("CONSULTATION_")){
    const selected=interests(context.interests);
    body=(selected?selected+"\n":"")+(kind==="CONSULTATION_NEW"?"상담 신청 1건이 접수됐습니다. 상담 접수함에서 확인해 주세요.":"새 담당 상담이 배정됐습니다. 상담 접수함에서 확인해 주세요.");
  }else if(kind.startsWith("RESERVATION_")){
    const course=courseOptions.find(option=>option.id===context.courseKey)?.name??(Object.hasOwn(stations,context.stationType??"")?stations[context.stationType!]:"");
    const detail=[schedule(context.startAt,context.endAt),course].filter(Boolean).join(" · ");
    const messages:Record<string,string>={
      RESERVATION_REQUESTED:"예약 신청이 접수됐습니다. 승인 대기 일정을 확인해 주세요.",
      RESERVATION_CONFIRMED:"수업 예약이 확정됐습니다. 내 예약에서 확인해 주세요.",
      RESERVATION_REJECTED:"이번 예약 신청은 승인되지 않았습니다. 다른 시간대를 확인해 주세요.",
      RESERVATION_CANCELLED:audience==="STAFF"?"예약이 취소됐습니다. 담당 일정을 확인해 주세요.":"예약이 취소됐습니다. 내 예약에서 확인해 주세요.",
    };
    body=(detail?detail+"\n":"")+(Object.hasOwn(messages,kind)?messages[kind]:body);
  }else if(kind==="MEMBER_APPROVED")body="수강생 이용이 승인됐습니다. 로그인 후 수업 예약을 진행해 주세요.";
  else if(kind==="TEST")body="알림 제목과 내용이 이렇게 미리 표시됩니다. 실제 상담·예약 알림에는 과정과 예약 시간이 함께 나옵니다.";
  return {title,body:Array.from(body).slice(0,180).join("")};
}
