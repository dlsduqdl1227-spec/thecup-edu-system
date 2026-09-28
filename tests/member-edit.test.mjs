import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  describeMemberChanges,
  loginChanged,
  normalizeMemberName,
  normalizeStationType,
} from "../lib/member-edit.ts";

const root = new URL("../", import.meta.url);
const base = {
  name: "김수강",
  phoneHash: "hash-old",
  phoneLast4: "1234",
  desiredStationType: "ESPRESSO",
  consultationMemo: "상담 메모",
  adminMemo: "",
};

test("member edit input is normalized like login", () => {
  assert.equal(normalizeMemberName("  김   수강 "), "김 수강");
  assert.throws(() => normalizeMemberName("   "));
  assert.throws(() => normalizeMemberName("가".repeat(41)));
  assert.equal(normalizeStationType(" brewing "), "BREWING");
  assert.equal(normalizeStationType(""), "");
  assert.throws(() => normalizeStationType("에스프레소"));
});

test("member changes are described without exposing the phone number", () => {
  assert.deepEqual(describeMemberChanges(base, { ...base }), []);
  assert.equal(loginChanged(base, { ...base, adminMemo: "메모" }), false);

  const moved = { ...base, name: "김수강2", phoneHash: "hash-new", phoneLast4: "5678", adminMemo: "번호 변경" };
  assert.deepEqual(describeMemberChanges(base, moved), ["이름", "휴대폰(뒷자리 5678)", "관리자 메모"]);
  assert.equal(loginChanged(base, moved), true);
  assert.ok(!describeMemberChanges(base, moved).join(" ").includes("010"));
});

test("administrators can edit member details at any time", async () => {
  const [adminRoute, admin] = await Promise.all([
    readFile(new URL("app/api/booking/admin/route.ts", root), "utf8"),
    readFile(new URL("app/components/BookingAdmin.tsx", root), "utf8"),
  ]);
  assert.match(adminRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(adminRoute, /action === "updateMember"/);
  assert.match(adminRoute, /WHERE phone_hash = \? AND id <> \?/);
  assert.match(adminRoute, /WHERE id = \? AND deleted_at IS NULL/);
  assert.match(adminRoute, /if \(resetLogin\) statements\.push\(db\.prepare\("DELETE FROM member_sessions WHERE member_id = \?"\)/);
  assert.match(adminRoute, /"update_booking_member"/);
  assert.doesNotMatch(adminRoute, /phone_full|phone_number/);
  assert.match(admin, /정보 수정/);
  assert.match(admin, /action: "updateMember"/);
  assert.match(admin, /바꿀 때만 입력/);
  assert.match(admin, /새 정보로 다시 로그인/);
});
