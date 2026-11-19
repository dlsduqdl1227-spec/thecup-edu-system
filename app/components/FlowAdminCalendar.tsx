"use client";
import {useState} from "react";
import {flowTimeLabel,maskFlowDays,monthDates,type FlowCalendarEvent} from "../../lib/flow-calendar-view";
export function FlowAdminCalendar({month,events,blocks,loading,unavailable,onMonthChange}:{month:string;events:FlowCalendarEvent[];blocks:{startDate:string;endDate:string}[];loading:boolean;unavailable:boolean;onMonthChange:(value:string)=>void}){
  const [picked,setPicked]=useState("");
  const dates=monthDates(month),busy=new Set(maskFlowDays(month,blocks).map(row=>row.date));
  const selected=picked.startsWith(month+"-")?picked:events[0]?.startDate.startsWith(month)?events[0].startDate:dates.find(date=>busy.has(date))??dates[0];
  const matches=(date:string)=>events.filter(event=>event.startDate<=date&&event.endDate>=date);
  const selectedEvents=matches(selected),offset=new Date(month+"-01T12:00:00Z").getUTCDay();
  return <section className="flow-admin-section" aria-label="관리자 전용 FLOW 일정" aria-busy={loading}>
    <header><div><span className="flow-admin-badge">관리자 전용</span><h3>월간커피 FLOW 일정</h3><p>센터 연동 일정의 실제 내용입니다. 일반·수강생 화면에는 ‘예약 있음’만 표시됩니다.</p></div><label><span>FLOW 조회 월</span><input type="month" aria-label="FLOW 조회 월" value={month} onChange={event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))onMonthChange(event.target.value);}} /></label></header>
    <div className="flow-admin-board"><div className="flow-admin-month"><div className="flow-admin-weekdays">{["일","월","화","수","목","금","토"].map(day=><span key={day}>{day}</span>)}</div><div className="flow-admin-days">
      {Array.from({length:offset},(_,index)=><span key={"blank-"+index}/>)}
      {dates.map(date=>{const count=matches(date).length,blocked=busy.has(date)||count>0;return <button type="button" key={date} className={[selected===date?"active":"",blocked?"has-flow":""].join(" ")} aria-pressed={selected===date} aria-label={`${date}, ${unavailable&&blocked?"예약 차단":`FLOW 일정 ${count}건`}`} onClick={()=>setPicked(date)}><strong>{Number(date.slice(8))}</strong>{blocked&&<small>{count?`${count}건`:"차단"}</small>}</button>;})}
    </div></div><section className="flow-admin-events" aria-label="선택일 FLOW 상세 일정"><header><strong>{selected}</strong><span>{selectedEvents.length||busy.has(selected)?"날짜 전체 예약 차단":"연동 일정 없음"}</span></header>
      {selectedEvents.length?<ul>{selectedEvents.map(event=><li key={event.id}><strong>{event.title}</strong><span>{flowTimeLabel(event)}</span>{event.location&&<span>장소 · {event.location}</span>}{event.endDate!==event.startDate&&<small>{event.startDate} – {event.endDate}</small>}</li>)}</ul>:<p>{loading?"일정을 불러오는 중입니다.":unavailable?"상세 일정을 불러오지 못했습니다. 기존 예약 차단은 유지됩니다.":"선택한 날짜에는 FLOW 연동 일정이 없습니다."}</p>}
    </section></div>
  </section>;
}
