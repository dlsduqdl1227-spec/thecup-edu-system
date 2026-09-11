import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : "playwright");
const baseURL = "https://thecup-edu-system.dlsduqdl1227.workers.dev";
const report = { checks: [], responses: [], errors: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const context = await browser.newContext({ viewport: { width: 360, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
await mkdir("outputs/qa", { recursive: true });
try {
  // Strictly read-only production checks: no reservations, logins, records or settings are written.
  for (const path of ["/", "/admin", "/?view=student", "/?view=visitor", "/embed/course-openings?month=2026-10"]) {
    const response = await page.goto(baseURL + path);
    assert.equal(response.status(), 200);
    if (path === "/admin") await page.getByRole("heading", { name: "직원 로그인", exact: true }).waitFor();
    else if (path.includes("view=student")) await page.getByRole("button", { name: "로그인", exact: true }).waitFor();
    else if (path.includes("view=visitor")) {
      await page.getByRole("heading", { name: "월별 남은 스테이션" }).waitFor();
      await page.locator(".portal-calendar .days button").first().waitFor();
    } else if (path.includes("/embed/")) await page.locator(".public-openings-summary, .public-openings-hidden").waitFor();
    else await page.getByRole("heading", { name: "수업 예정자", exact: true }).waitFor();
    await page.screenshot({ path: `outputs/qa/live-${report.responses.length}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, path);
    report.responses.push({ path, status: response.status() });
  }
  for (const path of ["/api/dashboard", "/api/staff", "/api/booking/admin", "/api/booking/member", "/api/course-openings", "/api/roasting"]) {
    const response = await context.request.get(baseURL + path); assert.equal(response.status(), 401); report.responses.push({ path, status: response.status() });
  }
  report.checks.push("공개 화면 200 · 모바일 가로 넘침 없음 · 비로그인 관리자 API 401");
  const closure = (date, start = "00:00", end = "23:59") => ({ date, start, end });
  const blocked = [
    ...Array.from({ length: 9 }, (_, i) => closure(`2026-10-${String(i + 1).padStart(2, "0")}`)),
    closure("2026-10-12", "13:00", "18:00"), ...[19, 20, 21].map((day) => closure(`2026-10-${day}`)), closure("2026-10-22", "14:00", "18:00"), closure("2026-10-30", "14:00", "18:00"),
    ...[10, 11, 12, 13].map((day) => closure(`2026-11-${day}`)), closure("2026-11-26", "14:00", "18:00"),
    ...[2, 7, 9, 14, 16].map((day) => closure(`2026-12-${String(day).padStart(2, "0")}`, "09:00", "14:00")), closure("2026-12-17", "14:00", "18:00"),
  ];
  for (const month of ["2026-09", "2026-10", "2026-11", "2026-12"]) {
    const response = await context.request.get(`${baseURL}/api/booking/public/availability?month=${month}`);
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert.equal(data.consultationUrl, "https://pf.kakao.com/_XRQdn/chat");
    assert.ok(data.slots.length > 0, `${month}: existing schedule retained`);
    assert.doesNotMatch(JSON.stringify(data), /phone|memberName|memberId|payment|userMemo/);
    for (const slot of data.slots) assert.equal(blocked.some((period) => slot.startAt.startsWith(period.date) && slot.startAt.slice(11, 16) < period.end && slot.endAt.slice(11, 16) > period.start), false, `휴강 중 공개: ${slot.startAt}`);
    report.responses.push({ month, slots: data.slots.length, kakao: data.consultationUrl });
  }
  report.checks.push("9월 현행 유지 · 10~12월 기존 휴강 시간 준수 · 카카오 HTTPS 연결 설정");
  // Origin fixtures are intercepted locally; neither Creatorlink nor another website is edited.
  await context.route("https://coffeemonthly.creatorlink.net/__thecup-qa", (route) => route.fulfill({ contentType: "text/html", body: `<html><body style="margin:0"><iframe title="더컵에듀 개강 현황" src="${baseURL}/embed/course-openings?month=2026-10" style="width:100%;height:850px;border:0"></iframe></body></html>` }));
  await page.goto("https://coffeemonthly.creatorlink.net/__thecup-qa");
  await page.frameLocator("iframe").locator("main").waitFor();
  await page.screenshot({ path: "outputs/qa/creatorlink-iframe-360.png", fullPage: true });
  const embedded = await context.request.get(`${baseURL}/embed/course-openings?month=2026-10`);
  assert.match(embedded.headers()["content-security-policy"], /https:\/\/\*\.creatorlink.net/);
  assert.equal(embedded.headers()["x-frame-options"], undefined);
  report.checks.push("Creatorlink 출처를 재현한 실제 브라우저 iframe 표시 · CSP 헤더");
  const chat = await context.request.get("https://pf.kakao.com/_XRQdn/chat");
  assert.equal(chat.status(), 200);
  report.checks.push("카카오 상담 URL HTTPS 200 (메시지 전송 없음)");
  assert.deepEqual(report.errors, []);
} finally { await writeFile("outputs/qa/live-smoke.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close(); }
