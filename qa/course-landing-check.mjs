// Read-only layout / interaction checks. Does not submit consultations or sign in.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const baseURL=process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER});
const context=await browser.newContext({baseURL});
let writes=0;const errors=[];
await context.route('**/*',route=>{
  if(route.request().url().startsWith(baseURL)&&!['GET','HEAD'].includes(route.request().method())){writes++;return route.abort();}
  return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const folder='outputs/qa/course-polish';await mkdir(folder,{recursive:true});
try {
  await page.goto('/?home=1');await page.waitForLoadState('networkidle');
  for(const width of [1440,768,360,320]){
    await page.setViewportSize({width,height:900});
    for(const [name,selector] of [['modules','#courses'],['levels','.learning-level-section'],['packages','.learning-package-section'],['corporate','.learning-corporate'],['consultation','#consult']]){
      await page.locator(selector).screenshot({path:`${folder}/${width}-${name}.png`});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width} ${name}`);
    }
  }
  await page.getByRole('link',{name:'기업교육 문의'}).click();
  await page.waitForURL('**#consult');await page.waitForLoadState('networkidle');
  assert.equal(await page.getByLabel('기업교육',{exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'기업교육 선택 해제',exact:true}).click();
  assert.equal(await page.getByLabel('기업교육',{exact:true}).isChecked(),false);
  await page.getByRole('button',{name:'추가 과정',exact:true}).click();
  for(const name of ['물과 예방정비 · 파운데이션','지속가능성 · 파운데이션','Q Grader']){
    await page.getByLabel(name,{exact:true}).check();
  }
  await page.getByRole('button',{name:'SCA 모듈',exact:true}).click();
  assert.equal(await page.locator('.learning-selection button').count(),3);
  assert.deepEqual(errors,[]);assert.equal(writes,0);
  console.log('PASS public layout 320/360/768/1440px; corporate selection/removal; cross-category selection retained; no production writes');
} finally { await browser.close(); }
