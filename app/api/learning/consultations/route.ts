import { AuthError, normalizePhone, phoneHash, sha256 } from "../../../../lib/auth";
import { bookingText, optionalBookingText } from "../../../../lib/booking";
import { encryptContact } from "../../../../lib/consultation-contact";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../../lib/http";
import { ageRanges, contactChannels, discoveryChannels, interestOptions } from "../../../../lib/learning-catalog";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.text();
    if (body.length > 8000) throw new AuthError("신청 내용이 너무 깁니다.", 413);
    const input = JSON.parse(body) as Record<string, unknown>;
    const name = bookingText(input.name, "성함", 40).replace(/\s+/g, " ");
    const phone = normalizePhone(String(input.phone ?? ""));
    const age = bookingText(input.ageRange, "연령대", 20);
    const discovery = bookingText(input.discovery, "알게 된 경로", 30);
    const contact = bookingText(input.contactChannel, "상담 방법", 20);
    if (!ageRanges.includes(age) || !discoveryChannels.includes(discovery) || !contactChannels.includes(contact)) throw new Error("신청 항목을 다시 선택해 주세요.");
    const interests = Array.isArray(input.interests) ? [...new Set(input.interests)] : [];
    if (!interests.length || interests.length > interestOptions.length || interests.some(id => !interestOptions.some(option => option.id === id))) throw new Error("관심 과정을 하나 이상 선택해 주세요.");
    if (input.consent !== true) throw new Error("상담을 위한 개인정보 수집·이용에 동의해 주세요.");
    const message = optionalBookingText(input.message, 1000);
    await ensureDatabase();
    const db = getD1();
    const hashed = await phoneHash(phone);
    // Both identifiers are hashed. Atomic conditional updates prevent parallel rate-limit bypass.
    const ip = request.headers.get("cf-connecting-ip");
    for (const [identifier, max] of [[`learning-phone:${hashed}`, 3], ...(ip ? [[`learning-ip:${await sha256(ip)}`, 20]] : [])] as Array<[string, number]>) {
      const now = new Date().toISOString();
      const cutoff = new Date(Date.now() - 3600000).toISOString();
      const result = await db.prepare(`INSERT INTO public_request_limits(identifier_hash, window_start, request_count) VALUES (?, ?, 1)
        ON CONFLICT(identifier_hash) DO UPDATE SET
          window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END,
          request_count = CASE WHEN window_start < ? THEN 1 ELSE request_count + 1 END
        WHERE window_start < ? OR request_count < ?`).bind(identifier, now, cutoff, cutoff, cutoff, max).run();
      if (!result.meta.changes) throw new AuthError("상담 신청이 이미 여러 번 접수되었습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    const encrypted = await encryptContact(phone);
    const results = await db.batch([
      db.prepare(`INSERT INTO booking_members(name, phone_hash, phone_last4, consultation_memo)
        VALUES (?, ?, ?, '교육 상담 신청') ON CONFLICT(phone_hash) DO NOTHING`).bind(name, hashed, phone.slice(-4)),
      db.prepare(`INSERT INTO learning_consultations(member_id, name, phone_encrypted, age_range, discovery, interests, contact_channel, message, consent_version)
        SELECT id, ?, ?, ?, ?, ?, ?, ?, '2026-10-29' FROM booking_members WHERE phone_hash = ? AND deleted_at IS NULL`)
        .bind(name, encrypted, age, discovery, JSON.stringify(interests), contact, message, hashed),
    ]);
    if (!results[1].meta.changes) throw new Error("이 번호는 온라인 접수가 어렵습니다. 카카오톡으로 상담해 주세요.");
    return Response.json({ ok: true, message: "상담 신청이 접수되었습니다. 담당자가 확인한 뒤 선택하신 방법으로 안내합니다." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
