import { requireUser } from "../../../../lib/auth";
import { calendarSummary, ensureAutomaticSchedule, flowCalendarDetails, syncFlowCalendar } from "../../../../lib/booking-calendar";
import {validateBookingMonth} from "../../../../lib/booking";
import {currentKoreanMonth} from "../../../../lib/course-openings";
import { ensureDatabase } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request,["admin"]);
    const month=validateBookingMonth(new URL(request.url).searchParams.get("month")??currentKoreanMonth());
    const [summary,details]=await Promise.all([(async()=>{await syncFlowCalendar();await ensureAutomaticSchedule();return calendarSummary();})(),flowCalendarDetails(month)]);
    return Response.json({...summary,...details,month}, { headers });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    await requireUser(request,["admin"]);
    const month=validateBookingMonth(new URL(request.url).searchParams.get("month")??currentKoreanMonth());
    const [state,details]=await Promise.all([(async()=>{const result=await syncFlowCalendar({force:true});const generated=await ensureAutomaticSchedule(true);return {...await calendarSummary(),created:generated.created,ok:result.ok};})(),flowCalendarDetails(month)]);
    return Response.json({...state,...details,month}, { headers });
  } catch (error) { return jsonError(error); }
}
