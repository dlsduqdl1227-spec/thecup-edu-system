// Authenticated print and PDF QA uses only the localhost memory database.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { layoutDeck } from '../lib/sca-edu/layouts.js';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder='outputs/qa/sca-print',report={checks:[],errors:[],pdfs:[]};await mkdir(folder,{recursive:true});
const catalog=JSON.parse(await readFile('lib/sca-edu/decks/catalog.json','utf8'));
const allLevels=catalog.courses.flatMap(course=>course.levels.filter(entry=>entry.deck).map(entry=>({courseId:course.id,level:entry.level})));
for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(engineName==='chromium'&&{executablePath:process.env.QA_BROWSER})});
 const contexts=[];
 const create=async(width=1440)=>{const context=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width,height:960}});contexts.push(context);if(engineName==='webkit')await context.addInitScript(()=>Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({update:async()=>{}})},configurable:true}));return context;};
 const ready=async page=>{await page.locator('.edu-print-route[data-ready="true"]').waitFor({timeout:45000});};
 const watch=page=>page.on('pageerror',error=>report.errors.push(engineName+': '+error.message));
 try{
  const admin=await create();
  const api=async(path,data,method='POST')=>{const response=data?await admin.request.fetch(path,{method,data}):await admin.request.get(path);assert.ok(response.ok(),path+' '+response.status()+' '+await response.text());return response.json();};
  const bootstrap=await admin.request.post('/api/auth/bootstrap',{data:{name:'QA 운영자',phone:'01000009901',code:'local-browser-qa',securityCode:'7319'}});
  if(bootstrap.status()!==201)await api('/api/auth/login',{name:'QA 운영자',phone:'01000009901',securityCode:'7319'});
  const name='PDF QA '+engineName,phone='0106'+Date.now().toString().slice(-7);
  const member=await api('/api/booking/admin',{action:'createMember',name,phone,approvalStatus:'APPROVED'});
  const grant=levels=>api('/api/edu/members/bulk',{memberIds:[member.id],levels,enabled:true},'PUT');
  const revoke=levels=>api('/api/edu/members/bulk',{memberIds:[member.id],levels,enabled:false},'PUT');
  const initialLevels=[{courseId:'brewing',level:'Foundation'},{courseId:'sensory-skills',level:'Foundation'}];await grant(initialLevels);
  const student=await create(360);assert.equal((await student.request.post('/api/member-auth/login',{data:{name,phone,securityCode:'08372'}})).status(),200);
  const visitor=await create(360),locked=await visitor.newPage();watch(locked);await locked.goto('/education/print?course=brewing&level=Foundation');await locked.locator('.edu-print-error').waitFor();assert.equal(await locked.locator('.edu-print-sheet').count(),0);assert.equal((await visitor.request.get('/api/edu/decks/brewing/Foundation')).status(),401);
  const denied=await student.newPage();watch(denied);await denied.goto('/education/print?course=brewing&level=Intermediate');await denied.locator('.edu-print-error').waitFor();assert.equal(await denied.locator('.edu-print-sheet').count(),0);assert.equal((await student.request.get('/api/edu/decks/brewing/Intermediate')).status(),404);
  const viewer=await student.newPage();watch(viewer);await viewer.goto('/?view=student');await viewer.waitForLoadState('networkidle');await viewer.locator('.mobile-dock').getByRole('button',{name:'교육자료',exact:true}).click();await viewer.locator('[data-act=print]').waitFor();
  assert.equal(await viewer.locator('[data-act=pptx]').count(),0);assert.equal(await viewer.locator('[data-act=notes]').count(),0);
  const [page]=await Promise.all([student.waitForEvent('page'),viewer.getByRole('link',{name:'PDF 저장·인쇄',exact:true}).click()]);watch(page);await ready(page);assert.match(page.url(),/course=brewing.*level=Foundation/);assert.equal(await page.evaluate(()=>window.opener),null);
  assert.equal(await page.getByRole('button',{name:'PDF 저장·인쇄',exact:true}).isEnabled(),true);
  const brewing=await(await student.request.get('/api/edu/decks/brewing/Foundation')).json();assert.ok(brewing.slides.every(slide=>!Object.hasOwn(slide,'notes')));
  const laid=layoutDeck(brewing),total=laid.length,chart=laid.findIndex(slide=>slide.shapes.some(shape=>shape.t==='chart'))+1,image=laid.findIndex(slide=>slide.shapes.some(shape=>shape.t==='image'))+1;
  assert.ok(image>0&&chart>0);assert.equal(await page.locator('.edu-print-sheet').count(),total);
  assert.equal(await page.locator('.edu-print-document img[loading=lazy]').count(),0);assert.ok(await page.locator('.edu-print-document img').count()>0);
  assert.equal(await page.locator('.edu-print-document img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0&&image.src.startsWith('data:image/png;base64,'))),true);
  for(const width of [320,360,520,768,884,1440]){await page.setViewportSize({width,height:960});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,engineName+' print '+width);if([360,1440].includes(width))await page.screenshot({path:`${folder}/${engineName}-preview-${width}.png`,fullPage:true});}
  await page.getByLabel('출력 범위',{exact:true}).selectOption('custom');await page.getByLabel('선택할 페이지',{exact:true}).fill('0-2');await page.locator('#edu-print-range-error').waitFor();assert.equal(await page.locator('.edu-print-primary').isEnabled(),false);
  const quiz=laid.findIndex(slide=>slide.shapes.some(shape=>shape.reveal))+1;assert.ok(quiz>0);
  const selected=[1,2,3,chart,image,quiz].filter((value,index,all)=>all.indexOf(value)===index).sort((a,b)=>a-b);await page.getByLabel('선택할 페이지',{exact:true}).fill(selected.join(','));await ready(page);assert.equal(await page.locator('.edu-print-sheet').count(),selected.length);
  await page.getByLabel('한 장에 담을 슬라이드',{exact:true}).selectOption('2');await ready(page);assert.equal(await page.locator('.edu-print-sheet').count(),Math.ceil(selected.length/2));
  await page.evaluate(()=>{window.print=undefined;});await page.getByRole('button',{name:'PDF 저장·인쇄',exact:true}).click();await page.getByRole('alert').filter({hasText:'기본 브라우저에서 다시 열어 주세요.'}).waitFor();
  await page.evaluate(()=>{window.__qaPrintCalls=0;window.print=()=>{window.__qaPrintCalls++;}});await page.getByRole('button',{name:'PDF 저장·인쇄',exact:true}).click();assert.equal(await page.evaluate(()=>window.__qaPrintCalls),1);
  await page.getByLabel('정답 함께 출력',{exact:true}).check();await ready(page);assert.ok(await page.locator('.edu-print-document .reveal').count()>0);await page.getByLabel('정답 함께 출력',{exact:true}).uncheck();await ready(page);assert.equal(await page.locator('.edu-print-document .reveal').count(),0);
  if(engineName==='chromium'){
   await page.pdf({path:`${folder}/brewing-ko-two.pdf`,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});report.pdfs.push({file:'brewing-ko-two.pdf',pages:Math.ceil(selected.length/2),landscape:false,copyright: true});
   await page.getByLabel('한 장에 담을 슬라이드',{exact:true}).selectOption('1');await ready(page);await page.pdf({path:`${folder}/brewing-ko-one.pdf`,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});report.pdfs.push({file:'brewing-ko-one.pdf',pages:selected.length,landscape:true,copyright:true});
  }
  await page.goto('/education/print?course=sensory-skills&level=Foundation');await ready(page);const sensory=layoutDeck(await(await student.request.get('/api/edu/decks/sensory-skills/Foundation')).json()),wheel=sensory.findIndex(slide=>slide.shapes.some(shape=>shape.t==='image'))+1;assert.ok(wheel>0);
  await page.getByLabel('출력 범위',{exact:true}).selectOption('custom');await page.getByLabel('선택할 페이지',{exact:true}).fill('1,'+wheel);await ready(page);assert.ok(await page.locator('.edu-print-document .sca-source-image').count()>0);
  if(engineName==='chromium'){await page.pdf({path:`${folder}/sensory-ko.pdf`,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});report.pdfs.push({file:'sensory-ko.pdf',pages:2,landscape:true,copyright:true});}
  await page.route('**/api/edu/decks/sensory-skills/Foundation/assets/*',route=>route.fulfill({status:503,json:{error:'QA missing required chart'}}));await page.reload();await page.locator('.edu-print-error').waitFor();assert.equal(await page.locator('.edu-print-primary').isEnabled(),false);assert.equal(await page.locator('.edu-print-sheet').count(),0);await page.unroute('**/api/edu/decks/sensory-skills/Foundation/assets/*');
  await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await ready(page);
  await revoke(initialLevels);await page.reload();await page.locator('.edu-print-error').waitFor();assert.equal(await page.locator('.edu-print-sheet').count(),0);await grant(initialLevels);
  const teacher=await admin.newPage();watch(teacher);await teacher.goto('/education/print?course=water-maintenance&level=Foundation&lang=en&slide=7');await ready(teacher);assert.equal(await teacher.locator('.edu-print-route').getAttribute('lang'),'en');
  await teacher.getByLabel('Pages',{exact:true}).selectOption('current');await ready(teacher);assert.equal(await teacher.locator('.edu-print-slide-block').count(),1);assert.match(await teacher.locator('.edu-print-page-label').innerText(),/7 \/ /);
  if(engineName==='chromium'){await teacher.pdf({path:`${folder}/water-en.pdf`,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});report.pdfs.push({file:'water-en.pdf',pages:1,landscape:true,copyright:true});}
  // Check every registered course/level in both languages, including non-printed
  // preview pages. No source slides or real member grants are changed.
  if(engineName==='chromium')for(const {courseId,level}of allLevels)for(const lang of ['ko','en']){
   await teacher.goto(`/education/print?course=${courseId}&level=${level}&lang=${lang}`);await ready(teacher);const count=await teacher.locator('.edu-print-slide-block').count();assert.ok(count>0);
   assert.equal(await teacher.locator('.edu-print-document .sca-source-image').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)),true);
   assert.equal(await teacher.locator('.edu-print-document').evaluate(root=>root.querySelectorAll('.edu-print-slide-block').length===[...root.querySelectorAll('.edu-print-slide-block')].filter(node=>node.textContent.includes('© Inyub kim_Thecup Edu')).length),true);
  }
  report.checks.push(engineName+': anonymous and ungranted-level denial, student print link without PPTX/notes, native print action, eager protected charts, custom ranges, 1-up/2-up, optional answers, failed image blocks printing, grant revocation, English/current-slide output, 320–1440px'+(engineName==='chromium'?', all 18 levels × Korean/English prepared and 4 actual PDFs generated':''));console.log('PASS '+report.checks.at(-1));
 }finally{for(const context of contexts)await context.close();await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
