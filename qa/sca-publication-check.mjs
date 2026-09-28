import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const baseURL = "http://127.0.0.1:5173";
const admin = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const student = await browser.newContext({ baseURL, viewport: { width: 390, height: 900 } });
const page = await admin.newPage(), pupil = await student.newPage();
const report = { checks: [], errors: [] };
for (const p of [page, pupil]) p.on("pageerror", e => report.errors.push(e.message));
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
async function api(client, path, data) {
  const r = data === undefined ? await client.get(path) : await client.post(path, { data });
  assert.ok(r.ok(), `${path}: ${r.status()} ${await r.text()}`); return r.json();
}
async function capture(p, name) {
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: overflow`);
  await p.screenshot({ path: `outputs/qa/${name}.png`, fullPage: true });
}
async function education() {
  await page.locator(".side-nav").getByRole("button", { name: "SCA 교육자료" }).click();
  await page.locator(".sca-stage .sca-slide").waitFor();
}
async function studentEducation() {
  await pupil.reload();
  await pupil.locator(".portal-mobile-nav").getByRole("button", { name: "교육", exact: true }).click();
}
try {
  await mkdir("outputs/qa", { recursive: true });
  assert.equal((await admin.request.get("/api/edu/catalog")).status(), 401);
  await api(admin.request, "/api/auth/bootstrap", { name: "QA 운영자", phone: "01000009901", code: "local-browser-qa", securityCode: "7319" });
  await page.goto("/admin");
  await education();
  assert.equal(await page.locator(".sca-visibility-grid > section").count(), 6);
  assert.equal(await page.locator(".sca-visibility-row").count(), 16);
  for (const [course, level] of [["brewing", "Foundation"], ["roasting", "Professional"], ["sensory-skills", "Intermediate"]]) {
    await page.locator(`.sca-lv[data-c="${course}"][data-l="${level}"]`).click();
    await page.locator(".sca-head h1").filter({ hasText: level }).waitFor();
    await page.getByRole("button", { name: "다음 슬라이드", exact: true }).click();
    assert.match(await page.locator(".sca-count").innerText(), /^2 \/ /);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PPTX 다운로드" }).click();
    const file = await download;
    assert.equal(await file.failure(), null);
    await file.saveAs(`outputs/qa/${file.suggestedFilename()}`);
    await page.getByRole("button", { name: "발표 시작" }).click();
    await page.locator(".sca-show").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".sca-show").waitFor({ state: "detached" });
  }
  pass("6개 과정·16개 자료 및 새 과정 3개의 슬라이드·PPTX·발표 모드");
  await capture(page, "sca-publication-admin-pc");
  await page.setViewportSize({ width: 390, height: 900 });
  await capture(page, "sca-publication-admin-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await api(student.request, "/api/booking/public/consultations", { name: "QA 교육 수강생", phone: "01000009902", consultationMemo: "로컬 검증" });
  await page.getByRole("button", { name: "수강생 승인하러 가기" }).click();
  await page.locator(".booking-admin-tabs button.active").filter({ hasText: "상담·회원" }).waitFor();
  const member = page.locator(".booking-admin-member-list article").filter({ hasText: "QA 교육 수강생" });
  await member.waitFor();
  page.once("dialog", d => d.accept("로컬 테스트 승인"));
  await member.getByRole("button", { name: "상담 완료·승인" }).click();
  await member.getByRole("button", { name: "권한 회수" }).waitFor();
  pass("수강생 승인 바로가기 → 상담·회원 탭 및 기존 승인 버튼");
  await pupil.goto("/?view=student");
  await pupil.locator('input[name="name"]').fill("QA 교육 수강생");
  await pupil.locator('input[name="phone"]').fill("01000009902");
  await pupil.getByLabel("보안코드", { exact: true }).fill("08372");
  await pupil.getByRole("button", { name: "로그인", exact: true }).click();
  await pupil.locator(".portal-mobile-nav").getByRole("button", { name: "교육", exact: true }).click();
  await pupil.getByText("아직 공개된 교육자료가 없습니다.", { exact: true }).waitFor();
  await education();
  const publish = page.getByRole("button", { name: "Brewing Foundation 수강생에게 공개", exact: true });
  page.once("dialog", d => d.dismiss()); await publish.click();
  assert.equal((await api(student.request, "/api/edu/catalog")).courses.flatMap(c => c.levels).filter(l => l.deck).length, 0);
  page.once("dialog", d => d.accept()); await publish.click();
  await page.getByRole("button", { name: "Brewing Foundation 공개 중지", exact: true }).waitFor();
  await studentEducation();
  await pupil.locator(".sca-stage .sca-slide").waitFor();
  assert.match(await pupil.locator(".sca-head h1").innerText(), /Brewing Foundation/);
  assert.equal((await api(student.request, "/api/edu/catalog")).courses.flatMap(c => c.levels).filter(l => l.deck).length, 1);
  const deck = await api(student.request, "/api/edu/decks/brewing/Foundation");
  assert.ok(deck.slides.every(s => !("notes" in s)));
  assert.ok(!("sourceNote" in deck) && !("sources" in deck));
  assert.equal(await pupil.getByRole("button", { name: "발표자 노트" }).count(), 0);
  await capture(pupil, "sca-publication-student-mobile");
  await pupil.setViewportSize({ width: 1440, height: 1000 });
  await capture(pupil, "sca-publication-student-pc");
  await pupil.setViewportSize({ width: 390, height: 900 });
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Brewing Foundation 공개 중지", exact: true }).click();
  await page.getByRole("button", { name: "Brewing Foundation 수강생에게 공개", exact: true }).waitFor();
  await studentEducation();
  await pupil.getByText("아직 공개된 교육자료가 없습니다.", { exact: true }).waitFor();
  assert.equal((await student.request.get("/api/edu/decks/brewing/Foundation")).status(), 404);
  pass("공개 확인 취소·공개·공개 중지 즉시 API 반영 및 학생 노트 제외");
  await page.getByRole("button", { name: "수강생 승인하러 가기" }).click();
  await member.waitFor();
  page.once("dialog", d => d.accept("로컬 테스트 회수"));
  await member.getByRole("button", { name: "권한 회수" }).click();
  await member.getByRole("button", { name: "상담 완료·승인" }).waitFor();
  assert.equal((await student.request.get("/api/edu/catalog")).status(), 401);
  pass("기존 권한 회수 버튼 및 교육자료 차단");
  for (const [i, role] of ["employee", "instructor"].entries()) {
    const name = `QA ${role}`, phone = `0100000990${i + 3}`;
    await api(admin.request, "/api/staff", { name, phone, role });
    const ctx = await browser.newContext({ baseURL });
    await api(ctx.request, "/api/auth/login", { name, phone, securityCode: "7319" });
    assert.equal((await ctx.request.get("/api/edu/catalog")).status(), 401);
    assert.equal((await ctx.request.put("/api/edu/decks/brewing/Foundation/visibility", { data: { published: true } })).status(), 403);
    await ctx.close();
  }
  pass("직원·시간강사 열람 및 공개 API 차단, PC·390px 가로 넘침 없음");
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile("outputs/qa/sca-publication-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
