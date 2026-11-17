import { ensureDatabase } from "../../../../lib/db";
import { hasCalendarSecret, syncFlowCalendar } from "../../../../lib/booking-calendar";

export async function POST(request: Request) {
  if (!await hasCalendarSecret(request)) return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  await ensureDatabase();
  const result = await syncFlowCalendar({ force: true });
  return Response.json({ ok: result.ok }, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
