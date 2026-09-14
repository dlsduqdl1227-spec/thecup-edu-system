import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const baseURL = "http://127.0.0.1:5173";
await mkdir("outputs/qa", { recursive: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const student = await browser.newContext({ baseURL, viewport: { width: 360, height: 900 } });
const page = await context.newPage(); const studentPage = await student.newPage();
const errors = [];
for (const tab of [page, studentPage]) tab.on("pageerror", (error) => errors.push(error.message));
async function send(client, path, data, method = "POST") { const response = await client.fetch(path, { method, data }); assert.ok(response.ok(), await response.text()); return response.json(); }
async function login(code) {
  await page.goto("/admin");
  await page.locator('input[name="name"]').fill("QA 운영자");
  await page.locator('input[name="phone"]').fill("01000009901");
  await page.getByLabel("보안코드", { exact: true }).fill(code);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.locator(".side-nav").waitFor();
}
async function settings() { await page.locator(".side-nav").getByRole("button", { name: /직원 · 권한/ }).click(); await page.locator(".login-security-panel").waitFor(); }
async function change(audience, code, currentCode = "7319") {
  const panel = page.locator(".login-security-panel");
  await panel.getByLabel("변경 대상").selectOption(audience);
  await panel.getByLabel("현재 운영자 보안코드").fill(currentCode);
  await panel.getByLabel("새 보안코드", { exact: true }).fill(code);
  await panel.getByLabel("새 보안코드 확인").fill(code);
  const pending = page.waitForResponse((response) => response.url().includes("/api/auth/security-code") && response.request().method() === "PATCH");
  await panel.getByRole("button", { name: "보안코드 변경" }).click();
  const response = await pending; assert.equal(response.status(), 200);
}
try {
  const status = await (await context.request.get("/api/auth/status")).json();
  if (status.bootstrapRequired) await send(context.request, "/api/auth/bootstrap", { name: "QA 운영자", phone: "01000009901", code: "local-browser-qa", securityCode: "7319" });
  await send(context.request, "/api/auth/logout", {});
  await page.goto("/admin");
  await page.getByLabel("보안코드", { exact: true }).waitFor();
  assert.equal(await page.getByText("게스트 조회", { exact: true }).count(), 0);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `outputs/qa/security-login-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login("7319");
  await send(student.request, "/api/booking/public/consultations", { name: "QA 보안 수강생", phone: "01000009988", desiredStationType: "ESPRESSO", consultationMemo: "격리 환경 보안 로그인 검증" });
  const members = await (await context.request.get("/api/booking/admin")).json();
  const member = members.members.find((row) => row.name === "QA 보안 수강생");
  await send(context.request, "/api/booking/admin", { action: "approveMember", memberId: member.id, approved: true });
  await studentPage.goto("/?view=student");
  await studentPage.getByLabel("이름", { exact: true }).fill("QA 보안 수강생");
  await studentPage.getByLabel("등록된 휴대폰 번호").fill("01000009988");
  await studentPage.getByLabel("보안코드", { exact: true }).fill("08372");
  await studentPage.screenshot({ path: "outputs/qa/security-student-360.png", fullPage: true });
  await studentPage.getByRole("button", { name: "로그인", exact: true }).click();
  await studentPage.getByRole("heading", { name: "스테이션 예약", exact: true }).waitFor();
  await settings();
  await page.setViewportSize({ width: 360, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator(".login-security-panel").screenshot({ path: "outputs/qa/security-settings-360.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await change("student", "00444");
  assert.equal((await (await student.request.get("/api/member-auth/status")).json()).member, null);
  assert.equal((await student.request.post("/api/member-auth/login", { data: { name: "QA 보안 수강생", phone: "01000009988", securityCode: "08372" } })).status(), 401);
  await send(student.request, "/api/member-auth/login", { name: "QA 보안 수강생", phone: "01000009988", securityCode: "00444" });
  await change("student", "08372");
  await change("operator", "845612");
  await page.getByRole("heading", { name: "직원 로그인", exact: true }).waitFor();
  assert.equal((await context.request.get("/api/staff")).status(), 401);
  await login("845612");
  await settings(); await change("operator", "7319", "845612");
  await page.getByRole("heading", { name: "직원 로그인", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: ["운영자 중복 게스트 메뉴 없음", "운영자·수강생 실제 보안코드 로그인", "360px 입력·관리자 설정 가로 넘침 없음", "수강생 코드 변경·이전 코드 차단·운영자 유지", "운영자 코드 변경 후 자동 로그아웃·새 코드 재로그인"], errors }));
} finally { await browser.close(); }
