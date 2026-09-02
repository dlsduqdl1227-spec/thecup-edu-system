import { AuthError } from "../../../../lib/auth";
import {
  bookingMonthRange,
  bookingText,
  currentKoreanDateTime,
  isFutureSlot,
  optionalBookingText,
  positiveBookingInteger,
  slotMonth,
  validateBookingMonth,
} from "../../../../lib/booking";
import { currentKoreanMonth } from "../../../../lib/course-openings";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";
import { requireMember } from "../../../../lib/member-auth";

type SlotRow = {
  id: number;
  stationId: number;
  stationType: string;
  stationName: string;
  startAt: string;
  endAt: string;
  slotStatus: "OPEN" | "BLOCKED";
  blockReason: string;
  hasConfirmed: number;
  ownConfirmed: number;
  ownRequested: number;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const member = await requireMember(request);
    const url = new URL(request.url);
    const month = validateBookingMonth(url.searchParams.get("month") ?? currentKoreanMonth());
    const range = bookingMonthRange(month);
    const db = getD1();
    const [slotsResult, reservationsResult, passesResult, paymentsResult, feedbackResult, practiceResult, evaluationsResult, settingsResult] = await Promise.all([
      db
        .prepare(
          `SELECT sl.id, sl.station_id AS stationId, st.type AS stationType,
                  st.name AS stationName, sl.start_at AS startAt, sl.end_at AS endAt,
                  sl.status AS slotStatus, sl.block_reason AS blockReason,
                  MAX(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS hasConfirmed,
                  MAX(CASE WHEN r.member_id = ? AND r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS ownConfirmed,
                  MAX(CASE WHEN r.member_id = ? AND r.status = 'REQUESTED' THEN 1 ELSE 0 END) AS ownRequested
           FROM booking_slots sl
           JOIN stations st ON st.id = sl.station_id AND st.active = 1
           LEFT JOIN reservations r ON r.slot_id = sl.id
           WHERE sl.start_at >= ? AND sl.start_at < ?
           GROUP BY sl.id
           ORDER BY sl.start_at, st.display_order, st.id`,
        )
        .bind(member.id, member.id, range.start, range.end)
        .all<SlotRow>(),
      db
        .prepare(
          `SELECT r.id, r.slot_id AS slotId, r.pass_id AS passId, r.status, r.purpose,
                  r.material_plan AS materialPlan, r.open_to_peer_practice AS openToPeerPractice,
                  r.user_memo AS userMemo, r.admin_memo AS adminMemo,
                  r.rejection_reason AS rejectionReason, r.created_at AS createdAt,
                  r.confirmed_at AS confirmedAt, sl.start_at AS startAt, sl.end_at AS endAt,
                  st.type AS stationType, st.name AS stationName
           FROM reservations r
           JOIN booking_slots sl ON sl.id = r.slot_id
           JOIN stations st ON st.id = sl.station_id
           WHERE r.member_id = ?
           ORDER BY sl.start_at DESC, r.id DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT id, type, valid_month AS validMonth, price, status,
                  max_active_bookings AS maxActiveBookings, created_at AS createdAt
           FROM member_passes WHERE member_id = ?
           ORDER BY valid_month DESC, id DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT id, reservation_id AS reservationId, pass_id AS passId,
                  amount, method, status, paid_at AS paidAt, created_at AS createdAt
           FROM booking_payments WHERE member_id = ? ORDER BY id DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT id, reservation_id AS reservationId, message, status,
                  admin_reply AS adminReply, created_at AS createdAt
           FROM booking_feedback WHERE member_id = ? ORDER BY id DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT p.id, p.reservation_id AS reservationId, p.station_type AS stationType,
                  p.recipe_data AS recipeData, p.sensory_note AS sensoryNote,
                  p.reflection, p.updated_at AS updatedAt
           FROM practice_logs p WHERE p.member_id = ? ORDER BY p.updated_at DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT id, status, result, ethics_status AS ethicsStatus,
                  requested_at AS requestedAt, evaluated_at AS evaluatedAt
           FROM internal_evaluations WHERE member_id = ? ORDER BY id DESC`,
        )
        .bind(member.id)
        .all(),
      db
        .prepare(
          `SELECT key, value FROM app_settings
           WHERE key IN ('booking_daily_price','booking_monthly_price','booking_cancel_hours','booking_max_active_bookings')`,
        )
        .all<{ key: string; value: string }>(),
    ]);
    const settings = Object.fromEntries(settingsResult.results.map((row) => [row.key, row.value]));
    const slots = slotsResult.results.map((slot) => ({
      id: slot.id,
      stationId: slot.stationId,
      stationType: slot.stationType,
      stationName: slot.stationName,
      startAt: slot.startAt,
      endAt: slot.endAt,
      blockReason: slot.slotStatus === "BLOCKED" ? slot.blockReason : "",
      displayStatus: slot.slotStatus === "BLOCKED"
        ? "BLOCKED"
        : Number(slot.ownConfirmed)
          ? "CONFIRMED"
          : Number(slot.ownRequested)
            ? "REQUESTED"
            : Number(slot.hasConfirmed)
              ? "RESERVED"
              : "AVAILABLE",
    }));
    return Response.json({
      member,
      month,
      slots,
      reservations: reservationsResult.results,
      passes: passesResult.results,
      payments: paymentsResult.results,
      feedback: feedbackResult.results,
      practiceLogs: practiceResult.results,
      evaluations: evaluationsResult.results,
      settings: {
        dailyPrice: Number(settings.booking_daily_price ?? 50000),
        monthlyPrice: Number(settings.booking_monthly_price ?? 500000),
        cancelHours: Number(settings.booking_cancel_hours ?? 24),
        maxActiveBookings: settings.booking_max_active_bookings === ""
          ? null
          : Number(settings.booking_max_active_bookings),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const member = await requireMember(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = bookingText(payload.action, "작업", 40);
    if (action === "requestReservation") return requestReservation(member.id, payload);
    if (action === "cancelReservation") return cancelReservation(member.id, payload);
    if (action === "requestFeedback") return requestFeedback(member.id, payload);
    if (action === "savePracticeLog") return savePracticeLog(member.id, payload);
    if (action === "requestEvaluation") return requestEvaluation(member.id);
    throw new Error("지원하지 않는 회원 작업입니다.");
  } catch (error) {
    return jsonError(error);
  }
}

async function requestReservation(memberId: number, payload: Record<string, unknown>) {
  const slotId = positiveBookingInteger(payload.slotId, "예약 시간");
  const purpose = bookingText(payload.purpose, "실습 목적", 40);
  const materialPlan = bookingText(payload.materialPlan, "재료 준비", 40);
  const userMemo = optionalBookingText(payload.userMemo, 500);
  const db = getD1();
  const slot = await db
    .prepare(
      `SELECT sl.id, sl.start_at AS startAt, sl.status, st.active
       FROM booking_slots sl JOIN stations st ON st.id = sl.station_id
       WHERE sl.id = ?`,
    )
    .bind(slotId)
    .first<{ id: number; startAt: string; status: string; active: number }>();
  if (!slot || slot.status !== "OPEN" || !Number(slot.active) || !isFutureSlot(slot.startAt)) {
    throw new AuthError("현재 예약할 수 없는 시간입니다.", 409);
  }
  const pass = await db
    .prepare(
      `SELECT id, type FROM member_passes
       WHERE member_id = ? AND valid_month = ? AND status = 'ACTIVE'
       ORDER BY CASE type WHEN 'MONTHLY' THEN 0 ELSE 1 END, id DESC LIMIT 1`,
    )
    .bind(memberId, slotMonth(slot.startAt))
    .first<{ id: number; type: "DAILY" | "MONTHLY" }>();
  if (!pass) throw new AuthError("해당 월에 사용할 수 있는 이용권이 없습니다.", 409);
  const duplicate = await db
    .prepare(
      `SELECT 1 FROM reservations
       WHERE member_id = ? AND slot_id = ? AND status IN ('REQUESTED','CONFIRMED')`,
    )
    .bind(memberId, slotId)
    .first();
  if (duplicate) throw new AuthError("이미 요청하거나 확정된 예약입니다.", 409);
  try {
    const result = await db
      .prepare(
        `INSERT INTO reservations
          (member_id, slot_id, pass_id, slot_start_at, status, purpose, material_plan,
           open_to_peer_practice, user_memo)
         VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
      )
      .bind(
        memberId,
        slotId,
        pass.id,
        slot.startAt,
        purpose,
        materialPlan,
        payload.openToPeerPractice === true ? 1 : 0,
        userMemo,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(null, "request_reservation", "reservation", String(id), `${slot.startAt} · ${purpose}`);
    return Response.json({ id, status: "REQUESTED" }, { status: 201 });
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AuthError("이미 접수된 예약 요청입니다.", 409);
    throw error;
  }
}

async function cancelReservation(memberId: number, payload: Record<string, unknown>) {
  const reservationId = positiveBookingInteger(payload.reservationId, "예약");
  const db = getD1();
  const reservation = await db
    .prepare(
      `SELECT r.id, r.status, sl.start_at AS startAt
       FROM reservations r JOIN booking_slots sl ON sl.id = r.slot_id
       WHERE r.id = ? AND r.member_id = ?`,
    )
    .bind(reservationId, memberId)
    .first<{ id: number; status: string; startAt: string }>();
  if (!reservation || !["REQUESTED", "CONFIRMED"].includes(reservation.status)) {
    throw new AuthError("취소할 수 있는 예약이 아닙니다.", 409);
  }
  const setting = await db
    .prepare("SELECT value FROM app_settings WHERE key = 'booking_cancel_hours'")
    .first<{ value: string }>();
  const cancelHours = Number(setting?.value ?? 24);
  if (new Date(reservation.startAt).getTime() - currentKoreanDateTime().getTime() < cancelHours * 3600000) {
    throw new AuthError(`이용 ${cancelHours}시간 전까지만 취소할 수 있습니다.`, 409);
  }
  await db
    .prepare(
      `UPDATE reservations SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND member_id = ?`,
    )
    .bind(reservationId, memberId)
    .run();
  await audit(null, "cancel_member_reservation", "reservation", String(reservationId), "회원 취소");
  return Response.json({ ok: true });
}

async function requestFeedback(memberId: number, payload: Record<string, unknown>) {
  const reservationId = positiveBookingInteger(payload.reservationId, "예약");
  const message = bookingText(payload.message, "피드백 요청", 500);
  const owned = await getD1()
    .prepare("SELECT 1 FROM reservations WHERE id = ? AND member_id = ? AND status IN ('CONFIRMED','COMPLETED')")
    .bind(reservationId, memberId)
    .first();
  if (!owned) throw new AuthError("피드백을 요청할 수 없는 예약입니다.", 403);
  await getD1()
    .prepare(
      `INSERT INTO booking_feedback (member_id, reservation_id, message)
       VALUES (?, ?, ?)`,
    )
    .bind(memberId, reservationId, message)
    .run();
  await audit(null, "request_booking_feedback", "reservation", String(reservationId), "피드백 요청");
  return Response.json({ ok: true }, { status: 201 });
}

async function savePracticeLog(memberId: number, payload: Record<string, unknown>) {
  const reservationId = positiveBookingInteger(payload.reservationId, "완료 예약");
  const recipeData = optionalBookingText(payload.recipeData, 2000);
  const sensoryNote = optionalBookingText(payload.sensoryNote, 2000);
  const reflection = optionalBookingText(payload.reflection, 2000);
  const reservation = await getD1()
    .prepare(
      `SELECT st.type AS stationType
       FROM reservations r
       JOIN booking_slots sl ON sl.id = r.slot_id
       JOIN stations st ON st.id = sl.station_id
       WHERE r.id = ? AND r.member_id = ? AND r.status = 'COMPLETED'`,
    )
    .bind(reservationId, memberId)
    .first<{ stationType: string }>();
  if (!reservation) throw new AuthError("완료된 본인 예약에만 실습 기록을 작성할 수 있습니다.", 403);
  await getD1()
    .prepare(
      `INSERT INTO practice_logs
        (member_id, reservation_id, station_type, recipe_data, sensory_note, reflection, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(member_id, reservation_id) DO UPDATE SET
         recipe_data = excluded.recipe_data,
         sensory_note = excluded.sensory_note,
         reflection = excluded.reflection,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(memberId, reservationId, reservation.stationType, recipeData, sensoryNote, reflection)
    .run();
  await audit(null, "save_practice_log", "reservation", String(reservationId), reservation.stationType);
  return Response.json({ ok: true });
}

async function requestEvaluation(memberId: number) {
  const db = getD1();
  const practiceCount = await db
    .prepare("SELECT COUNT(*) AS count FROM practice_logs WHERE member_id = ?")
    .bind(memberId)
    .first<{ count: number }>();
  if (Number(practiceCount?.count ?? 0) < 1) {
    throw new AuthError("완료된 실습 기록을 먼저 작성해 주세요.", 409);
  }
  const existing = await db
    .prepare("SELECT 1 FROM internal_evaluations WHERE member_id = ? AND status IN ('REQUESTED','PREPARING')")
    .bind(memberId)
    .first();
  if (existing) throw new AuthError("이미 진행 중인 내부평가가 있습니다.", 409);
  await db
    .prepare("INSERT INTO internal_evaluations (member_id, status) VALUES (?, 'REQUESTED')")
    .bind(memberId)
    .run();
  await audit(null, "request_internal_evaluation", "booking_member", String(memberId), "내부평가 신청");
  return Response.json({ ok: true }, { status: 201 });
}
