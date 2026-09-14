import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : "playwright");
const baseURL = "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const output = "outputs/qa";
await mkdir(output, { recursive: true });
const report = { errors: [], pages: [] };
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Seoul" });
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") report.errors.push(`${message.text()} ${message.location().url}`); });
async function capture(name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  report.pages.push({ name, url: page.url(), ...await page.evaluate(() => ({ title: document.title, overflow: document.documentElement.scrollWidth > innerWidth, text: document.body.innerText.slice(0, 14000), buttons: [...document.querySelectorAll("button,a")].filter((el) => el.getBoundingClientRect().width).map((el) => el.textContent.trim()) })) });
}
try {
  await page.goto("/");
  await page.getByRole("heading", { name: "수업 예정자", exact: true }).waitFor();
  await capture("desktop-home");
  await page.getByRole("link", { name: /수업 예정자/ }).click();
  await page.getByRole("heading", { name: "월별 남은 스테이션" }).waitFor();
  await page.locator('input[type="month"]').fill("2026-10");
  await page.waitForResponse((response) => response.url().includes("availability?month=2026-10"));
  await capture("desktop-visitor");
  for (const width of [768, 360]) { await page.setViewportSize({ width, height: 900 }); await capture(`visitor-${width}`); }
  await page.getByRole("link", { name: /수강생/ }).click();
  await page.getByRole("button", { name: "로그인", exact: true }).waitFor();
  await capture("student-login-360");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const status = await (await context.request.get("/api/auth/status")).json();
  const auth = !status.bootstrapRequired ? await context.request.post("/api/auth/login", { data: { name: "QA 운영자", phone: "01000009901", securityCode: "7319" } }) : await context.request.post("/api/auth/bootstrap", { data: { name: "QA 운영자", phone: "01000009901", securityCode: "7319", code: "local-browser-qa" } });
  assert.ok(auth.ok(), await auth.text());
  await page.goto("/admin");
  await page.locator(".side-nav").getByRole("button", { name: /재고 관리/ }).waitFor();
  await capture("admin-dashboard");
  for (const name of ["수업 사용 기록", "재고 관리", "매출 및 지출 등록", "로스팅 프로파일", "운영 · 개강 관리", "직원 · 권한"]) {
    const button = page.locator(".side-nav").getByRole("button", { name: new RegExp(name) });
    if (!(await button.count())) continue;
    await button.click();
    await page.waitForTimeout(500);
    await capture(`admin-${name}`);
    await page.setViewportSize({ width: 360, height: 900 });
    await capture(`admin-${name}-360`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
} finally {
  await writeFile(`${output}/baseline.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors, pages: report.pages.map(({name,overflow}) => ({name,overflow})) }, null, 2));
  await browser.close();
}
