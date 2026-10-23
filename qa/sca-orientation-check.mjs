// Simulates portrait-locked devices without fullscreen or ScreenOrientation APIs.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder='outputs/qa/orientation';await mkdir(folder,{recursive:true});
const report={checks:[],errors:[]};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true,...(name==='chromium'&&{executablePath:process.env.QA_BROWSER})});
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5173',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));
  try{
    const login=await context.request.post('/api/auth/login',{data:{name:'QA 운영자',phone:'01000009901',securityCode:'7319'}});assert.equal(login.status(),200);
    await page.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(Error('Simulated denial'));Object.defineProperty(window.screen,'orientation',{value:undefined,configurable:true});});
    await page.goto('/admin');await page.locator('.bottom-nav').getByRole('button',{name:'교육',exact:true}).click();
    await page.locator('.sca-thumb').filter({hasText:'카페에서 풀어볼 여섯 상황'}).click();
    await page.locator('[data-act="show"]').click();
    const orientation=page.locator('[data-show="rotate"]'),count=page.locator('.sca-show__count');
    const initial=await count.innerText();
    async function check(rotated,label){
      await page.waitForFunction(rotated=>document.querySelector('.sca-show__surface')?.dataset.rotated===String(rotated),rotated);
      await page.waitForFunction(()=>{const r=document.querySelector('.sca-show__stage .sca-slide')?.getBoundingClientRect();return r&&r.width>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
      const boxes=await page.evaluate(()=>['.sca-show','.sca-show__surface','.sca-show__stage .sca-slide','.sca-show__controls'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
      for(const r of boxes){assert.ok(r.left>=-1&&r.top>=-1&&r.right<=page.viewportSize().width+1&&r.bottom<=page.viewportSize().height+1,`${name} ${label} bounds`);}
      assert.ok(Math.abs(boxes[2].width/boxes[2].height-(rotated?7.5/13.333:13.333/7.5))<0.01);
      const slide=boxes[2],controls=boxes[3];assert.ok(slide.right<=controls.left+1||slide.bottom<=controls.top+1||controls.right<=slide.left+1||controls.bottom<=slide.top+1,'controls do not overlap');
      for(const b of await page.locator('.sca-show button').all()){const r=await b.boundingBox();assert.ok(r.width>=44&&r.height>=44);}
      await page.screenshot({path:`${folder}/${name}-${label}.png`});
    }
    await orientation.tap();await check(true,'portrait-locked');assert.equal(await count.innerText(),initial);
    // Logical left edge becomes the top edge after clockwise rotation.
    const bounds=await page.locator('.sca-show__frame').boundingBox();
    await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height*0.8);assert.notEqual(await count.innerText(),initial);
    await page.locator('[data-show="prev"]').tap();assert.equal(await count.innerText(),initial);
    for(const phrase of ['바빠진 매장의 필터 교체','새 필터인데 유량 감소','© Inyub kim_Thecup Edu']){
      const r=await page.locator('.sca-show__stage .tx').filter({hasText:phrase}).first().boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=391&&r.y+r.height<=845,phrase);
    }
    await page.locator('.sca-show').evaluate(el=>el.style.padding='24px 8px 34px');await check(true,'portrait-safe-area');
    await page.locator('.sca-show').evaluate(el=>el.style.removeProperty('padding'));
    for(const [width,height] of [[320,568],[360,640],[844,390],[390,844]]){await page.setViewportSize({width,height});await check(height>width,`rotation-${width}x${height}`);assert.equal(await count.innerText(),initial);}
    await orientation.tap();await check(false,'automatic-restored');
    await page.locator('[data-show="close"]').tap();await page.locator('.sca-show').waitFor({state:'detached'});
    await page.locator('[data-act="en"]').click();await page.waitForFunction(()=>document.querySelector('.sca')?.lang==='en');
    await page.locator('[data-act="show"]').click();await orientation.tap();await check(true,'english-portrait-locked');assert.equal(await orientation.innerText(),'Auto rotate');
    await page.getByRole('button',{name:'Close presentation',exact:true}).tap();await page.locator('.sca-show').waitFor({state:'detached'});
    assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
    report.checks.push(`${name}: denied fullscreen / no orientation API; manual landscape, safe areas, 320–844px rotation, slide continuity, touch and English`);
    console.log(`PASS ${report.checks.at(-1)}`);
  }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));
