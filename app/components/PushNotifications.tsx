"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {AccessibleDialog} from "./AccessibleDialog";
import {requestJson} from "../../lib/api-client";

type Audience="STAFF"|"MEMBER";
type DeviceStatus={enabled:boolean;bound:boolean;lastStatus:number;consultations:boolean;bookings:boolean;test:null|{id:string;requestedAt:string;state:string;displayedAt:string|null;providerStatus:number}};
type Config={configured:boolean;publicKey:string;devices:number};
type InstallEvent=Event&{prompt():Promise<void>;userChoice:Promise<{outcome:string}>};
function bytes(value:string){const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,char=>char.charCodeAt(0));}
function fail(error:unknown){return error instanceof Error?error.message:"처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";}
export function PushNotifications({audience,userId,onOpen}:{audience:Audience;userId:number;onOpen:(topic:string)=>void}){
  const [open,setOpen]=useState(false),[config,setConfig]=useState<Config|null>(null),[device,setDevice]=useState<DeviceStatus|null>(null);
  const [supported,setSupported]=useState(false),[permission,setPermission]=useState<NotificationPermission>("default"),[ios,setIos]=useState(false),[installed,setInstalled]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [consultations,setConsultations]=useState(true),[bookings,setBookings]=useState(true);
  const [testId,setTestId]=useState("");
  const installPrompt=useRef<InstallEvent|null>(null),alive=useRef(false),saving=useRef(false);
  const request=useCallback(<T,>(action:string,body:Record<string,unknown>={})=>requestJson<T>("/api/push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,audience,...body})}),[audience]);
  const status=useCallback(async(id?:string)=>{
    if(!("serviceWorker" in navigator))return null;
    const registration=await navigator.serviceWorker.getRegistration("/"),subscription=await registration?.pushManager.getSubscription();
    if(!subscription)return null;
    return request<DeviceStatus>("status",{endpoint:subscription.endpoint,...(id?{testId:id}:{})});
  },[request]);
  const refresh=useCallback(async()=>{
    try{
      const settings=await requestJson<Config>(`/api/push?audience=${audience}`,{cache:"no-store"});
      if(!alive.current)return;setConfig(settings);
      const current=await status().catch(()=>null);
      if(!alive.current)return;setDevice(current);if(current){setConsultations(current.consultations);setBookings(current.bookings);}
    }catch(cause){if(alive.current)setError(fail(cause));}
  },[audience,status]);
  useEffect(()=>{
    alive.current=true;
    const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Macintosh/.test(navigator.userAgent);
    // Browser capability lookup and initial authenticated remote settings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(apple);
    setSupported("serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window);
    setPermission("Notification" in window?Notification.permission:"default");
    setInstalled(window.matchMedia("(display-mode: standalone)").matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));
    void refresh();
    const prompt=(event:Event)=>{event.preventDefault();installPrompt.current=event as InstallEvent;};
    const added=()=>{setInstalled(true);installPrompt.current=null;};
    window.addEventListener("beforeinstallprompt",prompt);window.addEventListener("appinstalled",added);
    return()=>{alive.current=false;window.removeEventListener("beforeinstallprompt",prompt);window.removeEventListener("appinstalled",added);};
  },[refresh,userId]);
  useEffect(()=>{
    const url=new URL(window.location.href),topic=url.searchParams.get("push");
    if(!topic||!["consultations","reservations"].includes(topic))return;
    url.searchParams.delete("push");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
    onOpen(topic);
  },[onOpen]);
  useEffect(()=>{
    if(!open||!testId)return;
    let active=true;const started=Date.now();
    const check=async()=>{try{const next=await status(testId);if(active&&next)setDevice(next);}catch{ /* Keep the last known delivery status. */ }};
    const timer=window.setInterval(()=>{if(Date.now()-started>65000)window.clearInterval(timer);else void check();},2000);
    void check();return()=>{active=false;window.clearInterval(timer);};
  },[open,testId,status]);
  async function enable(){
    if(saving.current)return;
    if(ios&&!installed){setError("Safari에서 홈 화면에 추가한 뒤, 홈 화면의 더컵에듀 아이콘으로 열어 주세요.");return;}
    if(!supported||!config?.configured)return;
    saving.current=true;setBusy(true);setError("");setMessage("");
    try{
      // Permission must be requested directly from this user click, before network work.
      const allowed=Notification.permission==="granted"?"granted":await Notification.requestPermission();setPermission(allowed);
      if(allowed!=="granted")throw new Error("알림이 허용되지 않았습니다. 기기 또는 브라우저 설정에서 허용해 주세요.");
      const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      const oldKey=subscription?.options.applicationServerKey,newKey=bytes(config.publicKey);
      const mismatched=oldKey&&Array.from(new Uint8Array(oldKey)).join(",")!==Array.from(newKey).join(",");
      if(subscription&&(mismatched||[404,410].includes(device?.lastStatus??0))){await subscription.unsubscribe();subscription=null;}
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:newKey});
      await request("subscribe",{subscription:subscription.toJSON(),consultations,bookings});
      await refresh();setMessage("이 기기에 알림을 연결했습니다. 테스트 알림으로 확인해 주세요.");
    }catch(cause){setError(fail(cause));}finally{saving.current=false;setBusy(false);}
  }
  async function mutate(action:"unsubscribe"|"preferences"|"test"){
    if(saving.current)return;saving.current=true;setBusy(true);setError("");setMessage("");
    try{
      const registration=await navigator.serviceWorker.getRegistration("/"),subscription=await registration?.pushManager.getSubscription();
      if(!subscription)throw new Error("이 기기의 알림을 먼저 켜 주세요.");
      const result=await request<{testId?:string}>(action,{endpoint:subscription.endpoint,consultations,bookings});
      if(action==="test"){setTestId(result.testId??"");setMessage("테스트 알림을 요청했습니다. 이 기기에 표시되는지 확인해 주세요.");}
      else {setMessage(action==="unsubscribe"?"이 계정의 기기 알림을 껐습니다.":"알림 종류를 저장했습니다.");await refresh();}
    }catch(cause){setError(fail(cause));}finally{saving.current=false;setBusy(false);}
  }
  async function install(){
    const prompt=installPrompt.current;if(!prompt){setMessage(ios?"Safari 공유 버튼 → 홈 화면에 추가 → 추가를 선택해 주세요.":"브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택해 주세요.");return;}
    try{await prompt.prompt();await prompt.userChoice;installPrompt.current=null;}catch{setError("브라우저 메뉴에서 홈 화면에 추가해 주세요.");}
  }
  const connected=permission==="granted"&&Boolean(device?.enabled&&device.bound);
  const test=device?.test,confirmed=test?.state==="DISPLAYED"&&Boolean(test.displayedAt);
  return <><div className="push-entry"><button type="button" className="push-settings-button" onClick={()=>{setOpen(true);setError("");void refresh();}}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>알림 설정<span className={connected?"push-state on":"push-state"}>{connected?"켜짐":"꺼짐"}</span></button></div>
    {open&&<AccessibleDialog label="기기 알림 설정" onClose={()=>setOpen(false)} busy={busy}><section className="push-dialog"><header><div><span>THE CUP EDU</span><h2>앱을 닫아도,<br/>필요한 소식만.</h2></div><button type="button" disabled={busy} onClick={()=>setOpen(false)} aria-label="알림 설정 닫기">닫기</button></header>
      <p>{audience==="STAFF"?"권한에 따라 새 상담·담당 상담 배정과 예약 신청·취소를 알려드립니다.":"예약 확정·거절·취소 등 본인의 예약 소식을 알려드립니다."} 알림 제목에서 종류를, 미리보기에서 과정과 예약 시간을 확인할 수 있습니다. 이름·연락처·상담 내용은 표시하지 않습니다.</p>
      <div className="push-device-state"><strong>{connected?"이 기기 알림 켜짐":permission==="denied"?"기기에서 알림 차단됨":"이 기기에 알림 연결"}</strong><span>{config?`${config.devices}개 기기 연결 중`:"설정을 확인하고 있습니다…"}</span></div>
      {(!installed||!supported)&&<section className="push-install-guide"><h3>홈 화면에서 앱으로 열어 주세요</h3>{ios?<ol><li>Safari의 공유 버튼을 누릅니다.</li><li>홈 화면에 추가 → 추가를 선택합니다.</li><li>추가된 아이콘으로 열고 로그인한 뒤 알림을 켭니다.</li></ol>:<p>Chrome·삼성 인터넷의 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. 지원되는 PC 브라우저에서도 받을 수 있습니다.</p>}<button type="button" onClick={()=>void install()}>홈 화면 추가 안내</button></section>}
      {!supported&&<p role="status">현재 브라우저에서는 푸시 알림을 사용할 수 없습니다. 아이폰은 iOS 16.4 이상에서 홈 화면 앱으로 열어 주세요.</p>}
      {config&&!config.configured&&<p role="status">알림 서버를 준비 중입니다. 잠시 후 다시 확인해 주세요.</p>}
      {permission==="denied"&&<p>기기 설정의 알림 또는 브라우저의 사이트 설정에서 더컵에듀 알림을 허용해 주세요.</p>}
      {!connected?<button type="button" className="push-primary" disabled={busy||!supported||!config?.configured} onClick={()=>void enable()}>{busy?"연결 중…":device&&!device.bound?"현재 로그인에 알림 다시 연결":"이 기기 알림 켜기"}</button>:<>
        <fieldset className="push-preferences"><legend>받을 알림</legend>{audience==="STAFF"&&<label><input type="checkbox" checked={consultations} onChange={event=>setConsultations(event.target.checked)} disabled={busy}/>상담 접수·배정</label>}<label><input type="checkbox" checked={bookings} onChange={event=>setBookings(event.target.checked)} disabled={busy}/>{audience==="STAFF"?"예약 신청·취소":"승인·예약 상태 변경"}</label><button type="button" disabled={busy} onClick={()=>void mutate("preferences")}>선택 저장</button></fieldset>
        <div className="push-actions"><button type="button" className="push-primary" disabled={busy} onClick={()=>void mutate("test")}>테스트 알림 보내기</button><button type="button" disabled={busy} onClick={()=>void mutate("unsubscribe")}>이 기기 알림 끄기</button></div>
      </>}
      {test&&<div className="push-test-state" role="status"><strong>{confirmed?"이 기기에 테스트 알림이 표시됐습니다.":test.state==="FAILED"?"테스트 알림을 전달하지 못했습니다.":test.state==="ACCEPTED"?"발송 서비스 접수 완료 · 기기 표시 확인 중":"테스트 알림 확인 중"}</strong>{!confirmed&&<p>발송 서비스 접수와 실제 기기 표시는 다릅니다. 잠금 화면·알림 센터, 집중 모드와 기기 알림 설정도 확인해 주세요.</p>}</div>}
      {message&&<p role="status" className="push-message">{message}</p>}{error&&<p role="alert" className="push-error">{error}</p>}
      <p className="push-footnote">기기마다 한 번씩 허용해야 합니다. 내용이 숨겨지면 기기의 알림 설정에서 미리보기 표시를 확인해 주세요. 로그아웃·권한 회수 후에는 새 알림을 보내지 않으며, 다시 로그인하면 연결이 필요할 수 있습니다. 수신 시점은 네트워크·집중 모드·기기 설정에 따라 달라질 수 있습니다.</p>
    </section></AccessibleDialog>}
  </>;
}
