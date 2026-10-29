// Read-only production verification. The presentation fixture stays in this browser only.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const baseURL='https://thecup-edu-system.dlsduqdl1227.workers.dev';
const manifest=JSON.parse(await readFile('dist/client/.vite/manifest.json','utf8'));
const entry='/'+manifest['virtual:vinext-app-browser-entry'].file,viewer='/'+manifest['lib/sca-edu/viewer.js'].file;
const deck=JSON.parse(await readFile('lib/sca-edu/decks/water-maintenance/foundation.json','utf8'));deck.slides=deck.slides.slice(0,4);
const catalog=JSON.parse(await readFile('lib/sca-edu/decks/catalog.json','utf8'));catalog.courses=catalog.courses.filter(c=>c.id==='water-maintenance');
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const folder='outputs/qa/interface-live';await mkdir(folder,{recursive:true});const report={checks:[],errors:[],productionWrites:0};
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true,...(name==='chromium'&&{executablePath:process.env.QA_BROWSER})});
  const context=await browser.newContext({baseURL,viewport:{width:360,height:800},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));
  await context.route('**/*',route=>{if(route.request().url().startsWith(baseURL)&&!['GET','HEAD'].includes(route.request().method())){report.productionWrites++;return route.abort();}return route.continue();});
  try{
    for(const [path,heading] of [['/','커피를 이해하는 나만의 다음 단계.'],['/admin','직원 로그인'],['/?view=student','수강생 로그인']]){
      const r=await page.goto(path);assert.equal(r.status(),200);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      // Finish link prefetches before the next full navigation. WebKit reports aborted
      // cross-document prefetches as access-control errors even when each endpoint is 200.
      await page.waitForLoadState('networkidle');
      assert.ok((await page.content()).includes(entry),'HTML uses tested release entry');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:`${folder}/${name}-${heading}.png`});
    }
    for(const path of ['/api/edu/catalog','/api/edu/members','/api/dashboard','/api/learning/admin','/api/booking/member'])assert.equal((await context.request.get(path)).status(),401,path);
    for(const path of ['/api/roasting','/api/roasting/manual','/api/inventory/roast'])assert.equal((await context.request.get(path)).status(),404,path);
    // Shared modules can move between chunks when the course portal changes.
    // Verify every emitted entry rather than guessing a shared chunk's name.
    for(const [key,asset] of Object.entries(manifest)){
      const file=asset.file,r=await context.request.get('/'+file);assert.equal(r.status(),200);
      assert.equal(hash(await r.body()),hash(await readFile('dist/client/'+file)),`tested bundle: ${key}`);
    }
    // Mount local teaching content with the deployed viewer; no login or member changes.
    await page.evaluate(async({viewer,catalog,deck})=>{
      Element.prototype.requestFullscreen=undefined;Object.defineProperty(window.screen,'orientation',{value:undefined,configurable:true});
      const root=document.createElement('section');root.id='local-fixture';document.body.appendChild(root);
      const {mountScaEducation}=await import(viewer);window.fixture=mountScaEducation(root,{user:{role:'student',name:''},catalog,loadDeck:async()=>deck});
    },{viewer,catalog,deck});
    await page.locator('#local-fixture .sca-thumb').filter({hasText:'카페에서 풀어볼 여섯 상황'}).click();await page.locator('[data-act="show"]').click();await page.locator('[data-show="rotate"]').click();
    await page.waitForFunction(()=>document.querySelector('.sca-show__surface')?.dataset.rotated==='true');
    const r=await page.locator('.sca-show__stage .sca-slide').boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=361&&r.y+r.height<=801);
    await page.screenshot({path:`${folder}/${name}-manual-landscape.png`});await page.locator('[data-show="close"]').click();await page.evaluate(()=>window.fixture.destroy());
    report.checks.push(`${name}: home/operator/student login 200; private APIs 401; retired APIs 404; exact tested bundles; portrait-lock manual landscape`);
    console.log(`PASS ${report.checks.at(-1)}`);
  }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);assert.equal(report.productionWrites,0);await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));
