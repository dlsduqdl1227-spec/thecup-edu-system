import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
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
  assert.equal(await page.locator(".sca-course").count(), 8);
  assert.equal(await page.locator(".sca-lv").count(), 18);
  for (const [course, level] of [["brewing", "Foundation"], ["roasting", "Professional"], ["sensory-skills", "Intermediate"], ["water-maintenance", "Foundation"], ["sustainability", "Foundation"]]) {
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
  pass("8개 과정·18개 자료 및 과목 5개의 슬라이드·PPTX·발표 모드");
  const additions = JSON.parse(readFileSync(new URL('../lib/sca-edu/decks/visuals.json', import.meta.url),'utf8'));
  for (const addition of additions) {
    const [course,level] = addition.deckKey.split('/');
    await page.locator(`.sca-lv[data-c="${course}"][data-l="${level}"]`).click();
    await page.locator('.sca-thumb').filter({hasText:addition.slide.title}).click();
    await page.locator('.sca-stage .sca-chart').waitFor();
    await page.locator('.sca-stage').screenshot({path:`outputs/qa/chart-${course}-${level}.png`});
    const overflow = await page.locator('.sca-stage .tx').evaluateAll(nodes => nodes.filter(n=>n.scrollHeight>n.clientHeight+3).map(n=>n.textContent));
    assert.deepEqual(overflow,[],`${addition.deckKey}: clipped chart text`);
  }
  pass('16개 차트의 실제 웹 렌더링·축·설명 영역 확인');
  assert.ok(!(await page.locator('.sca').innerText()).includes('검토 중'));
  const mandatory=JSON.parse(readFileSync(new URL('../lib/sca-edu/decks/required-visuals.json',import.meta.url),'utf8'));
  for(const [i,item] of mandatory.entries()){
    const [course,level]=item.deckKey.split('/');
    await page.locator(`.sca-lv[data-c="${course}"][data-l="${level}"]`).click();
    await page.locator('.sca-thumb').filter({hasText:item.slide.title}).click();
    if(item.slide.layout==='image'){
      await page.waitForFunction(()=>{const im=document.querySelector('.sca-stage img');return im?.complete && im.naturalWidth>1000});
      await page.getByRole('button',{name:'이미지 크게 보기'}).click();
      await page.locator('.sca-image-dialog').waitFor();
      await page.locator('.sca-image-dialog').getByRole('button',{name:'닫기'}).click();
    }
    await page.locator('.sca-stage').screenshot({path:`outputs/qa/required-${i}.png`});
  }
  for(const course of ['water-maintenance','sustainability']){
    await page.locator(`.sca-lv[data-c="${course}"]`).click();
    await page.locator('.sca-stage').waitFor();
    const count=await page.locator('.sca-thumb').count();
    for(let i=0;i<count;i++){
      await page.locator('.sca-thumb').nth(i).click();
      const clips=await page.locator('.sca-stage .tx').evaluateAll(nodes=>nodes.filter(n=>n.scrollHeight>n.clientHeight+3).map(n=>n.textContent));
      assert.deepEqual(clips,[],`${course}/${i}: clipped text`);
      await page.locator('.sca-stage').screenshot({path:`outputs/qa/${course}-${i}.png`});
    }
  }
  pass('필수 원본 이미지 9장·확대 보기·신규 Foundation 전체 슬라이드 잘림 없음');
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
  await pupil.getByText("열람 가능한 교육자료가 없습니다.", { exact: false }).waitFor();
  await education();
  await page.locator(".sca-access-list article").filter({hasText:"QA 교육 수강생"}).locator("summary").filter({hasText:"브루잉"}).click();
  const publish = page.getByRole("button", { name: "QA 교육 수강생 (9902) 브루잉 Foundation 열기", exact: true });
  page.once("dialog", d => d.dismiss()); await publish.click();
  assert.equal((await api(student.request, "/api/edu/catalog")).courses.flatMap(c => c.levels).filter(l => l.deck).length, 0);
  page.once("dialog", d => d.accept()); await publish.click();
  await page.getByRole("button", { name: "QA 교육 수강생 (9902) 브루잉 Foundation 닫기", exact: true }).waitFor();
  await studentEducation();
  await pupil.locator(".sca-stage .sca-slide").waitFor();
  assert.match(await pupil.locator(".sca-head h1").innerText(), /Brewing Foundation/);
  assert.equal((await api(student.request, "/api/edu/catalog")).courses.flatMap(c => c.levels).filter(l => l.deck).length, 1);
  const other = await browser.newContext({baseURL});
  await api(other.request, '/api/booking/public/consultations', {name:'QA 일반 예약',phone:'01000009906',consultationMemo:'로컬 예약 회원 권한 검증'});
  const members = await api(admin.request,'/api/edu/members');
  const otherMember = members.members.find(m=>m.name==='QA 일반 예약');
  await api(admin.request,'/api/booking/admin', {action:'approveMember',memberId:otherMember.id,approved:true,adminMemo:'로컬 QA'});
  await api(other.request,'/api/member-auth/login',{name:'QA 일반 예약',phone:'01000009906',securityCode:'08372'});
  assert.deepEqual((await api(other.request,'/api/edu/catalog')).courses,[]);
  assert.equal((await other.request.get('/api/edu/decks/brewing/Foundation')).status(),404);
  await page.getByRole('button',{name:'목록 새로고침'}).click();
  await page.locator('.sca-access-list article').filter({hasText:'QA 일반 예약'}).locator('summary').filter({hasText:'로스팅'}).click();
  const openOther = page.getByRole('button',{name:'QA 일반 예약 (9906) 로스팅 Professional 열기',exact:true});
  await openOther.waitFor();
  page.once('dialog',d=>d.accept()); await openOther.click();
  await page.getByRole('button',{name:'QA 일반 예약 (9906) 로스팅 Professional 닫기',exact:true}).waitFor();
  assert.deepEqual((await api(other.request,'/api/edu/catalog')).courses.map(c=>c.id),['roasting']);
  assert.deepEqual((await api(student.request,'/api/edu/catalog')).courses.map(c=>c.id),['brewing']);
  await page.getByLabel('수강생 찾기').fill('9906');
  assert.equal(await page.locator('.sca-access-list article').count(),1);
  await page.getByLabel('수강생 찾기').fill('');
  await capture(page,'sca-members-admin-pc');
  await page.setViewportSize({width:390,height:900});
  await capture(page,'sca-members-admin-mobile');
  await page.setViewportSize({width:1440,height:1000});
  const deck = await api(student.request, "/api/edu/decks/brewing/Foundation");
  assert.ok(deck.slides.every(s => !("notes" in s)));
  assert.ok(!("sourceNote" in deck) && !("sources" in deck));
  assert.equal(await pupil.getByRole("button", { name: "발표자 노트" }).count(), 0);
  assert.equal((await student.request.get('/api/edu/decks/brewing/Intermediate')).status(),404);
  assert.equal((await student.request.get('/api/edu/decks/brewing/Intermediate/assets/sca-water')).status(),404);
  assert.equal((await student.request.get('/api/edu/decks/brewing/Foundation/assets/sca-water')).status(),200);
  await pupil.setViewportSize({width:360,height:800});
  await capture(pupil, "sca-publication-student-mobile");
  await pupil.setViewportSize({ width: 1440, height: 1000 });
  await capture(pupil, "sca-publication-student-pc");
  await pupil.setViewportSize({ width: 390, height: 900 });
  await page.locator('.sca-access-list article').filter({hasText:'QA 교육 수강생'}).locator('summary').filter({hasText:'브루잉'}).click();
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "QA 교육 수강생 (9902) 브루잉 Foundation 닫기", exact: true }).click();
  await page.getByRole("button", { name: "QA 교육 수강생 (9902) 브루잉 Foundation 열기", exact: true }).waitFor();
  await studentEducation();
  await pupil.getByText("열람 가능한 교육자료가 없습니다.", { exact: false }).waitFor();
  assert.equal((await student.request.get("/api/edu/decks/brewing/Foundation")).status(), 404);
  assert.deepEqual((await api(other.request,'/api/edu/catalog')).courses.map(c=>c.id),['roasting']);
  assert.equal((await api(admin.request,'/api/edu/members')).members.find(m=>m.name==='QA 교육 수강생').approvalStatus,'APPROVED');
  await other.close();
  pass("수강생별 과목·레벨 격리·일반 예약 회원 기본 비공개·열기/닫기·검색·학생 노트 제외");
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
  await page.locator('.side-nav').getByRole('button',{name:'수강생 목록',exact:false}).click();
  await page.getByRole('heading',{name:'수강생 목록',exact:true}).waitFor();
  assert.ok(!(await page.locator('.booking-admin-member-list').innerText()).includes('QA employee'));
  await page.getByLabel('수강생 검색').fill('9902');
  assert.equal(await page.locator('.booking-admin-member-list article').count(),1);
  await page.locator('.side-nav').getByRole('button',{name:'직원 목록 · 권한',exact:false}).click();
  await page.getByRole('heading',{name:'직원 권한 관리'}).waitFor();
  assert.ok(!(await page.locator('.staff-layout').innerText()).includes('QA 교육 수강생'));
  pass('직원 목록·수강생 목록 분리와 검색 확인');
  pass("직원·시간강사 열람 및 공개 API 차단, PC·390px 가로 넘침 없음");
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile("outputs/qa/sca-publication-report.json", JSON.stringify(report, null, 2));
  await browser.close();
}
