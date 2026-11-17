import { requireUser } from "../../../../lib/auth";
import { calendarSummary, ensureAutomaticSchedule, syncFlowCalendar } from "../../../../lib/booking-calendar";
import { ensureDatabase } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request,["admin"]);
    await syncFlowCalendar();
    await ensureAutomaticSchedule();
    return Response.json(await calendarSummary(), { headers });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    await requireUser(request,["admin"]);
    const result = await syncFlowCalendar({ force: true });
    const generated = await ensureAutomaticSchedule(true);
    return Response.json({ ...await calendarSummary(), created: generated.created, ok: result.ok }, { headers });
  } catch (error) { return jsonError(error); }
}
