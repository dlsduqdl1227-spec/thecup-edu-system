import { AuthError, normalizePhone, phoneHash } from "../../../../../lib/auth";
import { bookingText, bookingTimes, optionalBookingText } from "../../../../../lib/booking";
import { audit, ensureDatabase, getD1 } from "../../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../../lib/http";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 3;

export async function GET() {
  try {
    await ensureDatabase();
    const settings = await getD1()
      .prepare(
        `SELECT key, value FROM app_settings
         WHERE key IN ('booking_daily_price','booking_monthly_price')`,
      )
      .all<{ key: string; value: string }>();
    const values = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
    return Response.json(
      {
        dailyPrice: Number(values.booking_daily_price ?? 50000),
        monthlyPrice: Number(values.booking_monthly_price ?? 500000),
        bookingTimes,
      },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const payload = (await request.json()) as Record<string, unknown>;
    const name = bookingText(payload.name, "이름", 40);
    const normalizedPhone = normalizePhone(String(payload.phone ?? ""));
    const hashedPhone = await phoneHash(normalizedPhone);
    const desiredStationType = optionalBookingText(payload.desiredStationType, 40);
    const consultationMemo = bookingText(payload.consultationMemo, "상담 내용", 500);
    const now = new Date();
    const limitKey = `consultation:${hashedPhone}`;
    const rate = await getD1()
      .prepare(
        "SELECT window_start AS windowStart, request_count AS requestCount FROM public_request_limits WHERE identifier_hash = ?",
      )
      .bind(limitKey)
      .first<{ windowStart: string; requestCount: number }>();
    const inWindow = rate && now.getTime() - new Date(rate.windowStart).getTime() < WINDOW_MS;
    if (inWindow && Number(rate.requestCount) >= MAX_REQUESTS) {
      throw new AuthError("상담 신청이 여러 번 접수되었습니다. 잠시 후 다시 확인해 주세요.", 429);
    }
    await getD1()
      .prepare(
        `INSERT INTO public_request_limits (identifier_hash, window_start, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(identifier_hash) DO UPDATE SET
           window_start = CASE WHEN ? THEN public_request_limits.window_start ELSE excluded.window_start END,
           request_count = CASE WHEN ? THEN public_request_limits.request_count + 1 ELSE 1 END`,
      )
      .bind(limitKey, now.toISOString(), inWindow ? 1 : 0, inWindow ? 1 : 0)
      .run();
    const result = await getD1()
      .prepare(
        `INSERT INTO booking_members
          (name, phone_hash, phone_last4, approval_status, consultation_status,
           desired_station_type, consultation_memo, updated_at)
         VALUES (?, ?, ?, 'PENDING', 'REQUESTED', ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(phone_hash) DO UPDATE SET
           name = excluded.name,
           consultation_status = 'REQUESTED',
           desired_station_type = excluded.desired_station_type,
           consultation_memo = excluded.consultation_memo,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, approval_status AS approvalStatus`,
      )
      .bind(
        name,
        hashedPhone,
        normalizedPhone.slice(-4),
        desiredStationType,
        consultationMemo,
      )
      .first<{ id: number; approvalStatus: string }>();
    await audit(null, "request_consultation", "booking_member", String(result?.id ?? ""), desiredStationType || "상담 신청");
    return Response.json(
      {
        ok: true,
        alreadyApproved: result?.approvalStatus === "APPROVED",
        message: result?.approvalStatus === "APPROVED"
          ? "이미 승인된 회원입니다. 회원 로그인을 이용해 주세요."
          : "상담 신청이 접수되었습니다. 상담 완료 후 승인 결과를 안내해 드립니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
