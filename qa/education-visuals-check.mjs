// Public read-only checks, usable locally or on the deployed Pages address.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const baseURL=process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const folder='outputs/qa/education-visuals'+(baseURL.includes('pages.dev')?'-live':'');
await mkdir(folder,{recursive:true});
const report={baseURL,checks:[],errors:[],writes:0};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'&&{executablePath:process.env.QA_BROWSER})});
 try{
  const context=await browser.newContext({baseURL,reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(route.request().url().startsWith(baseURL)&&!['GET','HEAD'].includes(route.request().method())){report.writes++;return route.abort();}return route.continue();});
  for(const [width,height] of [[1440,1000],[768,1024],[390,844],[360,800],[320,800],[844,390]]){
   const page=await context.newPage();await page.setViewportSize({width,height});
   page.on('pageerror',e=>report.errors.push(name+': '+e.message));
   const response=await page.goto('/?home=1');assert.equal(response.status(),200);await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>{const img=document.querySelector('.learning-hero-visual img');return img?.complete&&img.naturalWidth>0;});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,name+' '+width);
   assert.match(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily),/Pretendard/);
   await page.screenshot({path:`${folder}/${name}-hero-${width}.png`});
   if(width===360||width===1440){
    const gallery=page.locator('.learning-course-gallery');
    const next=page.getByRole('button',{name:'다음 과정 보기',exact:true});
    const previous=page.getByRole('button',{name:'이전 과정 보기',exact:true});
    assert.equal(await previous.isDisabled(),true);
    await next.click();await page.waitForFunction(()=>document.querySelector('.learning-course-gallery').scrollLeft>20);
    await page.waitForFunction(()=>!document.querySelector('[aria-label="이전 과정 보기"]').disabled);
    assert.equal(await previous.isEnabled(),true);
    for(const course of ['브루잉','로스팅','센서리','그린커피','바리스타']){
     const button=gallery.getByRole('button',{name:course,exact:true});await button.focus();await page.keyboard.press('Enter');
     assert.equal(await button.getAttribute('aria-pressed'),'true');
     await page.waitForFunction(img=>img.complete&&img.naturalWidth>0,await button.locator('img').elementHandle());
     await page.locator('#learning-course-detail').getByRole('heading',{name:course,exact:true}).waitFor();
    }
    for(const [section,selector] of [['courses','#courses'],['corporate','.learning-corporate'],['extras','.learning-extra-section']]){
     await page.locator(selector).scrollIntoViewIfNeeded();
     // Responsive srcset can switch during layout; inspect the final loaded source
     // rather than decode()'s promise for a superseded image request.
     await page.waitForFunction(selector=>[...document.querySelectorAll(selector+' img')].every(img=>img.complete&&img.naturalWidth>0),selector);
     await page.locator(selector).screenshot({path:`${folder}/${name}-${section}-${width}.png`});
    }
    assert.equal(await gallery.locator('button[aria-pressed=true]').count(),1);
   }
   await page.close();
  }
  report.checks.push(name+': 320–1440px, landscape, no horizontal overflow; image decode; gallery arrows/keyboard and selection; no JS errors');
  await context.close();
 }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);assert.equal(report.writes,0);
await writeFile(folder+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
