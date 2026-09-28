import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Read-only: safe for local QA or the production URL. No account or DB changes.
const baseURL = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const folder = `outputs/qa/social-${new URL(baseURL).hostname === '127.0.0.1' ? 'local' : 'production'}`;
try {
  await mkdir(folder, { recursive: true });
  for (const path of ['/', '/admin']) {
    const response = await page.goto(path);
    assert.equal(response.status(), 200);
    if (path === '/') await page.getByText('THE CUP EDU', { exact: true }).first().waitFor();
    for (const [property, expected] of [['og:title', 'THE CUP EDU'], ['og:description', 'COFFEE STATION'], ['og:image:width', '1200'], ['og:image:height', '630']]) {
      const tags = page.locator(`meta[property="${property}"]`);
      assert.equal(await tags.count(), 1, `${path} duplicate ${property}`);
      assert.equal(await tags.getAttribute('content'), expected);
    }
    assert.match(await page.locator('meta[property="og:image"]').getAttribute('content'), /\/brand\/thecup-edu-share-v2\.png$/);
    assert.equal(await page.locator('meta[name="twitter:title"]').getAttribute('content'), 'THE CUP EDU');
    assert.match(await page.title(), /더컵에듀/);
    if (path === '/admin') {
      await page.getByRole('button', { name: '로그인', exact: true }).waitFor();
      assert.equal(await page.getByLabel('보안코드', { exact: true }).count(), 1);
    }
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${path} at ${width}px`);
      await page.screenshot({ path: `${folder}/${path === '/' ? 'home' : 'login'}-${width}.png`, fullPage: true });
    }
  }
  const image = await context.request.get('/brand/thecup-edu-share-v2.png');
  assert.equal(image.status(), 200);
  const png = await image.body();
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.equal((await context.request.get('/api/edu/catalog')).status(), 401);
  const crawler = await context.request.get('/', { headers: { 'User-Agent': 'facebookexternalhit/1.1; kakaotalk-scrap/1.0' } });
  assert.equal(crawler.status(), 200);
  assert.match(await crawler.text(), /thecup-edu-share-v2\.png/);
  assert.deepEqual(errors, []);
  console.log('PASS home/staff login PC + 360px, compact OG/Twitter tags, crawler HTML, share PNG, anonymous catalog 401; zero page errors');
} finally {
  await browser.close();
}
