// Apply reviewed terminology corrections to the offline translation draft.
// The static result is server-only; no translation model or service runs for learners.
import { readFile, writeFile } from 'node:fs/promises';
const draft = JSON.parse(await readFile('outputs/i18n-tools/en-draft.json', 'utf8'));
const overrides = JSON.parse(await readFile('lib/sca-edu/locales/en-overrides.json', 'utf8'));
const substitutions = [
  [/\bcoffee powder\b/gi, 'coffee grounds'], [/\bcrushing degree\b/gi, 'grind size'],
  [/\bdegree of crushing\b/gi, 'grind size'], [/\bgrinding degree\b/gi, 'grind size'],
  [/\bgreen beans?\b/gi, m => m.endsWith('s') ? 'green coffee beans' : 'green coffee bean'],
  [/\braw beans?\b/gi, 'green coffee'], [/\bleaching formula\b/gi, 'immersion brewing'],
  [/\bleaching\b/gi, 'immersion'], [/\bleachate\b/gi, 'immersion'],
  [/\bhot water tabs?\b/gi, 'hot-water tap'], [/\bmilk feature\b/gi, 'milk pitcher'],
  [/\bshot feature\b/gi, 'shot pitcher'], [/\bPorterfilter\b/gi, 'portafilter'],
  [/\bdozing\b/gi, 'dosing'], [/\bburn wear\b/gi, 'burr wear'],
  [/\bdojing\b/gi, 'dosing'], [/\bdegree of grinding\b/gi, 'grind size'],
  [/\bcrush level\b/gi, 'grind size'], [/\bcrushed coffee\b/gi, 'ground coffee'],
  [/\bcrushing chamber\b/gi, 'grinding chamber'], [/\bcrushing\b/gi, 'grinding'],
  [/\bfirepower\b/gi, 'heat input'], [/\bhole bin\b/gi, 'whole bean'],
  [/\bsensual science\b/gi, 'sensory science'], [/\bWCR vocabulary\b/gi, 'WCR Sensory Lexicon'],
  [/\bfarmhouse\b/gi, 'farm'], [/\bgrindstone\b/gi, 'grinder'],
];
for (const [ko, original] of Object.entries(draft)) {
  let en = original;
  for (const [pattern, replacement] of substitutions) en = en.replace(pattern, replacement);
  if (ko.includes('정수')) en = en.replace(/\binteger\b/gi, 'water treatment');
  if (ko.includes('경도')) en = en.replace(/\blongitude\b/gi, 'hardness');
  if (ko.includes('염소') && !ko.includes('칼디') && /물|수질|처리|냄새|잔류|계열/.test(ko)) en = en.replace(/\bgoats?\b/gi, 'chlorine');
  if (ko.includes('콩') && !ko.includes('대두') && !ko.includes('두유')) en = en.replace(/\bsoybeans?\b/gi, 'coffee beans');
  if (ko.includes('품질 인상')) en = en.replace(/\bquality increase\b/gi, 'impression of quality');
  if (ko.includes('강도')) en = en.replace(/\brobbery\b/gi, 'intensity');
  if (ko.includes('분쇄도')) en = en.replace(/\bgrain size\b/gi, 'grind size');
  if (ko.includes('수분활성도') || ko.includes('수분 활성도')) en = en.replace(/\bmoisture activity\b/gi, 'water activity');
  if (ko.includes('지렛대')) en = en.replace(/\blever point\b/gi, 'leverage point');
  if (ko.includes('원두') || ko.includes('생두') || ko.includes('로스팅')) en = en.replace(/\bfry\b/gi, 'roast').replace(/\bstir-fry\b/gi, 'roast');
  if (ko.includes('로스터') || ko.includes('로스팅')) en = en.replace(/\brosters?\b/gi, m => m.toLowerCase().endsWith('s') ? 'roasters' : 'roaster');
  if (ko.includes('알칼리도')) en = en.replace(/\balkaline too\b/gi, 'alkalinity');
  if (ko.includes('수지')) en = en.replace(/\bSuzy\b/gi, 'resin');
  if (ko.includes('선물')) en = en.replace(/\bgift\b/gi, 'futures');
  if (ko.includes('인증')) en = en.replace(/\bauthentication\b/gi, 'certification');
  if (ko.includes('시스템 사고')) en = en.replace(/\bsystem accident\b/gi, 'systems thinking');
  if (ko.includes('굴절계')) en = en.replace(/\brefractory\b/gi, 'refractometer');
  if (ko.includes('산을') || ko.includes('중화')) en = en.replace(/\bmountains?\b/gi, 'acid');
  if (ko.includes('용존') || ko.includes('녹은')) en = en.replace(/\bmelted\b/gi, 'dissolved');
  if (ko.includes('원두') || ko.includes('생두')) en = en.replace(/\bfried\b/gi, 'roasted').replace(/\bfrying\b/gi, 'roasting');
  if (ko.includes('KR/EN')) en = en.replaceAll('(EN/EN)', '(KR/EN)');
  if (ko.includes('다회용')) en = en.replace(/\brecycling cups\b/gi, 'reusable cups');
  // Repair spacing around emphasis markers introduced by the translator.
  en = en.replace(/\*\*\s+([^*]+?)\s*\*\*/g, '**$1**');
  if ((en.match(/\*\*/g) || []).length % 2) en = en.replaceAll('**', '');
  draft[ko] = overrides[ko] ?? en;
}
for (const [ko, en] of Object.entries(overrides)) if (Object.hasOwn(draft, ko)) draft[ko] = en;
await writeFile('lib/sca-edu/locales/en.json', JSON.stringify(draft, null, 2) + '\n');
console.log(`Prepared ${Object.keys(draft).length} English strings with ${Object.keys(overrides).filter(k => k in draft).length} reviewed overrides.`);
