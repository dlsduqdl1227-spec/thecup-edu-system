import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { EDU_COPYRIGHT } from '../lib/sca-edu/theme.js';

// Isolated QA DB only: never bootstrap an account on the production website.
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const folder = 'outputs/qa/copyright';

async function checkMark(selector) {
  assert.equal(await page.locator(`${selector} .sca-slide`).getByText(EDU_COPYRIGHT, { exact: true }).count(), 1);
  const background = await page.locator(`${selector} .sca-wm`).evaluate(el => getComputedStyle(el).backgroundImage);
  const svg = decodeURIComponent(background);
  assert.ok(svg.includes(EDU_COPYRIGHT));
  assert.ok(!svg.includes('QA 운영자'));
  const clipped = await page.locator(`${selector} .sca-slide`).getByText(EDU_COPYRIGHT, { exact: true }).evaluate(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  assert.equal(clipped, false);
}

try {
  await mkdir(folder, { recursive: true });
  const bootstrap = await context.request.post('/api/auth/bootstrap', { data: { name: 'QA 운영자', phone: '01000009901', code: 'local-browser-qa', securityCode: '7319' } });
  assert.equal(bootstrap.status(), 201);
  await page.goto('/admin');
  await page.locator('.side-nav').getByRole('button', { name: 'SCA 교육자료' }).click();
  await page.locator('.sca-stage .sca-slide').waitFor();
  await checkMark('.sca-stage');
  await page.locator('.sca-stage').screenshot({ path: `${folder}/cover.png` });
  await page.locator('.sca-lv[data-c="sensory-skills"][data-l="Intermediate"]').click();
  await page.locator('.sca-thumb').filter({ hasText: 'SCA 플레이버 휠' }).click();
  await page.waitForFunction(() => document.querySelector('.sca-stage img')?.naturalWidth > 1000);
  await checkMark('.sca-stage');
  assert.ok((await page.locator('.sca-stage').innerText()).includes('© 2016 SCA and WCR'));
  await page.locator('.sca-stage').screenshot({ path: `${folder}/flavor-wheel.png` });
  await page.getByRole('button', { name: '발표 시작' }).click();
  await page.locator('.sca-show__stage').waitFor();
  await checkMark('.sca-show__stage');
  await page.locator('.sca-show__stage').screenshot({ path: `${folder}/presentation.png` });
  await page.keyboard.press('Escape');
  await page.locator('.sca-show').waitFor({ state: 'detached' });

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PPTX 다운로드' }).click();
  const download = await pending;
  assert.equal(await download.failure(), null);
  const stream = await download.createReadStream(), chunks = [];
  for await (const part of stream) chunks.push(part);
  const bytes = Buffer.concat(chunks);
  await writeFile(`${folder}/sensory-copyright.pptx`, bytes);
  const zip = unzipSync(bytes);
  const slides = Object.keys(zip).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  for (const file of slides) assert.ok(strFromU8(zip[file]).includes(EDU_COPYRIGHT), file);
  assert.ok(Object.keys(zip).some(path => /^ppt\/media\/.*\.png$/.test(path)));
  await page.setViewportSize({ width: 360, height: 800 });
  await checkMark('.sca-stage');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.locator('.sca-stage').screenshot({ path: `${folder}/mobile.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS web, presentation and 360px copyright; original SCA credit; ${slides.length} downloaded PPTX slides; zero runtime errors`);
} finally {
  await browser.close();
}
