"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { requestJson } from "../../lib/api-client";
import { ageRanges, contactChannels, courseOptions, discoveryChannels, interestOptions, learningCourses, learningLevels, learningPackages } from "../../lib/learning-catalog";

export function CourseLanding({ entry, member, onStudent, children }: { entry: string | null; member: boolean; onStudent: () => void; children?: ReactNode }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const success = useRef<HTMLDivElement>(null);
  function choose(id: string) { setSelected(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]); setError(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!selected.length) { setError("관심 과정을 하나 이상 선택해 주세요. 아직 고민 중이면 ‘상담 후 결정’을 선택하세요."); return; }
    submitting.current = true; setBusy(true); setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await requestJson<{ message: string }>("/api/learning/consultations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(values), interests: selected, consent: values.get("consent") === "on" }) });
      setResult(response.message); form.reset(); setSelected([]);
      requestAnimationFrame(() => success.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "접수하지 못했습니다. 다시 시도해 주세요."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="learning-public">
    <header className="learning-header"><Link href="/?home=1" className="learning-brand">THE CUP EDU<small>COFFEE EDUCATION</small></Link><nav aria-label="교육 홈페이지 메뉴">
      <Link href="/?home=1#courses">과정 안내</Link><Link href="/?view=consultation#consult">상담 신청</Link>
      {member ? <button onClick={onStudent}>내 수강</button> : <Link href="/?view=student#portal-entry-content">수강생 로그인</Link>}
      <Link className="staff-entry" href="/admin">직원 로그인</Link>
    </nav></header>
    {entry === "student" || entry === "visitor" ? <div className="learning-entry">{children}<p className="learning-back"><Link href="/?home=1">← 과정 안내로 돌아가기</Link> · <Link href="/?view=consultation#consult">처음이신가요? 교육 상담 신청</Link></p></div> : <>
      {entry !== "consultation" && <>
        <section className="learning-hero"><div><span className="learning-eyebrow">배우는 즐거움, 커피의 깊이</span><h1>커피를 이해하는<br />나만의 다음 단계.</h1><p>첫 잔의 기초부터 전문가의 기준까지.<br />당신의 목표에 맞는 교육과 일정을 함께 만듭니다.</p><div className="learning-actions"><a className="learning-primary" href="#courses">나에게 맞는 과정 찾기 <span>↘</span></a><a href="#consult">교육 상담 신청 →</a></div></div><aside className="learning-fee"><span>한 회차, 깊이 있는 2.5시간</span><div><small>구독자</small><strong>80,000<small>원 / 회</small></strong></div><div><small>비구독자</small><strong>120,000<small>원 / 회</small></strong></div><p>일반 모듈 교육 기준 · 시험비 별도<br />구독 여부와 최종 교육비는 상담 시 확인합니다.</p></aside></section>
        <section className="learning-steps" aria-label="교육 이용 순서">{[["01", "과정 선택", "목표에 맞는 교육을 고릅니다."], ["02", "맞춤 상담", "일정·교육비·선수 조건을 확인합니다."], ["03", "결제·수강 승인", "담당 강사와 수강 회차가 등록됩니다."], ["04", "시간 선택·확정", "빈 시간을 신청하면 강사가 확정합니다."]].map(([n, title, copy]) => <article key={n}><span>{n}</span><h2>{title}</h2><p>{copy}</p></article>)}</section>
        <section id="courses" className="learning-section"><div className="learning-section-title"><span className="learning-eyebrow">SCA COFFEE SKILLS</span><h2>다섯 가지 모듈,<br className="only-small" /> 세 단계의 성장.</h2><p>관심 분야부터 시작하세요. 모든 모듈에서 파운데이션·인터미디엇·프로페셔널 교육이 가능합니다.</p></div><div className="learning-courses">{learningCourses.filter(c => c.advanced).map((course, i) => <article key={course.id}><span className="learning-course-number">0{i + 1} / {course.english}</span><h3>{course.name}</h3><p>{course.description}</p><div className="learning-example">예를 들면<br /><strong>{course.example}</strong></div><a href="#consult" onClick={() => setSelected(values => [...new Set([...values, `${course.id}:foundation`])])}>이 과정 상담하기 <span>→</span></a></article>)}</div></section>
        <section className="learning-section learning-level-section"><div className="learning-section-title"><span className="learning-eyebrow">LEARNING PLAN</span><h2>서두르지 않고, 충분히 배우도록.</h2><p>아래는 더컵에듀의 권장 수업 계획입니다. 회차는 상담 후 조정하며, 자격 취득에는 과정별 교육·평가 요건을 충족해야 합니다.</p></div><div className="learning-levels">{learningLevels.map(level => <article key={level.id}><span>{level.english}</span><h3>{level.name}</h3><strong>최소 {level.sessions}<small>회 권장</small></strong><p>{level.description}</p><dl><div><dt>권장 교육시간</dt><dd>{level.sessions * 2.5}시간</dd></div><div><dt>구독자 교육비</dt><dd>{(level.sessions * 80000).toLocaleString()}원~</dd></div><div><dt>비구독자 교육비</dt><dd>{(level.sessions * 120000).toLocaleString()}원~</dd></div></dl></article>)}</div><p className="learning-footnote">5개 일반 모듈의 회당 2.5시간 기준 예시 · 시험비 별도 · 프로페셔널은 해당 모듈의 인터미디엇 등 선수 요건을 상담 시 확인합니다.</p></section>
        <section className="learning-section"><div className="learning-section-title"><span className="learning-eyebrow">BEYOND THE BASICS</span><h2>커피를 더 넓게 이해하는 교육.</h2></div><div className="learning-extras">{learningCourses.filter(c => !c.advanced).map(course => <article key={course.id}><span>{course.id === "q-grader" ? "6명 모집 후 개강 협의" : "Foundation"}</span><h3>{course.name}</h3><p>{course.description}</p><p className="learning-footnote">{course.example}</p><a href="#consult" onClick={() => setSelected(values => [...new Set([...values, `${course.id}:${course.id === "q-grader" ? "course" : "foundation"}`])])}>상담 신청 →</a></article>)}</div></section>
        <section className="learning-section learning-package-section"><div className="learning-section-title"><span className="learning-eyebrow">YOUR LEARNING PATH</span><h2>목표가 있다면,<br />하나의 교육 경로로.</h2><p>디플로마 패키지는 구성 교육비 합계에서 약 20% 할인하여 안내합니다. 이미 보유한 자격과 필요한 과정에 따라 구성이 달라지며, 시험비는 할인 대상에서 제외됩니다.</p></div><div className="learning-packages">{learningPackages.filter(p => p.id !== "corporate").map(item => <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p><a href="#consult" onClick={() => setSelected(values => [...new Set([...values, item.id])])}>구성 상담 →</a></article>)}</div><p className="learning-footnote">디플로마는 교육 신청만으로 발급되지 않습니다. SCA의 경로별 필수 자격과 평가 요건을 확인합니다. 올 프로페셔널의 ‘올 인터미디엇’ 확인은 센터 통합 과정 등록 기준이며, 개별 SCA 모듈의 선수 요건과 구분됩니다. 레벨 통합 과정의 최종 할인·교육비는 상담 시 안내합니다. <a href="https://education.sca.coffee/learners-how-it-works" target="_blank" rel="noreferrer">SCA 공식 안내 ↗</a></p></section>
        <section className="learning-section learning-corporate"><div><span className="learning-eyebrow">FOR YOUR TEAM</span><h2>팀을 위한 커피 교육도<br />함께 설계합니다.</h2><p>실무 역량부터 커피 문화 경험까지.<br />기업의 목적과 인원에 맞춰 교육합니다.</p><a href="#consult" className="learning-primary" onClick={() => setSelected(values => [...new Set([...values, "corporate"])])}>기업교육 문의 →</a></div><div><span>함께한 기업교육</span><strong>동서식품</strong><strong>배민아카데미</strong><strong>현대백화점</strong><p>다양한 기업·기관과 교육을 진행해 왔습니다.</p></div></section>
      </>}
      <section className="learning-section learning-consult" id="consult"><div className="learning-section-title"><span className="learning-eyebrow">LET’S START</span><h2>어떤 커피를 배우고 싶으세요?</h2><p>관심 과정과 연락처를 남겨 주세요.<br />담당자가 전화·문자·카카오톡으로 상담을 이어갑니다. 신청만으로 결제되거나 예약이 확정되지 않습니다.</p><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">카카오톡으로 먼저 문의하기 ↗</a></div>
        {result ? <div className="learning-success" ref={success} tabIndex={-1} role="status"><span>신청 완료</span><h3>만나 뵙게 되어 반갑습니다.</h3><p>{result}</p><p>카카오톡 상담을 선택하셨다면 채널에서 성함과 신청 사실을 알려 주세요. 담당자가 접수 내용을 확인합니다.</p><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">더컵에듀 카카오톡 열기 ↗</a><button type="button" onClick={() => setResult("")}>다른 상담 신청</button></div> : <form className="learning-form" onSubmit={submit}>
          <div className="learning-form-grid"><label>성함<input name="name" autoComplete="name" maxLength={40} required placeholder="성함을 입력해 주세요" /></label><label>연락처<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={15} required placeholder="010-0000-0000" /></label><label>연령대<select aria-label="연령대" name="ageRange" defaultValue="" required><option value="" disabled>선택해 주세요</option>{ageRanges.map(value => <option key={value}>{value}</option>)}</select></label><label>더컵에듀를 알게 된 경로<select aria-label="더컵에듀를 알게 된 경로" name="discovery" defaultValue="" required><option value="" disabled>선택해 주세요</option>{discoveryChannels.map(value => <option key={value}>{value}</option>)}</select></label></div>
          <fieldset><legend>어떤 과정을 원하시나요? <small>여러 개 선택 가능</small></legend><div className="learning-interest-groups">{learningCourses.map(course => <div key={course.id}><strong>{course.name}</strong><div>{courseOptions.filter(option => option.id.startsWith(`${course.id}:`)).map(option => <label key={option.id} className={selected.includes(option.id) ? "selected" : ""}><input type="checkbox" aria-label={option.name} checked={selected.includes(option.id)} onChange={() => choose(option.id)} />{option.name.split(" · ")[1] ?? "교육 상담"}</label>)}</div></div>)}<div><strong>패키지·기업교육</strong><div>{interestOptions.filter(option => !option.id.includes(":")).map(option => <label key={option.id} className={selected.includes(option.id) ? "selected" : ""}><input type="checkbox" aria-label={option.name} checked={selected.includes(option.id)} onChange={() => choose(option.id)} />{option.name}</label>)}</div></div></div></fieldset>
          <label>선호 상담 방법<select name="contactChannel">{contactChannels.map(value => <option key={value}>{value}</option>)}</select></label><label>궁금한 점 <small>선택</small><textarea name="message" rows={3} maxLength={1000} placeholder="희망 요일·시간, 구독 여부, 보유 자격이나 교육 목표를 알려 주세요. 기업교육은 인원도 함께 적어 주세요." /></label>
          <div className="learning-consent"><p>상담 접수·연락 및 수강 관리 목적으로 성함, 연락처, 연령대, 유입 경로, 관심 과정과 상담 내용을 수집합니다. 관리자와 담당 강사만 확인하며, 상담 종료 후 1년간 보관한 뒤 삭제합니다. 수강·계약 기록은 관련 보존 의무에 따라 별도로 관리합니다. 동의를 거부할 수 있으나 온라인 접수는 어렵습니다. 만 14세 미만은 보호자와 카카오톡으로 문의해 주세요.</p><label><input type="checkbox" name="consent" required />만 14세 이상이며, 위 개인정보 수집·이용에 동의합니다.</label></div>
          {error && <p className="learning-error" role="alert">{error}</p>}<button className="learning-primary" disabled={busy}>{busy ? "신청 접수 중…" : "교육 상담 신청하기"}</button><small>자동 문자 발송이 아닌, 담당자가 직접 확인 후 연락하는 상담입니다.</small>
        </form>}
      </section>
    </>}
    <footer className="learning-footer"><span className="learning-brand">THE CUP EDU<small>COFFEE EDUCATION</small></span><div><Link href="/?view=visitor#portal-entry-content">시간표 미리보기</Link><Link href="/admin">직원 로그인</Link><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">카카오톡 상담</a></div><p>교육 상담 → 수강 등록 → 시간 선택 → 강사 확정</p></footer>
  </div>;
}
