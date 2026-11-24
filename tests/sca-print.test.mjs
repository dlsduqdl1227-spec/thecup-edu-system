import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
import { slideHtml } from '../lib/sca-edu/render-web.js';
import { EDU_COPYRIGHT } from '../lib/sca-edu/theme.js';
import { printRequest, printHref, printRange, printableSlides, printSheets, printFileTitle, waitForPrintResources } from '../lib/sca-edu/print.js';

test('print links contain only course, level, language and current slide', () => {
  const url=new URL(printHref('sensory-skills','Foundation','en',4),'https://edu.test');
  assert.equal(url.pathname,'/education/print');
  assert.deepEqual(printRequest(url.searchParams),{course:'sensory-skills',level:'Foundation',language:'en',start:5});
  assert.deepEqual([...url.searchParams.keys()],['course','level','lang','slide']);
  for(const query of ['course=../private&level=Foundation','course=brewing&level=../Foundation','course=brewing&level=Foundation&lang=xx','course=brewing&level=Foundation&slide=-1','course=brewing&level=Foundation&slide=1e2'])assert.throws(()=>printRequest(new URLSearchParams(query)));
});
test('range selection is bounded, deduplicated and ordered without silent omissions', () => {
  assert.deepEqual(printRange('1-3, 2, 8',10),[0,1,2,7]);
  assert.deepEqual(printRange(' 8, 1 ',10),[0,7]);
  for(const input of ['', '0','9-2','1-11','1.5','1,,2','1-2,','-1','all','1<script>'])assert.throws(()=>printRange(input,10));
  assert.throws(()=>printRange('1',0));
});
test('print preparation excludes notes and hidden answers, preserves required images and copyright', () => {
  const original=[{bg:'FFFFFF',title:'Example',notes:'PRIVATE PRESENTER NOTE',sourceNote:'PRIVATE SOURCE',shapes:[{t:'text',paras:[{text:EDU_COPYRIGHT}]},{t:'text',reveal:true,paras:[{text:'ANSWER TO HIDE'}]},{t:'image',src:'/api/protected',data:'data:image/png;base64,AAAA',alt:'Mandatory chart'}]}];
  const output=printableSlides(original);
  assert.doesNotMatch(JSON.stringify(output),/PRIVATE|ANSWER TO HIDE/);
  assert.match(JSON.stringify(output),/Mandatory chart/);assert.equal(output[0].shapes[1].src,'data:image/png;base64,AAAA');
  assert.match(JSON.stringify(printableSlides(original,true)),/ANSWER TO HIDE/);
  assert.equal(original[0].shapes.length,3);assert.equal(original[0].notes,'PRIVATE PRESENTER NOTE');
  assert.throws(()=>printableSlides([{...original[0],shapes:[{t:'image',src:'/missing'}]}]),/필수 이미지/);
});
test('one/two-slide handouts retain order and a final odd page', () => {
  assert.deepEqual(printSheets([1,2,3],2),[[1,2],[3]]);assert.deepEqual(printSheets([1,2],1),[[1],[2]]);
  assert.throws(()=>printSheets([1],3));assert.deepEqual(printSheets([],1),[]);
  assert.equal(printFileTitle({course:'Brewing / Water',level:'Foundation',language:'en'}),'THECUP_SCA_Brewing - Water_Foundation_EN');
});
test('fonts and all images must finish decoding before native printing is enabled', async () => {
  const calls=[];
  const element={textContent:'한글 English',ownerDocument:{fonts:{load:async(font,text)=>{calls.push([font,text]);},ready:Promise.resolve()}},querySelectorAll:()=>[{decode:async()=>{calls.push('image')},naturalWidth:100,naturalHeight:100}]};
  await waitForPrintResources(element);assert.equal(calls.length,3);assert.ok(calls.every(call=>call==='image'||call[1]==='한글 English'));
  await assert.rejects(waitForPrintResources({...element,querySelectorAll:()=>[{decode:async()=>{},naturalWidth:0,naturalHeight:100}]}),/이미지/);
});
test('every course and level keeps its original geometry, charts and mandatory images in print', async () => {
  const bundle=await build({stdin:{contents:"export {EDU_DECKS} from './lib/sca-edu/decks';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
  const {EDU_DECKS}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  assert.equal(Object.keys(EDU_DECKS).length,18);
  for(const [key,deck]of Object.entries(EDU_DECKS)){
    const source=layoutDeck(deck).map(slide=>({...slide,shapes:slide.shapes.map(shape=>shape.t==='image'?{...shape,data:'data:image/png;base64,AAAA'}:shape)}));
    const output=printableSlides(source,true);assert.equal(output.length,source.length,key);
    for(let i=0;i<output.length;i++){
      assert.equal(output[i].shapes.length,source[i].shapes.length,key+' shapes');
      for(let j=0;j<output[i].shapes.length;j++){const original=source[i].shapes[j],printed=output[i].shapes[j];assert.deepEqual(printed,original.t==='image'?{...original,src:original.data}:original,key+' layout');}
      assert.match(slideHtml(output[i]),/Inyub kim_Thecup Edu/,key+' copyright');
      assert.equal(Object.hasOwn(output[i],'notes'),false);
    }
  }
});
test('printing uses authenticated APIs without changing the administrator-only PPTX rule', async () => {
  const root=new URL('../',import.meta.url);
  const [viewer,component,worker,css]=await Promise.all(['lib/sca-edu/viewer.js','app/components/ScaPrint.tsx','worker/index.ts','app/education/print/print.css'].map(path=>readFile(new URL(path,root),'utf8')));
  assert.match(viewer,/isAdmin && opts.loadPptxLib/);assert.match(viewer,/data-act="print"/);
  assert.match(component,/\/api\/edu\/decks\//);assert.match(component,/loadPresentationImages/);assert.match(component,/cache: "no-store"/);
  assert.match(component,/loading="eager"/);assert.match(component,/disabled=\{!ready\}/);assert.match(component,/window.print\(\)/);
  assert.doesNotMatch(component,/EDU_DECKS|decks\.ts|locales\/en\.json|\.notes\b/);
  assert.match(worker,/pathname === "\/education\/print"\) headers.set\("Cache-Control", "private, no-store"\)/);
  assert.match(css,/break-after: page/);assert.match(css,/print-color-adjust: exact/);
});
