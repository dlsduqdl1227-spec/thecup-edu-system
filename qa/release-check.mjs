import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : "playwright");
const baseURL = "http://127.0.0.1:5173"; // Deliberately not configurable to a live site.
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const report = { checks: [], screens: [], pageErrors: [], consoleErrors: [] };
const output = "outputs/qa";
await mkdir(output, { recursive: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Seoul" });
const student = await browser.newContext({ baseURL, viewport: { width: 360, height: 900 }, timezoneId: "America/Los_Angeles" });
const page = await context.newPage();
const memberPage = await student.newPage();
for (const current of [page, memberPage]) {
  current.on("pageerror", (error) => report.pageErrors.push(error.message));
  current.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(`${message.text()} ${message.location().url}`); });
}
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function api(client, path, data, method = "POST") {
  const response = data === undefined ? await client.get(path) : await client.fetch(path, { method, data });
  assert.ok(response.ok(), `${path} ${response.status()} ${await response.text()}`);
  return response.json();
}
async function capture(current, name, fullPage = false) {
  await current.screenshot({ path: `${output}/${name}.png`, fullPage });
  const measured = await current.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, brokenImages: [...document.images].filter((image) => image.getBoundingClientRect().width && (!image.complete || !image.naturalWidth)).map((image) => image.src) }));
  report.screens.push({ name, ...measured });
  assert.equal(measured.overflow, false, `${name}: horizontal overflow`);
  assert.deepEqual(measured.brokenImages, [], `${name}: broken images`);
}
async function nav(name) { await page.locator(".side-nav").getByRole("button", { name: new RegExp(name) }).click(); }
async function postClick(current, locator, path) { const pending = current.waitForResponse((response) => response.url().includes(path) && response.request().method() === "POST"); await locator.click(); const response = await pending; assert.ok(response.ok(), await response.text()); return response.json(); }
try {
  const status = await api(context.request, "/api/auth/status");
  if (status.bootstrapRequired) await api(context.request, "/api/auth/bootstrap", { name: "QA 운영자", phone: "01000009901", code: "local-browser-qa" });
  await api(context.request, "/api/auth/logout", {});
  await page.goto("/admin");
  await page.locator('input[name="name"]').fill("QA 운영자");
  await page.locator('input[name="phone"]').fill("01000009901");
  await postClick(page, page.getByRole("button", { name: "로그인", exact: true }), "/api/auth/login");
  await page.locator(".side-nav").waitFor();
  check("운영자 실제 폼 로그인");
  await nav("운영 · 개강 관리");
  await page.getByLabel("기준 월").fill("2026-10");
  await page.locator('.booking-batch-calendar[aria-label="2026-10 일정 선택 달력"]').waitFor();
  await page.locator(".booking-batch-calendar .days").getByRole("button", { name: /^13/ }).click();
  await postClick(page, page.getByRole("button", { name: "선택 일정 일괄 생성" }), "/api/booking/admin");
  await page.locator(".opening-schedule-days").getByText("13일", { exact: true }).waitFor();
  check("달력 일괄 생성 → 같은 화면 개강 영역 즉시 동기화");
  for (const month of ["2026-11", "2026-12"]) await api(context.request, "/api/booking/admin", { action: "generateSlots", month, dates: [`${month}-05`], timeKeys: ["MORNING"] });
  for (const tab of ["예약 요청", "상담·회원", "현장 결제", "피드백", "운영 설정", "스케줄"]) {
    await page.locator(".booking-admin-tabs").getByRole("button", { name: tab, exact: true }).click();
    for (const width of [1440, 768, 360]) { await page.setViewportSize({ width, height: 900 }); await capture(page, `booking-${tab}-${width}`); }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A failed save must leave the user's input in place.
  const stationName = page.getByRole("textbox", { name: "스테이션 이름" });
  await stationName.fill("에스프레소 스테이션");
  const failure = page.waitForResponse((response) => response.url().endsWith("/api/booking/admin") && response.request().method() === "POST");
  await page.locator(".booking-admin-stations form").getByRole("button", { name: "추가", exact: true }).click();
  assert.equal((await failure).status(), 409);
  assert.equal(await stationName.inputValue(), "에스프레소 스테이션");
  check("실패한 스테이션 저장의 입력 내용 보존");

  const suffix = String(Date.now()).slice(-8);
  const studentName = `QA 수강생 ${suffix}`;
  const phone = `010${suffix}`;
  await memberPage.goto("/?view=consultation");
  await memberPage.locator('input[name="name"]').fill(studentName);
  await memberPage.locator('input[name="phone"]').fill(phone);
  await memberPage.locator('textarea[name="consultationMemo"]').fill("QA 테스트 상담");
  await postClick(memberPage, memberPage.getByRole("button", { name: "상담 신청", exact: true }), "/api/booking/public/consultations");
  await page.locator(".booking-admin-tabs").getByRole("button", { name: "상담·회원" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const memberCard = page.locator(".booking-admin-member-list article").filter({ hasText: studentName });
  await memberCard.waitFor();
  page.once("dialog", (dialog) => dialog.accept("QA 상담 승인"));
  await postClick(page, memberCard.getByRole("button", { name: "상담 완료·승인" }), "/api/booking/admin");
  check("상담 신청 → 관리자 회원 DB 표시 → 승인");
  await memberPage.getByRole("link", { name: /수강생/ }).click();
  await memberPage.locator('input[name="name"]').fill(studentName);
  await memberPage.locator('input[name="phone"]').fill(phone);
  await postClick(memberPage, memberPage.getByRole("button", { name: "로그인", exact: true }), "/api/member-auth/login");
  await memberPage.getByLabel("조회 월").fill("2026-10");
  await memberPage.getByRole("button", { name: "예약 요청", exact: true }).first().waitFor();
  assert.match(await memberPage.locator(".portal-day-panel h2").innerText(), /10월 13일 화요일/);
  await capture(memberPage, "student-schedule-360", true);
  const reserveButton = memberPage.getByRole("button", { name: "예약 요청", exact: true }).first();
  await reserveButton.click();
  await memberPage.getByRole("dialog").waitFor();
  await memberPage.keyboard.press("Escape");
  assert.equal(await memberPage.getByRole("dialog").count(), 0);
  assert.ok(await reserveButton.evaluate((element) => document.activeElement === element));
  await reserveButton.click();
  for (let index = 0; index < 9; index++) { await memberPage.keyboard.press("Tab"); assert.ok(await memberPage.evaluate(() => Boolean(document.activeElement?.closest("dialog")))); }
  await memberPage.getByLabel("전달 메모").fill("QA 예약 메모");
  await capture(memberPage, "student-reservation-dialog-360");
  const reservation = await postClick(memberPage, memberPage.getByRole("dialog").getByRole("button", { name: "예약 요청", exact: true }), "/api/booking/member");
  check("승인 수강생 이용권 없이 예약 · 한국 요일 · 모달 Escape/포커스 순환");
  await page.locator(".booking-admin-tabs").getByRole("button", { name: "예약 요청", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const requestCard = page.locator(".booking-admin-request").filter({ hasText: studentName });
  await requestCard.waitFor();
  page.once("dialog", (dialog) => dialog.accept("QA 예약 확정"));
  await postClick(page, requestCard.getByRole("button", { name: "승인", exact: true }), "/api/booking/admin");
  await memberPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await memberPage.locator(".portal-slot.confirmed").waitFor();
  check("예약 승인 → 수강생 일정 갱신");
  await memberPage.locator(".portal-mobile-nav").getByRole("button", { name: "내 예약", exact: true }).click();
  await capture(memberPage, "student-reservations-360", true);
  await postClick(memberPage, memberPage.getByRole("button", { name: "예약 취소", exact: true }).first(), "/api/booking/member");
  const fresh = await api(context.request, "/api/booking/admin?month=2026-10");
  assert.equal(fresh.reservations.find((row) => row.id === reservation.id).status, "CANCELLED");
  check("수강생 예약 취소 → 관리자 DB 반영");
  await memberPage.locator(".portal-mobile-nav").getByRole("button", { name: "기록", exact: true }).click();
  await capture(memberPage, "student-practice-360", true);
  await memberPage.locator(".portal-mobile-nav").getByRole("button", { name: "스케줄", exact: true }).click();
  // Delay October behind November to reproduce the original stale response bug.
  await memberPage.route("**/api/booking/member?month=2026-10", async (route) => { const response = await route.fetch(); await new Promise((resolve) => setTimeout(resolve, 600)); await route.fulfill({ response }); });
  await memberPage.getByLabel("조회 월").fill("2026-12");
  await memberPage.waitForResponse((response) => response.url().includes("member?month=2026-12"));
  await memberPage.getByLabel("조회 월").fill("2026-10");
  await memberPage.getByLabel("조회 월").fill("2026-11");
  await memberPage.waitForResponse((response) => response.url().includes("member?month=2026-11"));
  await memberPage.waitForTimeout(800);
  assert.match(await memberPage.locator(".portal-day-panel h2").innerText(), /11월 5일/);
  await memberPage.unroute("**/api/booking/member?month=2026-10");
  check("월 빠른 전환과 느린 응답 역전 회귀 테스트");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav("매출 및 지출 등록");
  await page.getByRole("radio", { name: "지출", exact: true }).click();
  await page.getByRole("radio", { name: "장비 · 소모품", exact: true }).click();
  await page.locator('input[name="amount"]').fill("12000");
  await page.locator('textarea[name="description"]').fill("QA 비품 구매");
  await postClick(page, page.getByRole("button", { name: "장부에 반영" }), "/api/finance");
  check("매출·지출 선택형 분류와 저장");
  await nav("로스팅 프로파일");
  await page.getByRole("button", { name: "새 프로파일 바로 입력" }).click();
  await page.locator('input[name="beanName"]').fill(`QA 로스팅 ${suffix}`);
  await page.getByRole("radio", { name: "에티오피아", exact: true }).click();
  await page.getByRole("radio", { name: "Washed", exact: true }).click();
  await page.getByRole("button", { name: "중간 포인트 추가" }).click();
  await capture(page, "roasting-form-desktop");
  await page.setViewportSize({ width: 360, height: 900 });
  await capture(page, "roasting-form-360");
  await postClick(page, page.getByRole("button", { name: "프로파일 저장", exact: true }), "/api/roasting");
  check("선택형 로스팅 입력 · 중간 포인트 · 저장");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav("수업 사용 기록");
  const milkForm = page.locator("form").filter({ has: page.getByRole("button", { name: "구매 내역 반영" }) });
  await milkForm.locator('input[name="quantity"]').fill("3");
  await milkForm.locator('input[name="amount"]').fill("7500");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=", "base64");
  await milkForm.locator('input[type="file"]:not([capture])').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await milkForm.getByRole("button", { name: "구매 내역 반영" }).waitFor();
  await postClick(page, milkForm.getByRole("button", { name: "구매 내역 반영" }), "/api/inventory/milk-purchase");
  check("앨범 파일 첨부 · 압축 · 영수증/재고/지출 저장");
  await page.setViewportSize({ width: 360, height: 900 });
  await capture(page, "instructor-receipt-360");
  await postClick(page, page.locator(".mobile-header").getByRole("button", { name: "로그아웃" }), "/api/auth/logout");
  await page.locator('input[name="name"]').waitFor();
  check("모바일 운영자 로그아웃");
  assert.deepEqual(report.pageErrors, []);
} finally {
  await writeFile(`${output}/release-check.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks.length, screens: report.screens.length, pageErrors: report.pageErrors, consoleErrors: report.consoleErrors }, null, 2));
  await browser.close();
}
