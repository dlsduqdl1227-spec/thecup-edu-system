"use client";
import {useEffect} from "react";
export function PwaRegistration(){
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    let registration:ServiceWorkerRegistration|undefined;
    void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(value=>{registration=value;}).catch(()=>{});
    const update=()=>{if(!document.hidden)void registration?.update().catch(()=>{});};
    document.addEventListener("visibilitychange",update);
    return()=>document.removeEventListener("visibilitychange",update);
  },[]);
  return null;
}
