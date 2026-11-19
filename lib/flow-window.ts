export type FlowWindow={startDate:string;endDate:string;blockStartAt:string|null;blockEndAt:string|null;allDay:boolean;endUnknown:boolean;timingPending:boolean};
const day=86400000,offset=9*3600000;
export function flowTimestamp(value:unknown):number{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value))throw new Error("일정 날짜와 시간을 확인해 주세요.");
  const [year,month,date]=value.slice(0,10).split("-").map(Number),calendar=new Date(Date.UTC(year,month-1,date));
  if(calendar.toISOString().slice(0,10)!==value.slice(0,10))throw new Error("일정 날짜를 확인해 주세요.");
  const time=Date.parse(value.length===10?value+"T00:00:00+09:00":/[Zz]|[+-]\d{2}:\d{2}$/.test(value)?value:value+"+09:00");
  if(!Number.isFinite(time))throw new Error("일정 시간을 확인해 주세요.");return time;
}
export const koreanWindowDate=(time:number)=>new Date(time+offset).toISOString().slice(0,10);
const koreanISO=(time:number)=>new Date(time+offset).toISOString().slice(0,-1)+"+09:00";
export function normalizeFlowWindow(data:{start:unknown;end?:unknown;allDay?:unknown;endUnknown?:unknown}):FlowWindow{
  const initial=flowTimestamp(data.start),allDay=data.allDay===true||typeof data.start==="string"&&data.start.length===10,endUnknown=data.endUnknown===true;
  const firstDate=koreanWindowDate(initial);let start=initial,end:number;
  if(allDay){
    const finalDate=!data.end?firstDate:koreanWindowDate(flowTimestamp(data.end));
    start=flowTimestamp(firstDate);end=flowTimestamp(finalDate)+day;
  }else if(!data.end&&endUnknown){
    // No invented duration: the administrator must supply a finishing time.
    return {startDate:firstDate,endDate:firstDate,blockStartAt:null,blockEndAt:null,allDay:false,endUnknown:true,timingPending:true};
  }else end=flowTimestamp(data.end);
  if(end<=start||end-start>367*day)throw new Error("일정 종료 시간이 시작 시간보다 늦어야 합니다.");
  return {startDate:koreanWindowDate(start),endDate:koreanWindowDate(end-1),blockStartAt:koreanISO(start),blockEndAt:koreanISO(end),allDay,endUnknown,timingPending:false};
}
export function flowWindowOverlaps(window:{blockStartAt:string|null;blockEndAt:string|null},startAt:string,endAt:string){
  return window.blockStartAt!==null&&window.blockEndAt!==null&&flowTimestamp(window.blockStartAt)<flowTimestamp(endAt)&&flowTimestamp(window.blockEndAt)>flowTimestamp(startAt);
}
