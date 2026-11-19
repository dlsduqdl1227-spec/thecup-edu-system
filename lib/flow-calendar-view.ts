import type {FlowWindow} from "./flow-window";
export type BusyDay={date:string;label:"마감"};
export type BusySlot={startAt:string;endAt:string;label:"마감"};
export type FlowCalendarEvent={id:string;title:string;startAt:string;endAt:string|null;location:string}&FlowWindow;
export function monthDates(month:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("조회 월을 확인해 주세요.");
  const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
  return Array.from({length:count},(_,index)=>`${month}-${String(index+1).padStart(2,"0")}`);
}
// No event IDs, counts, titles, locations or times in the public/student shape.
export function maskFlowDays(month:string,blocks:ReadonlyArray<{startDate:string;endDate:string;timingPending?:boolean}>):BusyDay[]{
  return monthDates(month).filter(date=>blocks.some(row=>!row.timingPending&&row.startDate<=date&&row.endDate>=date)).map(date=>({date,label:"마감"}));
}
export function flowTimeLabel(event:FlowCalendarEvent){
  if(event.timingPending)return "종료 시간 입력 필요 · 자동 차단 보류";
  if(event.allDay)return "종일";
  const clock=(value:string)=>{
    const time=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+"T00:00:00+09:00":/[Zz]|[+-]\d{2}:\d{2}$/.test(value)?value:value+"+09:00");
    return Number.isFinite(time.getTime())?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(time):"시간 확인 필요";
  };
  return clock(event.startAt)+(event.endAt?`–${event.endDate!==event.startDate?event.endDate+" ":""}${clock(event.endAt)}`:" · 종료 시간 미정")+(event.endUnknown&&event.endAt?" · 저장된 종료 시간 기준":"");
}
