// Read-only UI test with synthetic consultations and students. No production writes.
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
const {chromium,webkit}=await import(pathToFileURL(process.env.QA_PLAYWRIGHT).href);
const baseURL=process.env.QA_BASE_URL||"http://127.0.0.1:5174";
const fixtureURL="http://127.0.0.1:5174";
const folder="outputs/qa/consultation-layout"+(baseURL.includes("pages.dev")?"-live":"");
await mkdir(folder,{recursive:true});
const report={baseURL,checks:[],errors:[],writes:0};
const interests=["barista:intermediate","barista:professional"];
const rows=[
 {id:1,memberId:1,name:"레이아웃 확인",phoneLast4:"0001",interests:JSON.stringify(interests),status:"NEW",contactChannel:"전화",createdAt:"2026-11-10 04:56:00",updatedAt:"2026-11-10 04:56:00",deletedAt:null,revision:1,instructorName:null,approvalStatus:"PENDING"},
 {id:2,memberId:2,name:"긴 이름과 긴 담당자 이름을 확인하는 테스트 수강생",phoneLast4:"0002",interests:JSON.stringify(["water:foundation","sustainability:foundation","roasting:professional","all-professional","cafe-diploma","LegacyModuleWithoutAnySpaces".repeat(6)]),status:"CONTACTED",contactChannel:"카카오톡",createdAt:"2026-11-09 01:30:00",updatedAt:"2026-11-09 01:30:00",deletedAt:null,revision:1,instructorName:"긴 담당 강사 이름의 줄바꿈도 확인하는 테스트 이름",approvalStatus:"APPROVED"},
 {id:3,memberId:3,name:"과정 미선택",phoneLast4:"0003",interests:"[]",status:"CLOSED",contactChannel:"문자",createdAt:"2026-11-08 01:30:00",updatedAt:"2026-11-08 01:30:00",deletedAt:null,revision:1,instructorName:null,approvalStatus:"PENDING"},
];
for(const[name,engine]of [["chromium",chromium],["webkit",webkit]]){
 const browser=await engine.launch({headless:true,...(name==="chromium"&&{executablePath:process.env.QA_BROWSER})});
 try{
  const seed=await browser.newContext({baseURL:fixtureURL});
  const boot=await seed.request.post("/api/auth/bootstrap",{data:{name:"QA 운영자",phone:"01000009901",code:"local-browser-qa",securityCode:"7319"}});
  if(boot.status()!==201)assert.equal((await seed.request.post("/api/auth/login",{data:{name:"QA 운영자",phone:"01000009901",securityCode:"7319"}})).status(),200);
  const fixture=await(await seed.request.get("/api/dashboard")).json();assert.equal(fixture.user.name,"QA 운영자");await seed.close();
  const context=await browser.newContext({baseURL,viewport:{width:884,height:900}}),page=await context.newPage();
  page.on("pageerror",e=>report.errors.push(name+": "+e.message));
  await context.route("**/*",route=>{
   const request=route.request();if(!request.url().startsWith(baseURL))return route.continue();
   if(!["GET","HEAD"].includes(request.method())){report.writes++;return route.abort();}
   const url=new URL(request.url());let data=null;
   if(url.pathname==="/api/auth/status")data={user:fixture.user,bootstrapRequired:false,publicPageVisible:false};
   if(url.pathname==="/api/dashboard")data=fixture;
   if(url.pathname==="/api/learning/notifications")data={newConsultations:1,latestId:1};
   if(url.pathname==="/api/learning/consultation-management"){
    const row=rows.find(row=>row.id===Number(url.searchParams.get("id")));
    data=row?{detail:{...row,phone:"0100000"+row.phoneLast4,ageRange:"30대",discovery:"SNS",message:"상담 상세 확인",staffNote:"",instructorId:null,canEdit:true},isAdmin:true,instructors:[{id:1,name:fixture.user.name}]}:{rows,total:rows.length,page:1,isAdmin:true};
   }
   if(url.pathname==="/api/learning/admin"){
    const audience=url.searchParams.get("audience"),selected=rows.find(row=>row.id===Number(url.searchParams.get("memberId")));
    const members=rows.filter(row=>audience==="students"?row.approvalStatus==="APPROVED":row.approvalStatus!=="APPROVED").map(row=>({id:row.memberId,name:row.name,phoneLast4:row.phoneLast4,approvalStatus:row.approvalStatus,needsConsultation:row.status==="NEW"?1:0,enrollmentCount:1}));
    data={isAdmin:true,members,total:members.length,page:1,instructors:[],requests:[],requestTotal:0,detail:selected?{member:{id:selected.memberId,name:selected.name,approvalStatus:selected.approvalStatus},consultations:[],enrollments:[],courseBookingRequired:true}:null};
   }
   return data?route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)}):route.continue();
  });
  await page.goto("/admin");await page.locator(".consultation-alert").getByRole("button",{name:"상담 확인하기",exact:false}).click();
  await page.getByRole("heading",{name:"상담 접수함",exact:true}).waitFor();await page.waitForLoadState("networkidle");
  async function inspect(label){
   await page.evaluate(()=>document.fonts.ready);
   const issues=await page.evaluate(()=>{
    const issues=[];
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push("page overflow");
    for(const table of document.querySelectorAll(".consultation-table")){
     if(table.getBoundingClientRect().width>table.parentElement.clientWidth+1)issues.push("table overflow");
     for(const cell of table.querySelectorAll("tbody td")){
      if(cell.scrollWidth>cell.clientWidth+1)issues.push("cell overflow: "+cell.dataset.label);
      const bounds=cell.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(cell);
      for(const rect of range.getClientRects())if(rect.width>0&&(rect.left<bounds.left-1||rect.right>bounds.right+1))issues.push("content crosses cell: "+cell.dataset.label);
      const button=cell.querySelector("button");
      if(button){const rect=button.getBoundingClientRect();if(rect.width<44||rect.height<44)issues.push("small action target");}
     }
    }
    for(const control of document.querySelectorAll(".consultation-filters input,.consultation-filters select,.consultation-filters button")){
     const rect=control.getBoundingClientRect();if(rect.left<0||rect.right>innerWidth+1)issues.push("filter overflow");
    }
    return issues;
   });
   assert.deepEqual(issues,[],name+" "+label);
  }
  for(const width of [320,360,390,520,640,768,884,900,960,1024,1025,1100,1200,1280,1440,1920]){
   await page.setViewportSize({width,height:900});await inspect("inbox "+width);
   assert.equal(await page.locator(".consultation-course-list").first().locator("li").count(),2);
   if([390,884,1025,1440].includes(width)){
    await page.locator(".consultation-table tbody tr").first().scrollIntoViewIfNeeded();
    await page.screenshot({path:folder+"/"+name+"-inbox-"+width+".png"});
   }
  }
  for(const [width,height] of [[884,500],[640,360],[360,640]]){await page.setViewportSize({width,height});await inspect("short window "+width+"x"+height);}
  await page.setViewportSize({width:1920,height:1000});
  await page.locator(".operations-hub>.page-section").first().evaluate(el=>el.style.width="650px");
  await inspect("narrow panel on wide screen");assert.equal(await page.locator(".consultation-table").evaluate(el=>getComputedStyle(el).display),"block");
  await page.locator(".operations-hub>.page-section").first().evaluate(el=>el.style.width="");
  const menu=page.getByRole("navigation",{name:"교육 운영 메뉴"});
  for(const tab of ["수강생","미승인 회원"]){
   await menu.getByRole("button",{name:tab,exact:true}).click();await page.locator(".learning-member-list tbody button").first().waitFor();
   for(const width of [320,520,768,884,1025,1440]){await page.setViewportSize({width,height:900});await inspect(tab+" "+width);}
  }
  await menu.getByRole("button",{name:"상담 접수",exact:true}).click();
  await page.getByRole("button",{name:"레이아웃 확인 상담 상세",exact:true}).click();
  await page.getByRole("dialog",{name:"상담 상세·수정"}).getByLabel("신청 내용",{exact:true}).waitFor();
  await page.setViewportSize({width:320,height:800});const dialog=await page.getByRole("dialog").boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=321);
  await page.getByRole("button",{name:"상담 닫기",exact:true}).click();
  report.checks.push(name+": 320–1920px; screenshot-width 884px and sidebar transition 1024/1025px; every course visible; no cell/text/button overlap; narrow container on wide screen; students/prospects and editor safe");
  await context.close();
 }finally{await browser.close();}
}
assert.deepEqual(report.errors,[]);assert.equal(report.writes,0);
await writeFile(folder+"/report.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
