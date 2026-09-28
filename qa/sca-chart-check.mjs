import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
import { exportPptx } from '../lib/sca-edu/export-pptx.js';

// Uses the same browser vendor bundle as the product, no additional runtime dependency.
const { runInNewContext } = await import('node:vm');
const context = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Blob, Uint8Array, ArrayBuffer, Promise };
context.window = context;
runInNewContext(await readFile(new URL('../public/vendor/pptxgen.bundle.js',import.meta.url),'utf8'),context);
const visuals=JSON.parse(await readFile(new URL('../lib/sca-edu/decks/visuals.json',import.meta.url),'utf8'));
visuals.push(...JSON.parse(await readFile(new URL('../lib/sca-edu/decks/required-visuals.json',import.meta.url),'utf8')).filter(v=>v.slide.layout==='chart'));
for(const course of ['water-maintenance','sustainability']) {
  const deck=JSON.parse(await readFile(new URL(`../lib/sca-edu/decks/${course}/foundation.json`,import.meta.url),'utf8'));
  visuals.push(...deck.slides.filter(s=>s.layout==='chart').map(slide=>({slide})));
}
const deck={ course:'SCA Chart QA',level:'All',slides:visuals.map(v=>v.slide) };
const output=path.resolve('outputs/qa/sca-chart-validation.pptx');
await mkdir(path.dirname(output),{recursive:true});
const blob=await exportPptx({PptxGenJS:context.PptxGenJS,JSZip:context.JSZip,deck,laid:layoutDeck(deck),outputType:'uint8array'});
await writeFile(output,blob);
const zip=unzipSync(blob);
const charts=Object.keys(zip).filter(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p));
assert.equal(charts.length,19);
for(const [i,visual] of visuals.entries()) {
  const file=`ppt/charts/chart${i+1}.xml`;
  const xml=strFromU8(zip[file]);
  assert.ok(xml.includes(`<c:${visual.slide.chart.kind}Chart>`),file);
  for(const s of visual.slide.chart.series) for(const v of s.values) assert.ok(xml.includes(`<c:v>${v}</c:v>`), `${file}: ${v}`);
  assert.match(xml,/<c:externalData/);
  if(visual.slide.chart.kind !== 'radar') {
    assert.ok(xml.includes(visual.slide.chart.xLabel));
    assert.ok(xml.includes(visual.slide.chart.yLabel));
  }
  assert.match(strFromU8(zip[`ppt/charts/_rels/chart${i+1}.xml.rels`]),/\.xlsx/);
}
assert.equal(Object.keys(zip).filter(p=>p.startsWith('ppt/embeddings/')&&p.endsWith('.xlsx')).length,19);
console.log('PASS 19 editable native charts, source values, embedded Excel workbooks');
// Optional independent renderer. Its previews are QA artifacts, not downloadable course data.
if(process.env.QA_ARTIFACT_MODULE) {
  const {FileBlob,PresentationFile}=await import(pathToFileURL(process.env.QA_ARTIFACT_MODULE).href);
  const imported=await PresentationFile.importPptx(await FileBlob.load(output));
  for(let i=0;i<visuals.length;i++){
    const png=await imported.export({slide:imported.slides.getItem(i),format:'png',scale:1});
    await writeFile(`outputs/qa/pptx-chart-${i+1}.png`,new Uint8Array(await png.arrayBuffer()));
  }
  console.log('PASS PPTX reimport and rendered previews');
}
