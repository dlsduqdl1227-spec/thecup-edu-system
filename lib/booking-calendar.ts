import { env } from "cloudflare:workers";
import { AuthError } from "./auth";
import { getD1 } from "./db";
import { calendarClosedSQL, operatingValidSQL } from "./booking-calendar-schema";
import { automaticTimes, koreanToday, operatingDayReason, operatingHolidays, operatingTimeReason, rollingMonths } from "./operating-calendar";
import {validateBookingMonth} from "./booking";
import {maskFlowDays,monthDates,type FlowCalendarEvent} from "./flow-calendar-view";

type CalendarEnv = { FLOW_CALENDAR_SECRET?: string; BOOKING_AUTOMATION_ENABLED?: string; FLOW_CALENDAR?: { fetch: typeof fetch } };
const settings = () => env as unknown as CalendarEnv;
export type FlowBlock = { id: string; startDate: string; endDate: string };
type SyncRow = { events_json: string; source_revision: number; synced_at: string | null; attempted_at: string | null; last_error: string };
const sourceURL = "https://monthlycoffee-flow.pages.dev/api/integrations/thecup-edu/calendar";
const privateFailure = "FLOW 연결을 확인하지 못했습니다. 기존 차단은 유지됩니다.";
async function flowJSON(response:Response,maxBytes=1500000){
  if(!response.ok)throw new Error("Calendar source unavailable");
  const reader=response.body?.getReader();if(!reader)throw new Error("Empty calendar source");
  const decoder=new TextDecoder();let text="",bytes=0;
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw new Error("Calendar source too large");}text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode()) as unknown;
}

export async function hasCalendarSecret(request: Request) {
  const expected = settings().FLOW_CALENDAR_SECRET;
  if (!expected || expected.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (supplied.length > 256) return false;
  const hash = async (v: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  const [left, right] = await Promise.all([hash(expected), hash(supplied)]);
  return left.reduce((difference, value, i) => difference | (value ^ right[i]), 0) === 0;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validateFlowSnapshot(value: unknown, now = Date.now()): { revision: number; events: FlowBlock[] } {
  const data = value as { source?: string; generatedAt?: number; events?: FlowBlock[] };
  if (!data || data.source !== "FLOW" || !Number.isSafeInteger(data.generatedAt) || Math.abs(now - data.generatedAt!) > 120000 || !Array.isArray(data.events) || data.events.length > 5000) throw new Error("Invalid calendar snapshot");
  const ids = new Set<string>();
  const events = data.events.map(row => {
    if (!row || typeof row.id !== "string" || !row.id || row.id.length > 200 || ids.has(row.id) || !validDate(row.startDate) || !validDate(row.endDate) || row.endDate < row.startDate || Date.parse(row.endDate) - Date.parse(row.startDate) > 366 * 86400000) throw new Error("Invalid calendar dates");
    ids.add(row.id);
    return { id: row.id, startDate: row.startDate, endDate: row.endDate };
  });
  return { revision: data.generatedAt!, events };
}
export function validateFlowDetails(value:unknown,month:string,now=Date.now()):FlowCalendarEvent[]{
  const data=value as {view?:string;month?:string;events?:Array<Record<string,unknown>>};
  const snapshot=validateFlowSnapshot(value,now),dates=monthDates(month);
  if(data.view!=="ADMIN"||data.month!==month||snapshot.events.length>1000)throw new Error("Invalid private calendar snapshot");
  const localDate=(value:unknown)=>{
    if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value))throw new Error("Invalid private event time");
    const time=Date.parse(value.length===10?value+"T12:00:00Z":/[Zz]|[+-]\d{2}:\d{2}$/.test(value)?value:value+"+09:00");
    if(!Number.isFinite(time)||!validDate(value.slice(0,10)))throw new Error("Invalid private event time");
    return new Date(time+9*3600000).toISOString().slice(0,10);
  };
  return snapshot.events.map((block,index)=>{
    const row=data.events![index];
    if(typeof row.title!=="string"||!row.title.trim()||Array.from(row.title).length>160||typeof row.location!=="string"||Array.from(row.location).length>120||typeof row.allDay!=="boolean"
      ||block.endDate<dates[0]||block.startDate>dates[dates.length-1]||localDate(row.startAt)!==block.startDate||(row.endAt===null?block.startDate:localDate(row.endAt))!==block.endDate)throw new Error("Invalid private event fields");
    return {...block,title:row.title,startAt:row.startAt as string,endAt:row.endAt as string|null,allDay:row.allDay,location:row.location};
  });
}
export async function flowCalendarDetails(month:string){
  validateBookingMonth(month);
  const secret=settings().FLOW_CALENDAR_SECRET;
  if(!secret)return {flowEvents:[] as FlowCalendarEvent[],detailsWarning:""};
  try{
    const sourceFetch=settings().FLOW_CALENDAR?.fetch.bind(settings().FLOW_CALENDAR)??fetch;
    const response=await sourceFetch(sourceURL+`?details=1&month=${month}`,{headers:{Authorization:`Bearer ${secret}`},cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(7000)});
    return {flowEvents:validateFlowDetails(await flowJSON(response,2000000),month),detailsWarning:""};
  }catch{return {flowEvents:[] as FlowCalendarEvent[],detailsWarning:"FLOW 일정 내용을 불러오지 못했습니다. 기존 예약 차단은 유지됩니다."};}
}
export async function calendarBusyDays(month:string){
  validateBookingMonth(month);
  const row=await getD1().prepare("SELECT events_json FROM booking_calendar_sync WHERE source='FLOW'").first<{events_json:string}>();
  return maskFlowDays(month,row?JSON.parse(row.events_json) as FlowBlock[]:[]);
}
export async function syncFlowCalendar({ force = false, required = false } = {}) {
  const secret = settings().FLOW_CALENDAR_SECRET;
  if (!secret) return { configured: false, ok: true };
  const db = getD1();
  const previous = await db.prepare("SELECT * FROM booking_calendar_sync WHERE source='FLOW'").first<SyncRow>();
  const age = previous?.attempted_at ? Date.now() - Date.parse(previous.attempted_at) : Infinity;
  if (!force && age < 25000) return { configured: true, ok: !previous?.last_error };
  const attempt = new Date().toISOString();
  let failureCode = "NETWORK";
  try {
    const sourceFetch = settings().FLOW_CALENDAR?.fetch.bind(settings().FLOW_CALENDAR) ?? fetch;
    // Workers supports manual/follow, not redirect:error. Never forward the secret to a redirect target.
    const response = await sourceFetch(sourceURL, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(7000) });
    if (!response.ok) { failureCode = `HTTP ${response.status}`; throw new Error("Calendar source unavailable"); }
    failureCode = "SNAPSHOT";
    const snapshot = validateFlowSnapshot(await flowJSON(response));
    failureCode = "SAVE";
    await db.prepare(`INSERT INTO booking_calendar_sync(source,events_json,source_revision,synced_at,attempted_at,last_error)
      VALUES ('FLOW',?,?,?,?, '') ON CONFLICT(source) DO UPDATE SET events_json=excluded.events_json,
      source_revision=excluded.source_revision,synced_at=excluded.synced_at,attempted_at=excluded.attempted_at,last_error=''
      WHERE excluded.source_revision >= booking_calendar_sync.source_revision`)
      .bind(JSON.stringify(snapshot.events), snapshot.revision, attempt, attempt).run();
    return { configured: true, ok: true };
  } catch {
    await db.prepare(`INSERT INTO booking_calendar_sync(source,attempted_at,last_error) VALUES ('FLOW',?,?)
      ON CONFLICT(source) DO UPDATE SET attempted_at=excluded.attempted_at,last_error=excluded.last_error
      WHERE booking_calendar_sync.attempted_at IS NULL OR booking_calendar_sync.attempted_at <= excluded.attempted_at`).bind(attempt, `${privateFailure} (${failureCode})`).run();
    if (required) throw new AuthError("일정 연동 확인이 지연되어 예약을 잠시 중단했습니다. 잠시 후 다시 신청해 주세요.", 503);
    return { configured: true, ok: false };
  }
}

export async function ensureAutomaticSchedule(force = false, now = new Date()) {
  if (settings().BOOKING_AUTOMATION_ENABLED !== "true") return { enabled: false, created: 0 };
  const db = getD1();
  const today = koreanToday(now);
  const state = await db.prepare("SELECT generated_at FROM booking_calendar_automation WHERE id=1").first<{ generated_at: string | null }>();
  if (!force && state?.generated_at && koreanToday(new Date(state.generated_at)) === today) return { enabled: true, created: 0 };
  // Seed holiday data before activating the DB guards. Existing slots are never rewritten.
  await db.prepare("INSERT OR IGNORE INTO booking_calendar_holidays(date,name) SELECT key,value FROM json_each(?)").bind(JSON.stringify(operatingHolidays)).run();
  await db.prepare("UPDATE booking_calendar_automation SET enabled=1 WHERE id=1").run();
  const actor = await db.prepare("SELECT id FROM staff WHERE role='admin' AND active=1 AND deleted_at IS NULL ORDER BY id LIMIT 1").first<{ id: number }>();
  if (!actor) return { enabled: true, created: 0 };
  const stations = (await db.prepare("SELECT id FROM stations WHERE active=1 ORDER BY id").all<{ id: number }>()).results;
  const candidates: { stationId: number; startAt: string; endAt: string }[] = [];
  for (const month of rollingMonths(now)) {
    const days = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).getUTCDate();
    for (let day = 1; day <= days; day++) {
      const date = `${month}-${String(day).padStart(2,"0")}`;
      if (date < today || operatingDayReason(date)) continue;
      for (const station of stations) for (const time of automaticTimes) {
        const start = `${date}T${time.start}:00+09:00`, end = `${date}T${time.end}:00+09:00`;
        candidates.push({ stationId: station.id, startAt: start, endAt: end });
      }
    }
  }
  let created = 0;
  for (let i = 0; i < candidates.length; i += 100) {
    // One SQL statement per 100 candidates, rather than hundreds of round trips.
    const result = await db.prepare(`INSERT OR IGNORE INTO booking_slots(station_id,start_at,end_at,status,created_by)
      SELECT json_extract(c.value,'$.stationId'),json_extract(c.value,'$.startAt'),json_extract(c.value,'$.endAt'),'OPEN',?
      FROM json_each(?) c WHERE NOT EXISTS (
        SELECT 1 FROM booking_slots existing WHERE existing.station_id=json_extract(c.value,'$.stationId')
          AND existing.start_at<json_extract(c.value,'$.endAt') AND existing.end_at>json_extract(c.value,'$.startAt')
          AND (existing.status='BLOCKED' OR ${operatingValidSQL("existing")} OR EXISTS (
            SELECT 1 FROM reservations r WHERE r.slot_id=existing.id AND r.status='CONFIRMED')))`)
      .bind(actor.id, JSON.stringify(candidates.slice(i,i+100))).run();
    created += Number(result.meta.changes ?? 0);
  }
  await db.prepare("UPDATE booking_calendar_automation SET generated_at=? WHERE id=1").bind(now.toISOString()).run();
  return { enabled: true, created };
}
export async function prepareBookingCalendar() {
  await syncFlowCalendar();
  await ensureAutomaticSchedule();
}
export async function assertCalendarSlotOpen(slotId: number) {
  await ensureAutomaticSchedule();
  await syncFlowCalendar({ force: true, required: true });
  const closed = await getD1().prepare(`SELECT 1 FROM booking_slots sl WHERE sl.id=? AND ${calendarClosedSQL()}`).bind(slotId).first();
  if (closed) throw new AuthError("휴무 또는 FLOW 일정으로 예약할 수 없는 날짜·시간입니다. 다른 일정을 선택해 주세요.", 409);
}
export async function calendarSummary() {
  const db = getD1();
  const row = await db.prepare("SELECT * FROM booking_calendar_sync WHERE source='FLOW'").first<SyncRow>();
  const events: FlowBlock[] = row ? JSON.parse(row.events_json) : [];
  const conflicts = await db.prepare(`SELECT r.id, r.status, m.name AS memberName, sl.start_at AS startAt, sl.end_at AS endAt,
    st.name AS stationName FROM reservations r JOIN booking_slots sl ON sl.id=r.slot_id
    JOIN booking_members m ON m.id=r.member_id JOIN stations st ON st.id=sl.station_id
    WHERE r.status IN ('REQUESTED','CONFIRMED') AND sl.start_at >= ? AND ${calendarClosedSQL()}
    ORDER BY sl.start_at,r.id LIMIT 100`).bind(`${koreanToday()}T00:00`).all();
  return { configured: Boolean(settings().FLOW_CALENDAR_SECRET), syncedAt: row?.synced_at ?? null,
    warning: row?.last_error ?? "", automatic: settings().BOOKING_AUTOMATION_ENABLED === "true",
    months: rollingMonths(), times: automaticTimes, holidayYears: [2026,2027],
    blocks: events.filter(e => e.endDate >= koreanToday()).sort((a,b) => a.startDate.localeCompare(b.startDate)),
    conflicts: conflicts.results };
}
export function effectiveSlot<T extends { startAt: string; endAt: string; status?: string; slotStatus?: string; blockReason?: string; flowBlocked: number }>(row: T, automatic: boolean) {
  const reason = row.flowBlocked ? "FLOW 일정 · 날짜 전체 예약 차단" : automatic ? operatingTimeReason(row.startAt,row.endAt) : "";
  return reason ? { ...row, ...(row.status ? { status: "BLOCKED" } : {}), ...(row.slotStatus ? { slotStatus: "BLOCKED" } : {}), blockReason: reason, calendarBlocked: true } : { ...row, calendarBlocked: false };
}
