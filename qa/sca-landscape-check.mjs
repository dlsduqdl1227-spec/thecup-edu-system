// Local in-memory QA only. Never point these account-creation requests at production.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { expandSlides } from '../lib/sca-edu/layouts.js';
const { chromium, webkit } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const useWebkit = process.argv.includes('--webkit');
const browser = await (useWebkit ? webkit : chromium).launch({ headless: true, ...(!useWebkit && { executablePath: process.env.QA_BROWSER }) });
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const folder = `outputs/qa/landscape${useWebkit ? '-webkit' : ''}`, report = { checks: [], errors: [], geometry: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('response', res => {
  if (/\.woff2?(?:\?|$)/.test(res.url()) && res.status() >= 400) report.errors.push(`Font failed: ${res.status()}`);
});
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const baseline = process.argv.includes('--baseline');
const ready = language => page.waitForFunction(lang => document.querySelector('.sca')?.lang === lang && !!document.querySelector('.sca-stage'), language);
async function geometry(label, target = page) {
  await target.evaluate(() => document.fonts.ready);
  await target.waitForFunction(() => {
    const slide = document.querySelector('.sca-show__stage .sca-slide')?.getBoundingClientRect();
    return slide && slide.width > 0 && slide.bottom <= window.innerHeight + 1 && slide.right <= window.innerWidth + 1;
  });
  const rects = await target.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { slide: box('.sca-show__stage .sca-slide'), controls: box('.sca-show__controls'), overlay: box('.sca-show'), width: innerWidth, height: innerHeight };
  });
  for (const r of [rects.slide, rects.controls, rects.overlay]) {
    assert.ok(r.x >= -1 && r.y >= -1 && r.right <= rects.width + 1 && r.bottom <= rects.height + 1, `${label}: entirely visible ${JSON.stringify(rects)}`);
  }
  assert.ok(rects.slide.bottom <= rects.controls.y + 1 || rects.slide.right <= rects.controls.x + 1, `${label}: controls never cover content`);
  assert.ok(Math.abs(rects.slide.width / rects.slide.height - 13.333 / 7.5) < 0.01, `${label}: aspect ratio preserved`);
  for (const button of await target.locator('.sca-show button').all()) {
    const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, '44px touch target');
  }
  report.geometry.push({ label, ...rects });
  await target.screenshot({ path: `${folder}/${label}.png` });
}
try {
  await mkdir(folder, { recursive: true });
  const bootstrap = await context.request.post('/api/auth/bootstrap', { data: { name: 'QA Landscape Admin', phone: '01000009902', code: 'local-browser-qa', securityCode: '7319' } });
  if (bootstrap.status() !== 201) {
    const login = await context.request.post('/api/auth/login', { data: { name: 'QA Landscape Admin', phone: '01000009902', securityCode: '7319' } });
    assert.equal(login.status(), 200, await login.text());
  }
  // iPhone browsers may reject / not support requestFullscreen. The overlay must work independently.
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('QA fullscreen unavailable')); });
  if (baseline) {
    const original = execFileSync('git', ['show', 'HEAD:lib/sca-edu/viewer.js'], { encoding: 'utf8' });
    await page.route('**/lib/sca-edu/viewer.js*', route => route.fulfill({ contentType: 'text/javascript', body: original }));
  }
  await page.goto('/admin');
  await page.locator('.bottom-nav').getByRole('button', { name: '교육', exact: true }).click();
  await ready('ko');
  await page.locator('.sca-thumb').filter({ hasText: '카페에서 풀어볼 여섯 상황' }).click();
  await page.locator('[data-act="show"]').click();
  await page.locator('.sca-show').waitFor();
  if (baseline) {
    const box = await page.locator('.sca-show').boundingBox();
    report.baseline = { overlay: box, viewport: page.viewportSize(), cropped: box.height > 393 };
    console.log(JSON.stringify(report.baseline));
    await page.screenshot({ path: `${folder}/before-852x393.png` });
  } else {
    await geometry('reported-six-situations-852x393');
    await page.locator('.sca-show').evaluate(el => { el.style.padding = '0px 59px 21px'; });
    await geometry('reported-page-notch-and-home-indicator');
    // Check the final row and the copyright are visible, not just the slide's outer box.
    for (const phrase of ['바빠진 매장의 필터 교체', '새 필터인데 유량 감소', '© Inyub kim_Thecup Edu']) {
      const row = page.locator('.sca-show__stage .tx').filter({ hasText: phrase }).first();
      const box = await row.boundingBox(); assert.ok(box && box.y > 0 && box.y + box.height < 393 - 21, phrase);
    }
    await page.locator('.sca-show').evaluate(el => { el.style.removeProperty('padding'); });
    pass('Exact reported page fits at 2556x1179 pixels, including last row, footer and simulated iPhone safe areas');
    const initial = await page.locator('.sca-show__count').innerText();
    for (const [width, height] of [[844, 390], [667, 375], [740, 320], [812, 280], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await geometry(`ko-${width}x${height}`);
      assert.equal(await page.locator('.sca-show__count').innerText(), initial, 'rotation keeps current slide');
    }
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ width: 804, height: 290, offsetTop: 40, offsetLeft: 20, scale: 1 })) {
        Object.defineProperty(window.visualViewport, key, { configurable: true, value });
      }
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('.sca-show').style.height === '290px');
    const visible = await page.locator('.sca-show').boundingBox();
    assert.deepEqual(visible, { x: 20, y: 40, width: 804, height: 290 });
    await geometry('mobile-toolbar-visible');
    await page.evaluate(() => {
      for (const key of ['width', 'height', 'offsetTop', 'offsetLeft', 'scale']) delete window.visualViewport[key];
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => document.querySelector('.sca-show').style.height === '390px');
    await page.locator('.sca-show').getByRole('button', { name: '다음 슬라이드', exact: true }).tap();
    assert.notEqual(await page.locator('.sca-show__count').innerText(), initial);
    await page.locator('.sca-show').getByRole('button', { name: '이전 슬라이드', exact: true }).tap();
    assert.equal(await page.locator('.sca-show__count').innerText(), initial);
    await page.getByRole('button', { name: '프레젠테이션 닫기', exact: true }).tap();
    await page.locator('.sca-show').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[data-act="show"]') === document.activeElement);
    assert.equal(await page.locator('[data-act="show"]').evaluate(el => el === document.activeElement), true);
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    pass('Korean mobile landscape/portrait/short viewport fits without clipping; touch navigation and close work');

    await page.getByRole('button', { name: 'English', exact: true }).click(); await ready('en');
    await page.getByLabel('Select course', { exact: true }).selectOption('roasting|Foundation');
    await page.waitForFunction(() => document.querySelector('.sca-head h1')?.textContent.includes('Roasting'));
    // Exercise an actual graph, not just a sparse title slide.
    const roasting = await (await context.request.get('/api/edu/decks/roasting/Foundation?lang=en')).json();
    const chartIndex = expandSlides(roasting).findIndex(slide => slide.layout === 'chart');
    assert.ok(chartIndex >= 0, 'roasting includes a chart');
    await page.locator('.sca-thumb').nth(chartIndex).click();
    await page.locator('[data-act="show"]').click();
    await geometry('en-roasting-844x390');
    const before = await page.locator('.sca-show__count').innerText();
    const close = page.getByRole('button', { name: 'Close presentation', exact: true });
    await close.focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.sca-show').getByRole('button', { name: 'Previous slide', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await close.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Space');
    await page.locator('.sca-show').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.sca-count').innerText(), before, 'space on close does not advance slide');
    pass('English graph fits; keyboard focus stays in presentation; closing preserves slide');

    // Exercise native fullscreen in Chromium. Mobile WebKit uses the fallback tested above.
    if (!useWebkit) {
    const desktop = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', storageState: await context.storageState(), viewport: { width: 1440, height: 900 } });
    const pc = await desktop.newPage(); pc.setDefaultTimeout(20000); pc.on('pageerror', e => report.errors.push(e.message));
    await pc.bringToFront();
    await pc.goto('/admin'); await pc.locator('.side-nav').getByRole('button', { name: 'SCA 교육자료' }).click();
    await pc.locator('[data-act="show"]').click();
    await pc.waitForFunction(() => document.fullscreenElement?.classList.contains('sca-show'));
    await geometry('desktop-fullscreen', pc);
    await pc.keyboard.press('ArrowRight');
    await pc.evaluate(() => document.exitFullscreen());
    await pc.locator('.sca-show').waitFor({ state: 'detached' });
    await pc.locator('[data-act="show"]').click();
    await pc.keyboard.press('Escape'); await pc.locator('.sca-show').waitFor({ state: 'detached' });
    await desktop.close();
    pass('Desktop native fullscreen, browser exit, Escape and reopening work');
    }

    const phone = `0108000${String(Date.now()).slice(-4)}`;
    const created = await context.request.post('/api/booking/admin', { data: { action: 'createMember', name: 'QA Landscape Student', phone, approvalStatus: 'APPROVED' } });
    assert.equal(created.status(), 201, await created.text());
    const { id } = await created.json();
    const grant = await context.request.put('/api/edu/members/bulk', { data: { memberIds: [id], levels: [{ courseId: 'water-maintenance', level: 'Foundation' }], enabled: true } });
    assert.equal(grant.status(), 200);
    const student = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pupil = await student.newPage(); pupil.setDefaultTimeout(20000); pupil.on('pageerror', e => report.errors.push(e.message));
    await pupil.addInitScript(() => { Element.prototype.requestFullscreen = undefined; });
    await pupil.goto('/?view=student');
    await pupil.locator('input[name="name"]').fill('QA Landscape Student');
    await pupil.locator('input[name="phone"]').fill(phone);
    await pupil.getByLabel('보안코드', { exact: true }).fill('08372');
    await pupil.getByRole('button', { name: '로그인', exact: true }).click();
    await pupil.locator('.portal-mobile-nav').getByRole('button', { name: '교육', exact: true }).click();
    await pupil.locator('[data-act="show"]').click();
    await geometry('student-portrait', pupil);
    await pupil.setViewportSize({ width: 667, height: 375 });
    await geometry('student-landscape', pupil);
    await pupil.locator('[data-show="next"]').tap();
    await geometry('student-content-landscape', pupil);
    await pupil.locator('[data-show="close"]').tap();
    await pupil.locator('.sca-show').waitFor({ state: 'detached' });
    await pupil.getByRole('button', { name: 'English', exact: true }).click();
    await pupil.waitForFunction(() => document.querySelector('.sca')?.lang === 'en');
    await pupil.locator('[data-act="show"]').click();
    await geometry('student-english-landscape', pupil);
    await pupil.locator('[data-show="close"]').tap();
    await student.close();
    pass('Approved student mobile login, Korean/English presentation, rotation and touch close work');
    assert.deepEqual(report.errors, []);
  }
} finally {
  await writeFile(`${folder}/${baseline ? 'baseline' : 'report'}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
