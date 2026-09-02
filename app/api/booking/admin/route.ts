import { AuthError, requireUser } from "../../../../lib/auth";
import {
  bookingDateTime,
  bookingMonthRange,
  bookingText,
  bookingTimes,
  getBookingTime,
  isFutureSlot,
  nonNegativeBookingInteger,
  optionalBookingText,
  positiveBookingInteger,
  slotDate,
  slotMonth,
  validateBookingDateInMonth,
  validateBookingMonth,
  validateBookingTimeRange,
} from "../../../../lib/booking";
import { currentKoreanMonth } from "../../../../lib/course-openings";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request, ["admin"]);
    const url = new URL(request.url);
    const db = getD1();
    const currentMonth = currentKoreanMonth();
    const requestedMonth = url.searchParams.get("month");
    const nearestScheduleMonth = requestedMonth ? null : await db.prepare(
      `SELECT MIN(substr(start_at, 1, 7)) AS month
       FROM booking_slots WHERE start_at >= ?`,
    ).bind(`${currentMonth}-01`).first<{ month: string | null }>();
    const month = validateBookingMonth(requestedMonth ?? nearestScheduleMonth?.month ?? currentMonth);
    const range = bookingMonthRange(month);
    const [members, stations, slots, reservations, passes, payments, feedback, evaluations, candidates, settings, scheduleMonths] = await Promise.all([
      db.prepare(
        `SELECT id, name, phone_last4 AS phoneLast4, approval_status AS approvalStatus,
                consultation_status AS consultationStatus, desired_station_type AS desiredStationType,
                consultation_memo AS consultationMemo, admin_memo AS adminMemo,
                approved_at AS approvedAt, created_at AS createdAt
         FROM booking_members
         WHERE deleted_at IS NULL
         ORDER BY CASE approval_status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, id DESC`,
      ).all(),
      db.prepare(
        `SELECT id, type, name, active, display_order AS displayOrder,
                created_at AS createdAt FROM stations ORDER BY display_order, id`,
      ).all(),
      db.prepare(
        `SELECT sl.id, sl.station_id AS stationId, sl.start_at AS startAt,
                sl.end_at AS endAt, sl.status, sl.block_reason AS blockReason,
                st.type AS stationType, st.name AS stationName,
                MAX(CASE WHEN r.status = 'CONFIRMED' THEN 1 ELSE 0 END) AS hasConfirmed,
                COUNT(CASE WHEN r.status = 'REQUESTED' THEN 1 END) AS requestCount
         FROM booking_slots sl
         JOIN stations st ON st.id = sl.station_id
         LEFT JOIN reservations r ON r.slot_id = sl.id
         WHERE sl.start_at >= ? AND sl.start_at < ?
         GROUP BY sl.id ORDER BY sl.start_at, st.display_order, st.id`,
      ).bind(range.start, range.end).all(),
      db.prepare(
        `SELECT r.id, r.member_id AS memberId, m.name AS memberName,
                m.phone_last4 AS phoneLast4, m.approval_status AS memberApprovalStatus,
                r.slot_id AS slotId, r.pass_id AS passId, r.status, r.purpose,
                r.material_plan AS materialPlan, r.open_to_peer_practice AS openToPeerPractice,
                r.user_memo AS userMemo, r.admin_memo AS adminMemo,
                r.rejection_reason AS rejectionReason, r.created_at AS createdAt,
                r.confirmed_at AS confirmedAt, sl.start_at AS startAt, sl.end_at AS endAt,
                st.type AS stationType, st.name AS stationName
         FROM reservations r
         JOIN booking_members m ON m.id = r.member_id
         JOIN booking_slots sl ON sl.id = r.slot_id
         JOIN stations st ON st.id = sl.station_id
         WHERE sl.start_at >= ? AND sl.start_at < ?
         ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 WHEN 'CONFIRMED' THEN 1 ELSE 2 END,
                  r.created_at DESC`,
      ).bind(range.start, range.end).all(),
      db.prepare(
        `SELECT p.id, p.member_id AS memberId, m.name AS memberName, p.type,
                p.valid_month AS validMonth, p.price, p.status,
                p.max_active_bookings AS maxActiveBookings, p.created_at AS createdAt
         FROM member_passes p JOIN booking_members m ON m.id = p.member_id
         WHERE p.valid_month = ? ORDER BY p.id DESC`,
      ).bind(month).all(),
      db.prepare(
        `SELECT p.id, p.member_id AS memberId, m.name AS memberName,
                p.reservation_id AS reservationId, p.pass_id AS passId,
                p.amount, p.method, p.status, p.paid_at AS paidAt, p.created_at AS createdAt
         FROM booking_payments p JOIN booking_members m ON m.id = p.member_id
         ORDER BY p.id DESC LIMIT 200`,
      ).all(),
      db.prepare(
        `SELECT f.id, f.member_id AS memberId, m.name AS memberName,
                f.reservation_id AS reservationId, f.message, f.status,
                f.admin_reply AS adminReply, f.created_at AS createdAt
         FROM booking_feedback f JOIN booking_members m ON m.id = f.member_id
         ORDER BY CASE f.status WHEN 'REQUESTED' THEN 0 ELSE 1 END, f.id DESC LIMIT 200`,
      ).all(),
      db.prepare(
        `SELECT e.id, e.member_id AS memberId, m.name AS memberName,
                e.status, e.technical_score AS technicalScore,
                e.consistency_score AS consistencyScore, e.sensory_score AS sensoryScore,
                e.rule_score AS ruleScore, e.ethics_status AS ethicsStatus,
                e.result, e.note, e.requested_at AS requestedAt, e.evaluated_at AS evaluatedAt
         FROM internal_evaluations e JOIN booking_members m ON m.id = e.member_id
         ORDER BY CASE e.status WHEN 'REQUESTED' THEN 0 ELSE 1 END, e.id DESC`,
      ).all(),
      db.prepare(
        `SELECT c.id, c.member_id AS memberId, m.name AS memberName,
                c.type, c.status, c.conflict_note AS conflictNote,
                c.final_decision_by AS finalDecisionBy, c.decided_at AS decidedAt
         FROM opportunity_candidates c JOIN booking_members m ON m.id = c.member_id
         ORDER BY c.updated_at DESC`,
      ).all(),
      db.prepare(
        `SELECT key, value FROM app_settings
         WHERE key IN ('booking_daily_price','booking_monthly_price','booking_cancel_hours','booking_max_active_bookings','booking_kakao_chat_url')`,
      ).all<{ key: string; value: string }>(),
      db.prepare(
        `SELECT DISTINCT substr(start_at, 1, 7) AS month
         FROM booking_slots WHERE start_at >= ?
         ORDER BY month LIMIT 12`,
      ).bind(`${currentMonth}-01`).all<{ month: string }>(),
    ]);
    const settingMap = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
    return Response.json({
      month,
      members: members.results,
      stations: stations.results,
      slots: slots.results,
      reservations: reservations.results,
      passes: passes.results,
      payments: payments.results,
      feedback: feedback.results,
      evaluations: evaluations.results,
      candidates: candidates.results,
      scheduleMonths: scheduleMonths.results.map((row) => row.month),
      settings: {
        dailyPrice: Number(settingMap.booking_daily_price ?? 50000),
        monthlyPrice: Number(settingMap.booking_monthly_price ?? 500000),
        cancelHours: Number(settingMap.booking_cancel_hours ?? 24),
        maxActiveBookings: settingMap.booking_max_active_bookings === ""
          ? null
          : Number(settingMap.booking_max_active_bookings),
        kakaoChatUrl: settingMap.booking_kakao_chat_url ?? "",
      },
      bookingTimes,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = bookingText(payload.action, "작업", 50);
    if (action === "approveMember") return approveMember(actor.id, payload);
    if (action === "deleteMember") return deleteMember(actor.id, payload);
    if (action === "saveStation") return saveStation(actor.id, payload);
    if (action === "generateSlots") return generateSlots(actor.id, payload);
    if (action === "copyDate") return copyDate(actor.id, payload);
    if (action === "setSlotBlock") return setSlotBlock(actor.id, payload);
    if (action === "setDateBlock") return setDateBlock(actor.id, payload);
    if (action === "decideReservation") return decideReservation(actor.id, payload);
    if (action === "createPass") return createPass(actor.id, payload);
    if (action === "recordPayment") return recordPayment(actor.id, payload);
    if (action === "updateSettings") return updateSettings(actor.id, payload);
    if (action === "answerFeedback") return answerFeedback(actor.id, payload);
    if (action === "saveEvaluation") return saveEvaluation(actor.id, payload);
    if (action === "saveCandidate") return saveCandidate(actor.id, payload);
    throw new Error("지원하지 않는 관리자 작업입니다.");
  } catch (error) {
    return jsonError(error);
  }
}

async function approveMember(actorId: number, payload: Record<string, unknown>) {
  const memberId = positiveBookingInteger(payload.memberId, "회원");
  const approved = payload.approved === true;
  const adminMemo = optionalBookingText(payload.adminMemo, 500);
  const result = await getD1()
    .prepare(
      `UPDATE booking_members SET approval_status = ?, consultation_status = 'COMPLETED',
              admin_memo = ?, approved_by = ?, approved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END,
              updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(approved ? "APPROVED" : "REVOKED", adminMemo, actorId, approved ? 1 : 0, memberId)
    .run();
  if (!Number(result.meta.changes)) throw new Error("회원을 찾을 수 없습니다.");
  if (!approved) {
    await getD1().prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(memberId).run();
  }
  await audit(actorId, "approve_booking_member", "booking_member", String(memberId), approved ? "회원 승인" : "권한 회수");
  return Response.json({ ok: true });
}

async function deleteMember(actorId: number, payload: Record<string, unknown>) {
  const memberId = positiveBookingInteger(payload.memberId, "회원");
  const db = getD1();
  const member = await db
    .prepare("SELECT name FROM booking_members WHERE id = ? AND deleted_at IS NULL")
    .bind(memberId)
    .first<{ name: string }>();
  if (!member) throw new Error("회원을 찾을 수 없습니다.");
  await db.batch([
    db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(memberId),
    db.prepare(
      `UPDATE booking_members
       SET approval_status = 'REVOKED', deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
    ).bind(memberId),
  ]);
  await audit(actorId, "delete_booking_member", "booking_member", String(memberId), `${member.name} 계정 삭제`);
  return Response.json({ ok: true });
}

async function saveStation(actorId: number, payload: Record<string, unknown>) {
  const type = bookingText(payload.type, "스테이션 유형", 40).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(type)) throw new Error("스테이션 유형은 영문 대문자로 입력해 주세요.");
  const name = bookingText(payload.name, "스테이션명", 80);
  const displayOrder = nonNegativeBookingInteger(payload.displayOrder ?? 0, "표시 순서");
  const active = payload.active !== false;
  const id = payload.id ? positiveBookingInteger(payload.id, "스테이션") : null;
  if (id) {
    await getD1()
      .prepare("UPDATE stations SET type = ?, name = ?, active = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(type, name, active ? 1 : 0, displayOrder, id)
      .run();
  } else {
    await getD1()
      .prepare("INSERT INTO stations (type, name, active, display_order) VALUES (?, ?, ?, ?)")
      .bind(type, name, active ? 1 : 0, displayOrder)
      .run();
  }
  await audit(actorId, id ? "update_station" : "create_station", "station", String(id ?? ""), name);
  return Response.json({ ok: true });
}

async function generateSlots(actorId: number, payload: Record<string, unknown>) {
  const month = validateBookingMonth(payload.month);
  const requestedDates = Array.isArray(payload.dates)
    ? [...new Set(payload.dates.map((date) => validateBookingDateInMonth(date, month)))].sort()
    : [];
  if (Array.isArray(payload.dates) && !requestedDates.length) throw new Error("운영 날짜를 한 개 이상 선택해 주세요.");
  if (requestedDates.length > 31) throw new Error("한 번에 선택할 수 있는 날짜는 31일까지입니다.");

  const customTimes = Array.isArray(payload.times)
    ? payload.times.map((value) => {
        if (!value || typeof value !== "object") throw new Error("운영 시간대를 확인해 주세요.");
        const row = value as Record<string, unknown>;
        return validateBookingTimeRange(row.start, row.end);
      })
    : [];
  if (Array.isArray(payload.times) && !customTimes.length) throw new Error("운영 시간대를 한 개 이상 입력해 주세요.");
  if (customTimes.length > 12) throw new Error("한 번에 생성할 수 있는 시간대는 12개까지입니다.");
  const timeKeys = Array.isArray(payload.timeKeys) ? payload.timeKeys : bookingTimes.map((time) => time.key);
  const times = customTimes.length ? customTimes : timeKeys.map(getBookingTime);
  const sortedTimes = [...times].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < sortedTimes.length; index += 1) {
    if (sortedTimes[index].start < sortedTimes[index - 1].end) {
      throw new Error("서로 겹치지 않는 시간대를 입력해 주세요.");
    }
  }

  const requestedStationIds = Array.isArray(payload.stationIds)
    ? payload.stationIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (requestedStationIds.length > 50) throw new Error("한 번에 선택할 수 있는 스테이션은 50개까지입니다.");
  const stationRows = requestedStationIds.length
    ? await placeholdersQuery("SELECT id FROM stations WHERE active = 1 AND id IN", requestedStationIds)
    : (await getD1().prepare("SELECT id FROM stations WHERE active = 1 ORDER BY display_order, id").all<{ id: number }>()).results;
  if (!stationRows.length) throw new Error("활성 스테이션이 없습니다.");
  let dates = requestedDates;
  if (!dates.length) {
    const weekdayValues = Array.isArray(payload.weekdays) ? payload.weekdays.map(Number) : [1, 2, 3, 4, 5];
    const weekdays = new Set(weekdayValues.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
    if (!weekdays.size) throw new Error("운영 요일을 선택해 주세요.");
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    dates = Array.from({ length: lastDay }, (_, index) => index + 1)
      .filter((day) => weekdays.has(new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay()))
      .map((day) => `${month}-${String(day).padStart(2, "0")}`);
  }
  const statements = [];
  for (const date of dates) {
    for (const station of stationRows) {
      for (const time of times) {
        const startAt = bookingDateTime(date, time.start);
        const endAt = bookingDateTime(date, time.end);
        statements.push(
          getD1()
            .prepare(
              `INSERT INTO booking_slots
                (station_id, start_at, end_at, status, created_by)
               SELECT ?, ?, ?, 'OPEN', ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM booking_slots
                 WHERE station_id = ? AND start_at < ? AND end_at > ?
               )`,
            )
            .bind(station.id, startAt, endAt, actorId, station.id, endAt, startAt),
        );
      }
    }
  }
  let created = 0;
  for (let index = 0; index < statements.length; index += 50) {
    const results = await getD1().batch(statements.slice(index, index + 50));
    created += results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
  }
  const skipped = statements.length - created;
  await audit(actorId, "generate_booking_slots", "booking_slot", month, `${created}개 생성 · ${skipped}개 중복/겹침 제외`);
  return Response.json({ ok: true, attempted: statements.length, created, skipped });
}

async function copyDate(actorId: number, payload: Record<string, unknown>) {
  const sourceDate = bookingText(payload.sourceDate, "복사할 날짜", 10);
  const targetDate = bookingText(payload.targetDate, "적용 날짜", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
  const sourceSlots = await getD1()
    .prepare(
      `SELECT station_id AS stationId, substr(start_at, 12, 5) AS startTime,
              substr(end_at, 12, 5) AS endTime, status, block_reason AS blockReason
       FROM booking_slots WHERE substr(start_at, 1, 10) = ?`,
    )
    .bind(sourceDate)
    .all<{ stationId: number; startTime: string; endTime: string; status: string; blockReason: string }>();
  if (!sourceSlots.results.length) throw new Error("복사할 날짜에 운영 시간이 없습니다.");
  const statements = sourceSlots.results.map((slot) => getD1().prepare(
    `INSERT OR IGNORE INTO booking_slots
      (station_id, start_at, end_at, status, block_reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(slot.stationId, bookingDateTime(targetDate, slot.startTime), bookingDateTime(targetDate, slot.endTime), slot.status, slot.blockReason, actorId));
  await getD1().batch(statements);
  await audit(actorId, "copy_booking_date", "booking_slot", targetDate, `${sourceDate} 복사`);
  return Response.json({ ok: true });
}

async function setSlotBlock(actorId: number, payload: Record<string, unknown>) {
  const slotId = positiveBookingInteger(payload.slotId, "예약 시간");
  const blocked = payload.blocked === true;
  const reason = blocked ? bookingText(payload.reason, "차단 사유", 120) : "";
  if (blocked) {
    const confirmed = await getD1()
      .prepare("SELECT 1 FROM reservations WHERE slot_id = ? AND status = 'CONFIRMED'")
      .bind(slotId)
      .first();
    if (confirmed) throw new AuthError("확정 예약이 있어 먼저 예약을 취소해야 합니다.", 409);
  }
  await getD1()
    .prepare("UPDATE booking_slots SET status = ?, block_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(blocked ? "BLOCKED" : "OPEN", reason, slotId)
    .run();
  await audit(actorId, blocked ? "block_booking_slot" : "open_booking_slot", "booking_slot", String(slotId), reason);
  return Response.json({ ok: true });
}

async function setDateBlock(actorId: number, payload: Record<string, unknown>) {
  const date = bookingText(payload.date, "운영 날짜", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const blocked = payload.blocked === true;
  const reason = blocked ? bookingText(payload.reason, "차단 사유", 120) : "";
  if (blocked) {
    const confirmed = await getD1()
      .prepare(
        `SELECT 1 FROM reservations r JOIN booking_slots sl ON sl.id = r.slot_id
         WHERE substr(sl.start_at, 1, 10) = ? AND r.status = 'CONFIRMED' LIMIT 1`,
      )
      .bind(date)
      .first();
    if (confirmed) throw new AuthError("확정 예약이 있어 해당 날짜 전체를 차단할 수 없습니다.", 409);
  }
  const result = await getD1()
    .prepare(
      `UPDATE booking_slots SET status = ?, block_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE substr(start_at, 1, 10) = ?`,
    )
    .bind(blocked ? "BLOCKED" : "OPEN", reason, date)
    .run();
  if (!Number(result.meta.changes)) throw new Error("해당 날짜에 운영 시간이 없습니다.");
  await audit(actorId, blocked ? "block_booking_date" : "open_booking_date", "booking_slot", date, reason);
  return Response.json({ ok: true });
}

async function decideReservation(actorId: number, payload: Record<string, unknown>) {
  const reservationId = positiveBookingInteger(payload.reservationId, "예약");
  const decision = bookingText(payload.decision, "처리 상태", 30).toUpperCase();
  const adminMemo = optionalBookingText(payload.adminMemo, 500);
  const rejectionReason = optionalBookingText(payload.rejectionReason, 200);
  if (decision === "PROPOSE") {
    if (!adminMemo) throw new Error("회원에게 제안할 시간을 메모에 입력해 주세요.");
    await getD1().prepare("UPDATE reservations SET admin_memo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'REQUESTED'")
      .bind(adminMemo, reservationId).run();
    await audit(actorId, "propose_reservation_time", "reservation", String(reservationId), adminMemo);
    return Response.json({ ok: true });
  }
  if (!["CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(decision)) {
    throw new Error("예약 처리 상태가 올바르지 않습니다.");
  }
  if (decision === "CONFIRMED") return confirmReservation(actorId, reservationId, adminMemo);
  if (decision === "REJECTED" && !rejectionReason) throw new Error("회원에게 표시할 거절 사유를 입력해 주세요.");
  const allowedFrom = decision === "REJECTED" ? ["REQUESTED"] : decision === "CANCELLED" ? ["REQUESTED", "CONFIRMED"] : ["CONFIRMED"];
  const placeholders = allowedFrom.map(() => "?").join(",");
  const result = await getD1()
    .prepare(
      `UPDATE reservations SET status = ?, admin_memo = ?, rejection_reason = ?,
              cancelled_at = CASE WHEN ? = 'CANCELLED' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
              updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN (${placeholders})`,
    )
    .bind(decision, adminMemo, rejectionReason, decision, reservationId, ...allowedFrom)
    .run();
  if (!Number(result.meta.changes)) throw new AuthError("현재 상태에서는 처리할 수 없습니다.", 409);
  await audit(actorId, "decide_reservation", "reservation", String(reservationId), decision);
  return Response.json({ ok: true });
}

async function confirmReservation(actorId: number, reservationId: number, adminMemo: string) {
  const db = getD1();
  const row = await db.prepare(
    `SELECT r.id, r.member_id AS memberId, r.pass_id AS passId, r.status, sl.id AS slotId,
            sl.start_at AS startAt, sl.status AS slotStatus, st.active AS stationActive,
            m.approval_status AS approvalStatus
     FROM reservations r
     JOIN booking_slots sl ON sl.id = r.slot_id
     JOIN stations st ON st.id = sl.station_id
     JOIN booking_members m ON m.id = r.member_id
     WHERE r.id = ?`,
  ).bind(reservationId).first<{
    id: number; memberId: number; passId: number; status: string; slotId: number; startAt: string;
    slotStatus: string; stationActive: number; approvalStatus: string;
  }>();
  if (!row || row.status !== "REQUESTED") throw new AuthError("승인 대기 예약이 아닙니다.", 409);
  if (row.approvalStatus !== "APPROVED") throw new AuthError("승인된 회원이 아닙니다.", 409);
  if (row.slotStatus !== "OPEN" || !Number(row.stationActive) || !isFutureSlot(row.startAt)) {
    throw new AuthError("현재 이용 가능한 예약 시간이 아닙니다.", 409);
  }
  const pass = await db.prepare(
    `SELECT id, type, max_active_bookings AS maxActiveBookings
     FROM member_passes WHERE id = ? AND member_id = ? AND valid_month = ? AND status = 'ACTIVE'`,
  ).bind(row.passId, row.memberId, slotMonth(row.startAt)).first<{ id: number; type: "DAILY" | "MONTHLY"; maxActiveBookings: number | null }>();
  if (!pass) throw new AuthError("유효한 이용권이 없습니다.", 409);
  const conflict = await db.prepare(
    `SELECT
       MAX(CASE WHEN slot_id = ? AND status = 'CONFIRMED' THEN 1 ELSE 0 END) AS slotConflict,
       MAX(CASE WHEN member_id = ? AND slot_start_at = ? AND status = 'CONFIRMED' THEN 1 ELSE 0 END) AS memberConflict
     FROM reservations`,
  ).bind(row.slotId, row.memberId, row.startAt).first<{ slotConflict: number; memberConflict: number }>();
  if (Number(conflict?.slotConflict)) throw new AuthError("이미 확정된 스테이션입니다.", 409);
  if (Number(conflict?.memberConflict)) throw new AuthError("회원에게 같은 시간의 확정 예약이 있습니다.", 409);
  if (pass.type === "MONTHLY") {
    const sameDay = await db.prepare(
      `SELECT 1 FROM reservations
       WHERE member_id = ? AND substr(slot_start_at, 1, 10) = ?
         AND status IN ('CONFIRMED','COMPLETED')`,
    ).bind(row.memberId, slotDate(row.startAt)).first();
    if (sameDay) throw new AuthError("월 이용권은 하루에 한 타임만 확정할 수 있습니다.", 409);
  } else {
    const used = await db.prepare(
      `SELECT COUNT(*) AS count FROM reservations
       WHERE pass_id = ?
         AND status IN ('CONFIRMED','COMPLETED')`,
    ).bind(pass.id).first<{ count: number }>();
    if (Number(used?.count ?? 0) >= 1) throw new AuthError("1회 이용권은 이미 사용 중이거나 사용 완료되었습니다.", 409);
  }
  let maxActive = pass.maxActiveBookings;
  if (maxActive === null) {
    const setting = await db.prepare("SELECT value FROM app_settings WHERE key = 'booking_max_active_bookings'").first<{ value: string }>();
    maxActive = setting?.value ? Number(setting.value) : null;
  }
  if (maxActive !== null) {
    const active = await db.prepare(
      "SELECT COUNT(*) AS count FROM reservations WHERE member_id = ? AND status = 'CONFIRMED' AND datetime(slot_start_at) > datetime(?)",
    ).bind(row.memberId, new Date().toISOString()).first<{ count: number }>();
    if (Number(active?.count ?? 0) >= maxActive) throw new AuthError("동시에 보유할 수 있는 확정 예약 수를 초과합니다.", 409);
  }
  try {
    const result = await db.prepare(
      `UPDATE reservations SET status = 'CONFIRMED', admin_memo = ?,
              confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'REQUESTED'`,
    ).bind(adminMemo, reservationId).run();
    if (!Number(result.meta.changes)) throw new AuthError("다른 관리자가 먼저 처리했습니다.", 409);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AuthError("동시에 다른 예약이 확정되어 다시 확인이 필요합니다.", 409);
    throw error;
  }
  await audit(actorId, "confirm_reservation", "reservation", String(reservationId), row.startAt);
  return Response.json({ ok: true });
}

async function createPass(actorId: number, payload: Record<string, unknown>) {
  const memberId = positiveBookingInteger(payload.memberId, "회원");
  const type = bookingText(payload.type, "이용권", 20).toUpperCase();
  if (!["DAILY", "MONTHLY"].includes(type)) throw new Error("이용권 유형이 올바르지 않습니다.");
  const validMonth = validateBookingMonth(payload.validMonth);
  const member = await getD1().prepare("SELECT approval_status AS approvalStatus FROM booking_members WHERE id = ?")
    .bind(memberId).first<{ approvalStatus: string }>();
  if (member?.approvalStatus !== "APPROVED") throw new AuthError("승인된 회원에게만 이용권을 발급할 수 있습니다.", 409);
  const priceSettingKey = type === "DAILY" ? "booking_daily_price" : "booking_monthly_price";
  const priceRow = await getD1().prepare("SELECT value FROM app_settings WHERE key = ?").bind(priceSettingKey).first<{ value: string }>();
  const price = Number(priceRow?.value ?? (type === "DAILY" ? 50000 : 500000));
  const maxActiveBookings = payload.maxActiveBookings === null || payload.maxActiveBookings === ""
    ? null
    : positiveBookingInteger(payload.maxActiveBookings, "동시 예약 제한");
  const result = await getD1().prepare(
    `INSERT INTO member_passes
      (member_id, type, valid_month, price, status, max_active_bookings, created_by)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
  ).bind(memberId, type, validMonth, price, maxActiveBookings, actorId).run();
  const id = Number(result.meta.last_row_id);
  await audit(actorId, "create_member_pass", "member_pass", String(id), `${type} · ${validMonth} · ${price}원`);
  return Response.json({ id, price }, { status: 201 });
}

async function recordPayment(actorId: number, payload: Record<string, unknown>) {
  const memberId = positiveBookingInteger(payload.memberId, "회원");
  const reservationId = payload.reservationId ? positiveBookingInteger(payload.reservationId, "예약") : null;
  const passId = payload.passId ? positiveBookingInteger(payload.passId, "이용권") : null;
  if (!reservationId && !passId) throw new Error("결제 대상 예약 또는 이용권을 선택해 주세요.");
  const method = bookingText(payload.method, "결제수단", 10).toUpperCase();
  const status = bookingText(payload.status, "결제상태", 12).toUpperCase();
  if (!["CARD", "CASH"].includes(method) || !["UNPAID", "PAID", "REFUNDED"].includes(status)) {
    throw new Error("결제 정보가 올바르지 않습니다.");
  }
  let amount = 0;
  if (passId) {
    const pass = await getD1().prepare("SELECT price FROM member_passes WHERE id = ? AND member_id = ?")
      .bind(passId, memberId).first<{ price: number }>();
    if (!pass) throw new AuthError("회원의 이용권이 아닙니다.", 403);
    amount = Number(pass.price);
  } else {
    const reservation = await getD1().prepare("SELECT 1 FROM reservations WHERE id = ? AND member_id = ?")
      .bind(reservationId, memberId).first();
    if (!reservation) throw new AuthError("회원의 예약이 아닙니다.", 403);
    const setting = await getD1().prepare("SELECT value FROM app_settings WHERE key = 'booking_daily_price'").first<{ value: string }>();
    amount = Number(setting?.value ?? 50000);
  }
  const result = await getD1().prepare(
    `INSERT INTO booking_payments
      (member_id, reservation_id, pass_id, amount, method, status, paid_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'PAID' THEN CURRENT_TIMESTAMP ELSE NULL END, ?)`,
  ).bind(memberId, reservationId, passId, amount, method, status, status, actorId).run();
  const id = Number(result.meta.last_row_id);
  await audit(actorId, "record_booking_payment", "booking_payment", String(id), `${method} · ${status} · ${amount}원`);
  return Response.json({ id, amount }, { status: 201 });
}

async function updateSettings(actorId: number, payload: Record<string, unknown>) {
  const dailyPrice = positiveBookingInteger(payload.dailyPrice, "1회 이용권 가격");
  const monthlyPrice = positiveBookingInteger(payload.monthlyPrice, "월 이용권 가격");
  const cancelHours = nonNegativeBookingInteger(payload.cancelHours, "취소 가능 시간");
  const maxActive = payload.maxActiveBookings === null || payload.maxActiveBookings === ""
    ? ""
    : String(positiveBookingInteger(payload.maxActiveBookings, "동시 예약 제한"));
  const kakaoChatUrl = validateKakaoChatUrl(payload.kakaoChatUrl);
  const rows = [
    ["booking_daily_price", String(dailyPrice)],
    ["booking_monthly_price", String(monthlyPrice)],
    ["booking_cancel_hours", String(cancelHours)],
    ["booking_max_active_bookings", maxActive],
    ["booking_kakao_chat_url", kakaoChatUrl],
  ];
  await getD1().batch(rows.map(([key, value]) => getD1().prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
  ).bind(key, value, actorId)));
  await audit(actorId, "update_booking_settings", "app_setting", "booking", `${dailyPrice}/${monthlyPrice} · 카카오 상담 ${kakaoChatUrl ? "연결" : "미연결"}`);
  return Response.json({ ok: true });
}

function validateKakaoChatUrl(value: unknown): string {
  const raw = optionalBookingText(value, 300);
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("카카오톡 채널 링크 형식이 올바르지 않습니다.");
  }
  const allowedHosts = new Set(["pf.kakao.com", "open.kakao.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("pf.kakao.com 또는 open.kakao.com의 HTTPS 링크를 입력해 주세요.");
  }
  return url.toString();
}

async function answerFeedback(actorId: number, payload: Record<string, unknown>) {
  const feedbackId = positiveBookingInteger(payload.feedbackId, "피드백");
  const adminReply = bookingText(payload.adminReply, "답변", 1000);
  await getD1().prepare(
    "UPDATE booking_feedback SET status = 'ANSWERED', admin_reply = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(adminReply, feedbackId).run();
  await audit(actorId, "answer_booking_feedback", "booking_feedback", String(feedbackId), "답변 완료");
  return Response.json({ ok: true });
}

async function saveEvaluation(actorId: number, payload: Record<string, unknown>) {
  const evaluationId = positiveBookingInteger(payload.evaluationId, "내부평가");
  const score = (value: unknown, label: string) => {
    const number = nonNegativeBookingInteger(value, label);
    if (number > 100) throw new Error(`${label}은 100점 이하여야 합니다.`);
    return number;
  };
  const technicalScore = score(payload.technicalScore, "기술 숙련도");
  const consistencyScore = score(payload.consistencyScore, "결과 일관성");
  const sensoryScore = score(payload.sensoryScore, "관능 표현");
  const ruleScore = score(payload.ruleScore, "규정 이해");
  const ethicsStatus = bookingText(payload.ethicsStatus, "직업윤리", 30);
  const result = bookingText(payload.result, "평가 결과", 40);
  const note = optionalBookingText(payload.note, 1000);
  await getD1().prepare(
    `UPDATE internal_evaluations SET evaluator_id = ?, status = 'COMPLETED',
            technical_score = ?, consistency_score = ?, sensory_score = ?, rule_score = ?,
            ethics_status = ?, result = ?, note = ?, evaluated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(actorId, technicalScore, consistencyScore, sensoryScore, ruleScore, ethicsStatus, result, note, evaluationId).run();
  await audit(actorId, "complete_internal_evaluation", "internal_evaluation", String(evaluationId), result);
  return Response.json({ ok: true });
}

async function saveCandidate(actorId: number, payload: Record<string, unknown>) {
  const memberId = positiveBookingInteger(payload.memberId, "회원");
  const type = bookingText(payload.type, "후보 유형", 40).toUpperCase();
  const status = bookingText(payload.status, "후보 상태", 30).toUpperCase();
  if (!["MONTHLY_COFFEE_CONTENT", "KCL_JUDGE"].includes(type)) throw new Error("후보 유형이 올바르지 않습니다.");
  if (!["TRAINING", "ELIGIBLE", "UNDER_REVIEW", "SELECTED", "NOT_SELECTED", "SUSPENDED"].includes(status)) {
    throw new Error("후보 상태가 올바르지 않습니다.");
  }
  const conflictNote = optionalBookingText(payload.conflictNote, 1000);
  await getD1().prepare(
    `INSERT INTO opportunity_candidates
      (member_id, type, status, conflict_note, final_decision_by, decided_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CASE WHEN ? IN ('SELECTED','NOT_SELECTED') THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
     ON CONFLICT(member_id, type) DO UPDATE SET
       status = excluded.status, conflict_note = excluded.conflict_note,
       final_decision_by = excluded.final_decision_by, decided_at = excluded.decided_at,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(memberId, type, status, conflictNote, actorId, status).run();
  await audit(actorId, "update_opportunity_candidate", "booking_member", String(memberId), `${type} · ${status} · ${conflictNote}`);
  return Response.json({ ok: true });
}

async function placeholdersQuery(prefix: string, values: number[]): Promise<Array<{ id: number }>> {
  const placeholders = values.map(() => "?").join(",");
  const result = await getD1().prepare(`${prefix} (${placeholders}) ORDER BY display_order, id`).bind(...values).all<{ id: number }>();
  return result.results;
}
