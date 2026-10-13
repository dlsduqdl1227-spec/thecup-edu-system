// Build static English translations with Chrome's ON-DEVICE Translator API.
// No course text is sent to a translation service; networking is disabled before translation.
// Usage: node scripts/translate-edu-local.mjs <absolute Playwright module> <Chrome executable>
// Drafts go to ignored outputs/. Review them before promoting them to locales/en.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareEditableDeck } from '../lib/sca-edu/slide-editor.js';
const [playwrightPath, chromePath] = process.argv.slice(2);
if (!playwrightPath || !chromePath) throw new Error('Provide Playwright module and Chrome executable paths.');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const catalog = JSON.parse(await readFile('lib/sca-edu/decks/catalog.json', 'utf8'));
const files = catalog.courses.flatMap(c => c.levels.filter(l => l.deck).map(l => l.deck)).concat(['visuals.json', 'required-visuals.json', 'terminology.json']);
const strings = new Set();
function collect(value) {
  if (typeof value === 'string' && /[가-힣]/u.test(value)) strings.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
for (const file of files) {
  const data = JSON.parse(await readFile(`lib/sca-edu/decks/${file}`, 'utf8'));
  collect(data.slides ? prepareEditableDeck(data) : data);
}
const extra = process.argv.indexOf('--extra-json');
if (extra >= 0) collect(JSON.parse(await readFile(process.argv[extra + 1], 'utf8')));
await mkdir('outputs/i18n-tools', { recursive: true });
const out = 'outputs/i18n-tools/en-draft.json';
const translations = JSON.parse(await readFile(out, 'utf8').catch(() => '{}'));
const terminology = process.argv.includes('--terminology');
const terms = new Map([
  ['정동 평가', 'affective assessment'], ['정동', 'affective'], ['묘사 평가', 'descriptive assessment'],
  ['후비강성 후각', 'retronasal olfaction'], ['전비강성 후각', 'orthonasal olfaction'],
  ['후비강성', 'retronasal'], ['전비강성', 'orthonasal'], ['후비강', 'retronasal'], ['전비강', 'orthonasal'],
  ['마우스필', 'mouthfeel'], ['미분', 'fines'], ['분쇄도', 'grind size'], ['생두', 'green coffee'],
  ['그라인더', 'grinder'], ['시스템 사고', 'systems thinking'], ['실사', 'due diligence'],
  ['알칼리도', 'alkalinity'], ['침출식', 'immersion'], ['침출', 'immersion'],
  ['플레이버 휠', 'Flavor Wheel'], ['도징', 'dosing'], ['디개싱', 'degassing'],
  ['스코칭', 'scorching'], ['센서리', 'sensory'], ['커핑', 'cupping'],
]);
const problem = /정동|후비강|전비강|미분|마우스필|분쇄도|시스템 사고|실사/;
const browser = await chromium.launchPersistentContext(resolve(`outputs/i18n-tools/translate-${Date.now()}`), { headless: true, executablePath: chromePath });
try {
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:5175/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><button>Start local translator</button>' }));
  await page.goto('http://127.0.0.1:5175/');
  console.log('Translator availability:', await page.evaluate(() => Translator.availability({ sourceLanguage: 'ko', targetLanguage: 'en' })));
  await page.evaluate(() => { document.querySelector('button').onclick = () => {
    window.translatorReady = Translator.create({ sourceLanguage: 'ko', targetLanguage: 'en' });
  }; });
  await page.getByRole('button').click();
  await page.evaluate(async () => { window.eduTranslator = await window.translatorReady; });
  // All models are ready. No network is permitted while user-owned content is translated.
  await browser.setOffline(true);
  const pending = [...strings].filter(s => terminology ? problem.test(s) : !translations[s]);
  console.log(`Local translation: ${strings.size} unique strings, ${pending.length} pending.`);
  for (let i = 0; i < pending.length; i += 50) {
    const batch = pending.slice(i, i + 50);
    const input = batch.map(text => terminology ? [...terms].reduce((s, [ko, en]) => s.replaceAll(ko, en), text) : text);
    const results = await page.evaluate(async texts => {
      const results = [];
      for (const text of texts) results.push(await window.eduTranslator.translate(text));
      return results;
    }, input);
    batch.forEach((text, index) => { translations[text] = results[index]; });
    await writeFile(out, JSON.stringify(translations, null, 2) + '\n');
    console.log(`Translated ${Math.min(i + 50, pending.length)}/${pending.length}`);
  }
} finally { await browser.close(); }
