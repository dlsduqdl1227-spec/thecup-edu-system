"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { requestJson } from "../../lib/api-client";
import { ageRanges, contactChannels, courseOptions, discoveryChannels, interestOptions, learningCourses, learningLevels, learningPackages } from "../../lib/learning-catalog";

export function CourseLanding({ entry, member, onStudent, children }: { entry: string | null; member: boolean; onStudent: () => void; children?: ReactNode }) {
  const [activeCourse, setActiveCourse] = useState("barista");
  const [interestCategory, setInterestCategory] = useState("modules");
  const currentCourse = learningCourses.find(course => course.id === activeCourse)!;
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
        <section className="learning-hero">
          <span className="learning-eyebrow">THE CUP EDU · COFFEE EDUCATION</span>
          <h1>커피를 이해하는<br />나만의 다음 단계.</h1>
          <p>처음 만나는 커피부터, 더 깊은 전문성까지.<br />당신의 목표에 맞춰 함께 배웁니다.</p>
          <div className="learning-actions"><a className="learning-primary" href="#courses">과정 둘러보기 <span aria-hidden="true">↓</span></a><a href="#consult">상담 신청 <span aria-hidden="true">→</span></a></div>
        </section>
        <aside className="learning-fee" aria-label="기본 교육비">
          <div><span>한 회차</span><strong>2.5<small>시간</small></strong></div>
          <div><span>구독자</span><strong>80,000<small>원 / 회</small></strong></div>
          <div><span>비구독자</span><strong>120,000<small>원 / 회</small></strong></div>
          <p>일반 모듈 교육 기준 · 시험비 별도 · 구독 여부와 최종 교육비는 상담 시 확인합니다.</p>
        </aside>
        <section id="courses" className="learning-section">
          <div className="learning-section-title"><span className="learning-eyebrow">SCA COFFEE SKILLS</span><h2>다섯 가지 모듈.<br />관심 있는 분야부터.</h2><p>모든 모듈에서 파운데이션·인터미디엇·프로페셔널 교육이 가능합니다.</p></div>
          <div className="learning-course-switch" role="group" aria-label="교육 모듈 선택">{learningCourses.filter(c => c.advanced).map(course => <button type="button" key={course.id} aria-pressed={activeCourse === course.id} aria-controls="learning-course-detail" onClick={() => setActiveCourse(course.id)}>{course.name}</button>)}</div>
          <article className="learning-course-detail" id="learning-course-detail" aria-live="polite">
            <div><span className="learning-eyebrow">{currentCourse.english}</span><h3>{currentCourse.name}</h3><p>{currentCourse.description}</p></div>
            <div className="learning-example"><span>수업에서는 이런 경험을 합니다</span><p>{currentCourse.example}</p></div>
          </article>
        </section>
        <section className="learning-section learning-level-section"><div className="learning-section-title"><span className="learning-eyebrow">LEARNING PLAN</span><h2>서두르지 않고, 충분히 배우도록.</h2><p>아래는 더컵에듀의 권장 수업 계획입니다. 회차는 상담 후 조정하며, 자격 취득에는 과정별 교육·평가 요건을 충족해야 합니다.</p></div><div className="learning-levels">{learningLevels.map(level => <article key={level.id}><span>{level.english}</span><h3>{level.name}</h3><strong>최소 {level.sessions}<small>회 권장</small></strong><p>{level.description}</p><dl><div><dt>권장 교육시간</dt><dd>{level.sessions * 2.5}시간</dd></div><div><dt>구독자 교육비</dt><dd>{(level.sessions * 80000).toLocaleString()}원~</dd></div><div><dt>비구독자 교육비</dt><dd>{(level.sessions * 120000).toLocaleString()}원~</dd></div></dl></article>)}</div><p className="learning-footnote">5개 일반 모듈의 회당 2.5시간 기준 예시 · 시험비 별도 · 프로페셔널은 해당 모듈의 인터미디엇 등 선수 요건을 상담 시 확인합니다.</p></section>
        <section className="learning-section"><div className="learning-section-title"><span className="learning-eyebrow">BEYOND THE BASICS</span><h2>커피를 더 넓게 이해하는 교육.</h2></div><div className="learning-extras">{learningCourses.filter(c => !c.advanced).map(course => <article key={course.id}><span>{course.id === "q-grader" ? "6명 모집 후 개강 협의" : "Foundation"}</span><h3>{course.name}</h3><p>{course.description}</p><p className="learning-footnote">{course.example}</p></article>)}</div></section>
        <section className="learning-section learning-package-section"><div className="learning-section-title"><span className="learning-eyebrow">YOUR LEARNING PATH</span><h2>목표가 있다면,<br />하나의 교육 경로로.</h2><p>디플로마 패키지는 구성 교육비 합계에서 약 20% 할인하여 안내합니다. 이미 보유한 자격과 필요한 과정에 따라 구성이 달라지며, 시험비는 할인 대상에서 제외됩니다.</p></div><div className="learning-packages">{learningPackages.filter(p => p.id !== "corporate").map(item => <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p></article>)}</div></section>
        <section className="learning-section learning-corporate">
          <div><span className="learning-eyebrow">FOR YOUR TEAM</span><h2>우리 팀에 맞는<br />커피 교육.</h2><p>현장에서 필요한 기술도, 함께 즐기는 커피 경험도.<br />목적·인원·환경에 맞는 프로그램을 함께 만듭니다.</p><a href="#consult" className="learning-primary" onClick={() => { setSelected(values => [...new Set([...values, "corporate"])]); setInterestCategory("packages"); }}>기업교육 문의 <span aria-hidden="true">→</span></a></div>
          <div className="learning-team-formats">
            <article><span>01</span><div><h3>실무를 더 탄탄하게</h3><p>추출·음료·품질 관리 등 팀에 필요한 역량을 중심으로.</p></div></article>
            <article><span>02</span><div><h3>함께 배우는 커피 경험</h3><p>커피를 이해하고 직접 즐겨보는 팀 교육으로.</p></div></article>
            <article><span>03</span><div><h3>목표에 맞춘 프로그램</h3><p>교육 대상과 일정, 원하는 깊이에 맞춰 유연하게.</p></div></article>
          </div>
          <p className="learning-team-history">동서식품·배민아카데미·현대백화점 등 다양한 기업·기관과 교육을 진행해 왔습니다.</p>
        </section>
      </>}
      <section className="learning-section learning-consult" id="consult"><div className="learning-section-title"><span className="learning-eyebrow">LET’S START</span><h2>어떤 커피를 배우고 싶으세요?</h2><p>관심 과정과 연락처를 남겨 주세요.<br />원하시는 방법으로 연락드릴게요.</p><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">카카오톡으로 문의하기 ↗</a><ol className="learning-steps"><li><strong>상담</strong><span>과정·일정·교육비를 확인해요.</span></li><li><strong>수강 등록</strong><span>결제 확인 후 수강 회차를 받아요.</span></li><li><strong>시간 선택</strong><span>빈 시간을 신청하면 강사가 확정해요.</span></li></ol><p className="learning-footnote">상담 신청만으로 결제되거나 예약이 확정되지 않습니다.</p></div>
        {result ? <div className="learning-success" ref={success} tabIndex={-1} role="status"><span>신청 완료</span><h3>만나 뵙게 되어 반갑습니다.</h3><p>{result}</p><p>카카오톡 상담을 선택하셨다면 채널에서 성함과 신청 사실을 알려 주세요. 담당자가 접수 내용을 확인합니다.</p><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">더컵에듀 카카오톡 열기 ↗</a><button type="button" onClick={() => setResult("")}>다른 상담 신청</button></div> : <form className="learning-form" onSubmit={submit}>
          <div className="learning-form-grid"><label>성함<input name="name" autoComplete="name" maxLength={40} required placeholder="성함을 입력해 주세요" /></label><label>연락처<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={15} required placeholder="010-0000-0000" /></label><label>연령대<select aria-label="연령대" name="ageRange" defaultValue="" required><option value="" disabled>선택해 주세요</option>{ageRanges.map(value => <option key={value}>{value}</option>)}</select></label><label>더컵에듀를 알게 된 경로<select aria-label="더컵에듀를 알게 된 경로" name="discovery" defaultValue="" required><option value="" disabled>선택해 주세요</option>{discoveryChannels.map(value => <option key={value}>{value}</option>)}</select></label></div>
          <fieldset>
            <legend>관심 과정 <small>여러 개 선택할 수 있어요</small></legend>
            <div className="learning-interest-switch" role="group" aria-label="관심 과정 분류">{[["modules", "SCA 모듈"], ["extras", "추가 과정"], ["packages", "통합·기업교육"]].map(([key, label]) => <button type="button" key={key} aria-pressed={interestCategory === key} onClick={() => setInterestCategory(key)}>{label}</button>)}</div>
            <div className="learning-interest-groups">
              {interestCategory !== "packages" ? learningCourses.filter(course => interestCategory === "modules" ? course.advanced : !course.advanced).map(course => <div key={course.id}><strong>{course.name}</strong><div>{courseOptions.filter(option => option.id.startsWith(`${course.id}:`)).map(option => <label key={option.id} className={selected.includes(option.id) ? "selected" : ""}><input type="checkbox" aria-label={option.name} checked={selected.includes(option.id)} onChange={() => choose(option.id)} />{option.name.split(" · ")[1] ?? "교육 상담"}</label>)}</div></div>)
              : <div><strong>통합 과정 · 기업교육</strong><div>{learningPackages.map(option => <label key={option.id} className={selected.includes(option.id) ? "selected" : ""}><input type="checkbox" aria-label={option.name} checked={selected.includes(option.id)} onChange={() => choose(option.id)} />{option.name}</label>)}</div></div>}
            </div>
            <label className="learning-undecided"><input type="checkbox" checked={selected.includes("consult")} onChange={() => choose("consult")} />아직 고민 중이에요 · 상담 후 결정</label>
            {selected.length > 0 && <div className="learning-selection"><p aria-live="polite">선택한 관심 과정 {selected.length}개</p><div>{selected.map(id => <button type="button" key={id} aria-label={`${interestOptions.find(option => option.id === id)?.name} 선택 해제`} onClick={() => choose(id)}>{interestOptions.find(option => option.id === id)?.name}<span aria-hidden="true">×</span></button>)}</div></div>}
          </fieldset>
          <label>선호 상담 방법<select name="contactChannel">{contactChannels.map(value => <option key={value}>{value}</option>)}</select></label><label>궁금한 점 <small>선택</small><textarea name="message" rows={3} maxLength={1000} placeholder="희망 요일·시간, 구독 여부, 보유 자격이나 교육 목표를 알려 주세요. 기업교육은 인원도 함께 적어 주세요." /></label>
          <div className="learning-consent"><p>상담 접수·연락 및 수강 관리 목적으로 성함, 연락처, 연령대, 유입 경로, 관심 과정과 상담 내용을 수집합니다. 관리자와 담당 강사만 확인하며, 상담 종료 후 1년간 보관한 뒤 삭제합니다. 수강·계약 기록은 관련 보존 의무에 따라 별도로 관리합니다. 동의를 거부할 수 있으나 온라인 접수는 어렵습니다. 만 14세 미만은 보호자와 카카오톡으로 문의해 주세요.</p><label><input type="checkbox" name="consent" required />만 14세 이상이며, 위 개인정보 수집·이용에 동의합니다.</label></div>
          {error && <p className="learning-error" role="alert">{error}</p>}<button className="learning-primary" disabled={busy}>{busy ? "신청 접수 중…" : "교육 상담 신청하기"}</button>
        </form>}
      </section>
    </>}
    <footer className="learning-footer"><span className="learning-brand">THE CUP EDU<small>COFFEE EDUCATION</small></span><div><Link href="/?view=visitor#portal-entry-content">시간표 미리보기</Link><Link href="/admin">직원 로그인</Link><a href="http://pf.kakao.com/_XRQdn/chat" target="_blank" rel="noreferrer">카카오톡 상담</a></div><p>교육 상담 → 수강 등록 → 시간 선택 → 강사 확정</p></footer>
  </div>;
}
