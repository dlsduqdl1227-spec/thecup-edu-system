import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { expandSlides } from '../lib/sca-edu/layouts.js';
const { chromium } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const admin = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } });
const student = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 360, height: 800 } });
const anon = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
const page = await admin.newPage(), pupil = await student.newPage();
const report = { checks: [], errors: [] }, folder = 'outputs/qa/english';
for (const p of [page, pupil]) p.on('pageerror', e => report.errors.push(e.message));
const pass = text => { report.checks.push(text); console.log(`PASS ${text}`); };
const catalog = JSON.parse(await readFile('lib/sca-edu/decks/catalog.json', 'utf8'));
const levels = catalog.courses.flatMap(c => c.levels.filter(l => l.deck).map(l => ({ courseId: c.id, level: l.level })));
const studentPhone = `0107000${String(Date.now()).slice(-4)}`;
const getDeck = (context, course, level, language) => context.request.get(`/api/edu/decks/${course}/${level}?lang=${language}`);
const ready = (p, lang) => p.waitForFunction(l => document.querySelector('.sca')?.lang === l && !!document.querySelector('.sca-stage') && document.querySelector('.sca-language')?.getAttribute('aria-busy') === 'false', lang);
try {
  await mkdir(folder, { recursive: true });
  const bootstrap = await admin.request.post('/api/auth/bootstrap', { data: { name: 'QA English Admin', phone: '01000009901', code: 'local-browser-qa', securityCode: '7319' } });
  if (bootstrap.status() !== 201) {
    const login = await admin.request.post('/api/auth/login', { data: { name: 'QA English Admin', phone: '01000009901', securityCode: '7319' } });
    assert.equal(login.status(), 200, await login.text());
  }
  const created = await admin.request.post('/api/booking/admin', { data: { action: 'createMember', name: 'QA English Student', phone: studentPhone, approvalStatus: 'APPROVED' } });
  assert.equal(created.status(), 201, await created.text());
  const { id } = await created.json();
  const grant = await admin.request.put('/api/edu/members/bulk', { data: { memberIds: [id], levels, enabled: true } });
  assert.equal(grant.status(), 200);
  assert.equal((await getDeck(anon, 'brewing', 'Foundation', 'en')).status(), 401);
  await page.goto('/admin');
  await page.locator('.side-nav').getByRole('button', { name: 'SCA 교육자료' }).click();
  await ready(page, 'ko');
  await page.locator('[data-act="next"]').click(); await page.locator('[data-act="next"]').click();
  const count = await page.locator('.sca-count').innerText();
  await page.getByRole('button', { name: 'English', exact: true }).click(); await ready(page, 'en');
  assert.equal(await page.locator('.sca-count').innerText(), count);
  assert.ok(!/[가-힣]/.test(await page.locator('.sca-stage').innerText()));
  await page.getByRole('button', { name: '한국어', exact: true }).click(); await ready(page, 'ko');
  assert.equal(await page.locator('.sca-count').innerText(), count);
  pass('Admin Korean/English toggle preserves current slide');
  await page.route('**/api/edu/decks/**?lang=en', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"QA unavailable"}' }));
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.locator('.sca-language-error').waitFor();
  assert.equal(await page.locator('.sca-count').innerText(), count);
  assert.equal(await page.locator('.sca').getAttribute('lang'), 'ko');
  await page.unroute('**/api/edu/decks/**?lang=en');
  await page.getByRole('button', { name: 'English', exact: true }).click(); await ready(page, 'en');
  pass('Failed language request retains original slide; retry succeeds');
  await page.getByRole('button', { name: 'Edit Korean original', exact: true }).click();
  const editor = page.locator('.sca-edit'); await editor.waitFor();
  assert.equal(await page.locator('.sca').getAttribute('lang'), 'ko');
  await editor.getByLabel('제목', { exact: true }).fill('QA Edited Learning Objectives');
  await editor.getByRole('button', { name: '변경 내용 저장', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  assert.ok((await page.locator('.sca-stage').innerText()).includes('QA Edited Learning Objectives'));
  await page.getByRole('button', { name: 'English', exact: true }).click(); await ready(page, 'en');
  assert.ok((await page.locator('.sca-stage').innerText()).includes('QA Edited Learning Objectives'));
  await page.getByRole('button', { name: 'Edit Korean original', exact: true }).click(); await editor.waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await editor.screenshot({ path: `${folder}/editor-360.png` });
  assert.equal(await editor.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: '기본 자료로 복원', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'English', exact: true }).click(); await ready(page, 'en');
  assert.ok(!(await page.locator('.sca-stage').innerText()).includes('QA Edited Learning Objectives'));
  pass('Existing page editor saves, persists across languages and restores source at 360px');

  for (const { courseId, level } of levels) {
    const r = await getDeck(admin, courseId, level, 'en'); assert.equal(r.status(), 200);
    const en = await r.json(), ko = await (await getDeck(admin, courseId, level, 'ko')).json();
    assert.ok(!/[가-힣]/.test(JSON.stringify(en))); assert.equal(en.slides.length, ko.slides.length);
    assert.match(r.headers()['cache-control'], /private.*no-store/);
    await page.locator(`.sca-lv[data-c="${courseId}"][data-l="${level}"]`).click();
    await ready(page, 'en');
    await page.locator('.sca-stage').screenshot({ path: `${folder}/${courseId}-${level}.png` });
  }
  pass('All 18 course levels load with English slide content and private caching');
  for (const courseId of ['water-maintenance', 'sustainability', 'brewing', 'roasting']) {
    await page.locator(`.sca-lv[data-c="${courseId}"][data-l="Foundation"]`).click(); await ready(page, 'en');
    const deck = await (await getDeck(admin, courseId, 'Foundation', 'en')).json();
    const expanded = expandSlides(deck);
    for (const layout of ['table', 'steps', 'chart', 'stats', 'compare', 'agenda']) {
      const index = expanded.findIndex(slide => slide.layout === layout);
      if (index < 0) continue;
      await page.locator('.sca-thumb').nth(index).click();
      await page.locator('.sca-stage').screenshot({ path: `${folder}/${courseId}-${layout}.png` });
    }
  }
  pass('Captured representative English tables, charts, steps and comparison slides');
  await page.locator('.sca-lv[data-c="sensory-skills"][data-l="Foundation"]').click(); await ready(page, 'en');
  await page.locator('.sca-thumb').filter({ hasText: 'SCA Flavor Wheel' }).click();
  await page.waitForFunction(() => document.querySelector('.sca-stage img')?.naturalWidth > 1000);
  assert.match(await page.locator('.sca-stage img').getAttribute('src'), /flavor-wheel-en$/);
  await page.locator('.sca-stage').screenshot({ path: `${folder}/flavor-wheel.png` });
  await page.getByRole('button', { name: 'Start presentation', exact: true }).click();
  await page.locator('.sca-show').waitFor(); assert.equal(await page.locator('.sca-show').getAttribute('lang'), 'en');
  await page.keyboard.press('Escape'); await page.locator('.sca-show').waitFor({ state: 'detached' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PPTX', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /_EN\.pptx$/);
  assert.equal(await download.failure(), null);
  const chunks = []; for await (const part of await download.createReadStream()) chunks.push(part);
  const bytes = Buffer.concat(chunks); await writeFile(`${folder}/sensory-english.pptx`, bytes);
  const zip = unzipSync(bytes);
  const slides = Object.entries(zip).filter(([p]) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  for (const [, data] of slides) { const xml = strFromU8(data); assert.ok(!/[가-힣]/.test(xml)); assert.ok(xml.includes('Inyub kim_Thecup Edu')); }
  assert.ok(Object.keys(zip).some(p => /ppt\/media\/.+\.png$/.test(p)));
  pass('Original English flavor wheel, presentation mode, English PPTX and copyright');

  await pupil.goto('/?view=student');
  await pupil.locator('input[name="name"]').fill('QA English Student');
  await pupil.locator('input[name="phone"]').fill(studentPhone);
  await pupil.getByLabel('보안코드', { exact: true }).fill('08372');
  await pupil.getByRole('button', { name: '로그인', exact: true }).click();
  await pupil.locator('.portal-mobile-nav').getByRole('button', { name: '교육', exact: true }).click();
  await ready(pupil, 'ko'); await pupil.getByRole('button', { name: 'English', exact: true }).click(); await ready(pupil, 'en');
  for (const { courseId, level } of levels) {
    const r = await getDeck(student, courseId, level, 'en'); assert.equal(r.status(), 200);
    const d = await r.json(); assert.ok(d.slides.every(s => !('notes' in s))); assert.equal(d.sources, undefined); assert.equal(d.sourceNote, undefined);
    await pupil.getByLabel('Select course', { exact: true }).selectOption(`${courseId}|${level}`); await ready(pupil, 'en');
    assert.equal(await pupil.getByRole('button', { name: 'Presenter notes', exact: true }).count(), 0);
    assert.equal(await pupil.getByRole('button', { name: 'Download PPTX', exact: true }).count(), 0);
    assert.equal(await pupil.getByRole('button', { name: 'Edit Korean original', exact: true }).count(), 0);
    assert.equal(await pupil.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, courseId);
  }
  for (const width of [360, 768, 1440]) {
    await pupil.setViewportSize({ width, height: 900 });
    assert.equal(await pupil.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await pupil.locator('.sca').screenshot({ path: `${folder}/student-${width}.png` });
  }
  await pupil.reload();
  await pupil.locator('.portal-member').waitFor();
  // Booking portal starts on calendar after reload; language preference persists independently.
  await pupil.getByRole('button', { name: '교육자료', exact: true }).click();
  await ready(pupil, 'en');
  pass('Student access across all levels, no private notes/downloads, remembered language, 360/768/1440px');
  const revoke = await admin.request.put(`/api/edu/members/${id}/courses/brewing/levels/Foundation`, { data: { enabled: false } });
  assert.equal(revoke.status(), 200);
  for (const language of ['ko', 'en']) assert.equal((await getDeck(student, 'brewing', 'Foundation', language)).status(), 404);
  assert.equal((await student.request.get('/api/edu/decks/brewing/Foundation/assets/sca-brewing-2019')).status(), 404);
  assert.equal((await student.request.get('/api/edu/decks/sustainability/Foundation/assets/flavor-wheel-en')).status(), 404);
  assert.equal((await getDeck(student, 'sensory-skills', 'Foundation', 'en')).status(), 200);
  assert.equal((await getDeck(student, 'sensory-skills', 'Foundation', 'fr')).status(), 400);
  assert.equal((await student.request.get('/api/booking/member')).status(), 200);
  pass('Revocation blocks both languages and assets without changing other course or booking access');
  assert.deepEqual(report.errors, []);
} finally { await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
