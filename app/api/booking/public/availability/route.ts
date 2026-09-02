import { bookingMonthRange, validateBookingMonth } from "../../../../../lib/booking";
import { currentKoreanMonth } from "../../../../../lib/course-openings";
import { ensureDatabase, getD1 } from "../../../../../lib/db";
import { jsonError } from "../../../../../lib/http";

type PublicSlotRow = {
  stationType: string;
  stationName: string;
  startAt: string;
  endAt: string;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const month = validateBookingMonth(url.searchParams.get("month") ?? currentKoreanMonth());
    const range = bookingMonthRange(month);
    const slots = await getD1()
      .prepare(
        `SELECT st.type AS stationType, st.name AS stationName,
                sl.start_at AS startAt, sl.end_at AS endAt
         FROM booking_slots sl
         JOIN stations st ON st.id = sl.station_id AND st.active = 1
         WHERE sl.start_at >= ? AND sl.start_at < ?
           AND sl.status = 'OPEN'
           AND datetime(sl.start_at) > datetime('now')
           AND NOT EXISTS (
             SELECT 1 FROM reservations r
             WHERE r.slot_id = sl.id AND r.status = 'CONFIRMED'
           )
         ORDER BY sl.start_at, st.display_order, st.id`,
      )
      .bind(range.start, range.end)
      .all<PublicSlotRow>();
    return Response.json(
      {
        month,
        updatedAt: new Date().toISOString(),
        slots: slots.results,
      },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
