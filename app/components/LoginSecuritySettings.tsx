"use client";

import { type FormEvent, useRef, useState } from "react";
import { requestJson } from "../../lib/api-client";

export function LoginSecuritySettings() {
  const [audience, setAudience] = useState("operator");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (payload.newCode !== payload.confirmCode) { setResult({ error: true, text: "새 보안코드가 일치하지 않습니다." }); return; }
    submitting.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await requestJson<{ requiresRelogin: boolean }>("/api/auth/security-code", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      form.reset();
      setResult({ error: false, text: "보안코드를 변경했습니다. 대상 사용자에게 새 코드를 안내해 주세요." });
      if (response.requiresRelogin) window.location.replace("/admin");
    } catch (error) { setResult({ error: true, text: error instanceof Error ? error.message : "변경하지 못했습니다. 다시 시도해 주세요." }); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <article className="panel login-security-panel" aria-labelledby="login-security-title">
    <div className="panel-heading"><div><span className="eyebrow">로그인 보안</span><h3 id="login-security-title">보안코드 설정</h3></div></div>
    <p>운영자용·수강생용 공통 코드를 각각 관리합니다. 현재 코드는 표시하지 않습니다.</p>
    <form onSubmit={save}>
      <div className="two-columns">
        <label className="field"><span>변경 대상</span><select name="audience" value={audience} disabled={busy} onChange={(event) => { setAudience(event.target.value); setResult(null); }}><option value="operator">운영자 · 직원 · 강사</option><option value="student">수강생</option></select></label>
        <label className="field"><span>현재 운영자 보안코드</span><input name="currentOperatorCode" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,32}" minLength={4} maxLength={32} required disabled={busy} /></label>
      </div>
      <div className="two-columns">
        <label className="field"><span>새 보안코드</span><input name="newCode" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,32}" minLength={4} maxLength={32} placeholder="숫자 4~32자리" required disabled={busy} /></label>
        <label className="field"><span>새 보안코드 확인</span><input name="confirmCode" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,32}" minLength={4} maxLength={32} required disabled={busy} /></label>
      </div>
      <p className="linked-record-note">{audience === "operator" ? "변경하면 본인을 포함한 운영자·직원·강사는 새 코드로 다시 로그인해야 합니다." : "변경하면 수강생은 새 코드로 다시 로그인해야 합니다. 운영자 로그인은 유지됩니다."}</p>
      {result && <p role={result.error ? "alert" : "status"}>{result.text}</p>}
      <button className="primary-button" disabled={busy}>{busy ? "변경 중…" : "보안코드 변경"}</button>
    </form>
  </article>;
}
