import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingDateTime,
  bookingMonthRange,
  getBookingTime,
  normalizeMemberLoginId,
  validateBookingDateInMonth,
  validateBookingMonth,
  validateBookingTimeRange,
} from "../lib/booking.ts";

const root = new URL("../", import.meta.url);

test("booking month and the three fixed operating times are validated", () => {
  assert.equal(validateBookingMonth("2026-09"), "2026-09");
  assert.throws(() => validateBookingMonth("2026-13"));
  assert.deepEqual(bookingMonthRange("2026-12"), {
    start: "2026-12-01T00:00:00+09:00",
    end: "2027-01-01T00:00:00+09:00",
  });
  assert.equal(getBookingTime("MORNING").start, "09:00");
  assert.equal(getBookingTime("AFTERNOON").end, "17:30");
  assert.equal(bookingDateTime("2026-09-02", "12:00"), "2026-09-02T12:00:00+09:00");
  assert.equal(normalizeMemberLoginId(" cup-1001 "), "CUP-1001");
  assert.throws(() => normalizeMemberLoginId("한글아이디"));
  assert.equal(validateBookingDateInMonth("2026-09-30", "2026-09"), "2026-09-30");
  assert.throws(() => validateBookingDateInMonth("2026-09-31", "2026-09"));
  assert.throws(() => validateBookingDateInMonth("2026-10-01", "2026-09"));
  assert.deepEqual(validateBookingTimeRange("09:30", "12:00"), { start: "09:30", end: "12:00" });
  assert.throws(() => validateBookingTimeRange("12:00", "09:30"));
  assert.throws(() => validateBookingTimeRange("24:00", "25:00"));
});

test("reservation storage enforces passes and concurrent confirmation conflicts", async () => {
  const [schema, migration, passMigration, adminRoute, memberRoute] = await Promise.all([
    readFile(new URL("lib/booking-schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0011_mute_deathbird.sql", root), "utf8"),
    readFile(new URL("drizzle/0012_premium_may_parker.sql", root), "utf8"),
    readFile(new URL("app/api/booking/admin/route.ts", root), "utf8"),
    readFile(new URL("app/api/booking/member/route.ts", root), "utf8"),
  ]);
  for (const table of ["booking_members", "stations", "booking_slots", "member_passes", "reservations", "booking_payments", "practice_logs", "internal_evaluations", "opportunity_candidates"]) {
    assert.match(`${schema}\n${migration}`, new RegExp(table));
  }
  assert.match(schema, /reservations_confirmed_slot_unique/);
  assert.match(schema, /reservations_confirmed_member_time_unique/);
  assert.match(schema, /status = 'CONFIRMED'/);
  assert.match(schema, /booking_kakao_chat_url/);
  assert.doesNotMatch(schema, /스테이션 1/);
  assert.match(schema, /WHERE NOT EXISTS \(SELECT 1 FROM stations WHERE type/);
  assert.match(passMigration, /ADD `pass_id` integer NOT NULL REFERENCES member_passes/);
  assert.match(memberRoute, /pass\.id/);
  assert.match(adminRoute, /WHERE id = \? AND member_id = \? AND valid_month = \? AND status = 'ACTIVE'/);
  assert.match(adminRoute, /월 이용권은 하루에 한 타임만 확정/);
  assert.match(adminRoute, /WHERE pass_id = \?/);
  assert.match(adminRoute, /다른 관리자가 먼저 처리/);
});

test("three audience paths, public availability and private member data stay separated", async () => {
  const [consultation, availability, loginRoute, memberAuth, memberRoute, adminRoute, database, loginMigration, worker, portal, admin, styles] = await Promise.all([
    readFile(new URL("app/api/booking/public/consultations/route.ts", root), "utf8"),
    readFile(new URL("app/api/booking/public/availability/route.ts", root), "utf8"),
    readFile(new URL("app/api/member-auth/login/route.ts", root), "utf8"),
    readFile(new URL("lib/member-auth.ts", root), "utf8"),
    readFile(new URL("app/api/booking/member/route.ts", root), "utf8"),
    readFile(new URL("app/api/booking/admin/route.ts", root), "utf8"),
    readFile(new URL("lib/db.ts", root), "utf8"),
    readFile(new URL("drizzle/0013_bitter_forge.sql", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/components/BookingPortal.tsx", root), "utf8"),
    readFile(new URL("app/components/BookingAdmin.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(consultation, /MAX_REQUESTS = 3/);
  assert.match(consultation, /phoneHash/);
  assert.match(consultation, /Cache-Control.*public, max-age=30/s);
  assert.match(availability, /NOT EXISTS/);
  assert.match(availability, /r\.status = 'CONFIRMED'/);
  assert.match(availability, /Cache-Control.*public, max-age=30/s);
  assert.match(availability, /booking_kakao_chat_url/);
  assert.match(availability, /consultationUrl/);
  assert.doesNotMatch(availability, /memberName|phone|email|memo|member_id/);
  assert.match(loginRoute, /login_id = \? AND phone_hash = \?/);
  assert.doesNotMatch(loginRoute, /WHERE name = \?/);
  assert.match(memberAuth, /approval_status = 'APPROVED'/);
  assert.match(memberAuth, /login_id AS loginId/);
  assert.match(memberAuth, /HttpOnly; SameSite=Strict/);
  assert.match(memberRoute, /requireMember\(request\)/);
  assert.match(memberRoute, /WHERE r\.member_id = \?/);
  assert.doesNotMatch(memberRoute, /phone_last4|phone_hash|consultation_memo/);
  assert.match(adminRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(adminRoute, /saveCandidate/);
  assert.match(adminRoute, /setMemberLoginId/);
  assert.match(adminRoute, /validateKakaoChatUrl/);
  assert.match(adminRoute, /pf\.kakao\.com/);
  assert.match(adminRoute, /payload\.dates/);
  assert.match(adminRoute, /payload\.times/);
  assert.match(adminRoute, /WHERE NOT EXISTS/);
  assert.match(adminRoute, /start_at < \? AND end_at > \?/);
  assert.match(adminRoute, /MIN\(substr\(start_at, 1, 7\)\) AS month/);
  assert.match(adminRoute, /scheduleMonths/);
  assert.match(admin, /월간 일정 일괄 생성/);
  assert.match(admin, /등록된 일정/);
  assert.match(admin, /window\.setInterval\(\(\) => void load\(\), 30_000\)/);
  assert.match(admin, /평일 전체/);
  assert.match(admin, /선택 일정 일괄 생성/);
  assert.match(styles, /\.booking-batch-calendar/);
  assert.match(styles, /\.booking-batch-config/);
  assert.match(database, /ensureBookingMemberLoginIds/);
  assert.match(database, /CUP\$\{String\(member\.id\)\.padStart/);
  assert.match(loginMigration, /ADD `login_id` text/);
  assert.match(loginMigration, /UNIQUE INDEX/);
  assert.match(worker, /X-Content-Type-Options/);
  assert.match(worker, /Permissions-Policy/);
  assert.match(portal, /수업 예정자/);
  assert.match(portal, /수강생 ID/);
  assert.match(portal, /운영자 로그인/);
  assert.match(portal, /api\/booking\/public\/availability/);
  assert.match(portal, /\?view=visitor#portal-entry-content/);
  assert.match(portal, /\?view=student#portal-entry-content/);
  assert.match(portal, /<a href=\{availability\.consultationUrl\}>카카오톡 상담<\/a>/);
  assert.match(portal, /<Link href="\/\?view=consultation#portal-entry-content">/);
  assert.match(portal, /id="portal-entry-content"/);
  assert.match(portal, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(portal, /카카오톡 상담/);
  assert.match(portal, /window\.setInterval\(\(\) => void loadAvailability\(\), 30_000\)/);
  assert.match(admin, /name="kakaoChatUrl"/);
  assert.match(portal, /예약은 운영자 승인 후 확정/);
  assert.match(admin, /내부평가 결과는 후보 선정으로 자동 연결되지 않습니다/);
  assert.match(styles, /Reservation portal v2/);
  assert.match(styles, /\.portal-mobile-nav/);
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /background: #fff/);
});
