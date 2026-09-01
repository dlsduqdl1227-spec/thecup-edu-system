"use client";

import { useEffect, useState } from "react";

type PublicCourse = {
  id: string;
  name: string;
  category: string;
  currentApplicants: number;
  openingMinimum: number;
  capacity: number | null;
  remainingToOpen: number;
  progress: number;
  status: "WAITING" | "OPENABLE" | "FULL" | "CLOSED";
  statusLabel: string;
  durationHours: number;
  tuition: number;
  feeNote: string;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
};

type PublicCourseResponse = {
  month: string;
  updatedAt: string;
  totalApplicants: number;
  courses: PublicCourse[];
};

type ScheduleMarker = {
  course: PublicCourse;
  label: string;
};

const won = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function currentKoreanMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function readableMonth(month: string): string {
  const [year, value] = month.split("-");
  return `${year}년 ${Number(value)}월`;
}

function moveMonth(month: string, amount: number): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function updatedTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function daysInMonth(month: string): number {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

function firstWeekday(month: string): number {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
}

function shortDate(value: string): string {
  const [, month, day] = value.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function schedulePeriod(course: PublicCourse): string {
  const start = course.recruitmentStartDate;
  const end = course.recruitmentEndDate;
  if (start && end && start === end) return shortDate(start);
  if (start && end) return `${shortDate(start)} – ${shortDate(end)}`;
  if (start) return `${shortDate(start)}부터`;
  if (end) return `${shortDate(end)}까지`;
  return "일정 미정";
}

function scheduleMarkers(month: string, courses: PublicCourse[]): Map<number, ScheduleMarker[]> {
  const markers = new Map<number, ScheduleMarker[]>();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const add = (day: number, course: PublicCourse, label: string) => {
    markers.set(day, [...(markers.get(day) ?? []), { course, label }]);
  };

  for (const course of courses) {
    const start = course.recruitmentStartDate;
    const end = course.recruitmentEndDate;
    const startIsThisMonth = Boolean(start?.startsWith(`${month}-`));
    const endIsThisMonth = Boolean(end?.startsWith(`${month}-`));

    if (start && end && start === end && startIsThisMonth) {
      add(Number(start.slice(-2)), course, "모집일");
      continue;
    }
    if (startIsThisMonth && start) add(Number(start.slice(-2)), course, "모집 시작");
    if (endIsThisMonth && end) add(Number(end.slice(-2)), course, "접수 마감");

    const activeAtMonthStart = (!start || start < monthStart) && (!end || end >= monthStart);
    const overlapsMonth = (!start || start <= monthEnd) && (!end || end >= monthStart);
    if (!startIsThisMonth && activeAtMonthStart && overlapsMonth) {
      add(1, course, start || end ? "모집 중" : "일정 미정");
    }
  }

  return markers;
}

export function PublicCourseOpenings({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth || currentKoreanMonth);
  const [data, setData] = useState<PublicCourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetch(`/api/public/course-openings?month=${encodeURIComponent(month)}`, {
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("공개 모집 현황을 불러오지 못했습니다.");
          return response.json() as Promise<PublicCourseResponse>;
        })
        .then((next) => {
          if (!active) return;
          setData(next);
          setRefreshError(false);
        })
        .catch(() => {
          if (active) setRefreshError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [month]);

  function selectMonth(nextMonth: string) {
    setLoading(true);
    setMonth(nextMonth);
    window.history.replaceState(null, "", `?month=${nextMonth}`);
  }

  const courses = data?.courses ?? [];
  const markers = scheduleMarkers(month, courses);
  const dayCount = daysInMonth(month);
  const scheduledCourses = [...courses].sort((left, right) => {
    const leftDate = left.recruitmentStartDate ?? left.recruitmentEndDate ?? "9999-12-31";
    const rightDate = right.recruitmentStartDate ?? right.recruitmentEndDate ?? "9999-12-31";
    return leftDate.localeCompare(rightDate) || left.name.localeCompare(right.name, "ko-KR");
  });
  const calendarCells = [
    ...Array.from({ length: firstWeekday(month) }, (_, index) => ({ key: `blank-${index}`, day: null })),
    ...Array.from({ length: dayCount }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 })),
  ];
  const recruitingCount = courses.filter((course) => course.status !== "CLOSED" && course.status !== "FULL").length;
  const openableCount = courses.filter((course) => course.status === "OPENABLE").length;

  return (
    <main className="public-openings-page">
      <header className="public-openings-header">
        <div>
          <span className="public-eyebrow">THE CUP EDU · 실시간 모집 현황</span>
          <h1>{readableMonth(month)} 개강 과정</h1>
          <p>현재 수강을 희망하는 인원과 과정별 개강 진행 상황을 확인하세요.</p>
        </div>
        <nav className="public-month-nav" aria-label="진행 월 선택">
          <button type="button" onClick={() => selectMonth(moveMonth(month, -1))} aria-label="이전 달">←</button>
          <label>
            <span>진행 월</span>
            <input type="month" value={month} onChange={(event) => selectMonth(event.target.value)} />
          </label>
          <button type="button" onClick={() => selectMonth(moveMonth(month, 1))} aria-label="다음 달">→</button>
        </nav>
      </header>

      {loading && !data ? (
        <div className="public-openings-empty" aria-live="polite">개강 현황을 불러오는 중입니다.</div>
      ) : data ? (
        <>
          <section className="public-openings-summary" aria-label={`${readableMonth(month)} 모집 요약`}>
            <article className="public-summary-main">
              <span>현재 수강 총인원</span>
              <strong>{data.totalApplicants}<small>명</small></strong>
              <p>대기·확정 상태의 과정별 수강 희망 인원 합계</p>
            </article>
            <article>
              <span>모집 중 과정</span>
              <strong>{recruitingCount}<small>개</small></strong>
            </article>
            <article>
              <span>개강 가능 과정</span>
              <strong>{openableCount}<small>개</small></strong>
            </article>
          </section>

          {courses.length ? (
            <>
              <section className="public-schedule-shell" aria-labelledby="public-schedule-title">
                <div className="public-section-heading">
                  <div>
                    <span>MONTHLY SCHEDULE</span>
                    <h2 id="public-schedule-title">월간 모집 스케줄</h2>
                  </div>
                  <p>과정을 선택할 필요 없이 모집 시작일과 마감일을 한눈에 확인하세요.</p>
                </div>

                <div className="public-calendar" aria-label={`${readableMonth(month)} 달력`}>
                  <div className="public-calendar-weekdays" aria-hidden="true">
                    {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span key={weekday}>{weekday}</span>)}
                  </div>
                  <div className="public-calendar-days">
                    {calendarCells.map((cell) => cell.day === null ? (
                      <div className="public-calendar-day is-blank" key={cell.key} aria-hidden="true" />
                    ) : (
                      <div className="public-calendar-day" key={cell.key}>
                        <time dateTime={`${month}-${String(cell.day).padStart(2, "0")}`}>{cell.day}</time>
                        <div className="public-calendar-events">
                          {(markers.get(cell.day) ?? []).map(({ course, label }) => (
                            <article className={`public-calendar-event status-${course.status.toLowerCase()}`} key={`${course.id}-${label}`}>
                              <span>{label}</span>
                              <strong>{course.name}</strong>
                              <small>현재 {course.currentApplicants}명 · 기준 {course.openingMinimum}명</small>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="public-schedule-agenda" aria-label={`${readableMonth(month)} 날짜순 일정`}>
                  {scheduledCourses.map((course) => (
                    <article className={`public-agenda-row status-${course.status.toLowerCase()}`} key={course.id}>
                      <div className="public-agenda-date">
                        <span>모집 일정</span>
                        <strong>{schedulePeriod(course)}</strong>
                      </div>
                      <div className="public-agenda-course">
                        <span>{course.category.replaceAll("_", " ")}</span>
                        <h3>{course.name}</h3>
                        <p>현재 {course.currentApplicants}명 · 개강 기준 {course.openingMinimum}명</p>
                      </div>
                      <strong className="public-agenda-status">{course.statusLabel}</strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="public-course-details" aria-labelledby="public-course-details-title">
                <div className="public-section-heading">
                  <div>
                    <span>COURSE DETAILS</span>
                    <h2 id="public-course-details-title">과정별 모집 상세</h2>
                  </div>
                </div>
                <div className="public-course-grid" aria-label={`${readableMonth(month)} 공개 과정`}>
                  {courses.map((course) => (
                    <article className={`public-course-card status-${course.status.toLowerCase()}`} key={course.id}>
                      <div className="public-course-card-top">
                        <div>
                          <span>{course.category.replaceAll("_", " ")}</span>
                          <h3>{course.name}</h3>
                        </div>
                        <strong>{course.statusLabel}</strong>
                      </div>
                      <p className="public-course-period">모집 일정 · {schedulePeriod(course)}</p>
                      <div className="public-course-count">
                        <strong>{course.currentApplicants}<small>명</small></strong>
                        <span>현재 수강 희망 인원</span>
                      </div>
                      <div className="public-progress-copy">
                        <span>개강 기준 {course.openingMinimum}명</span>
                        <strong>{course.progress}%</strong>
                      </div>
                      <div
                        className="public-progress-track"
                        role="progressbar"
                        aria-label={`${course.name} 개강 진행률`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={course.progress}
                      >
                        <span style={{ width: `${course.progress}%` }} />
                      </div>
                      <dl className="public-course-meta">
                        {course.capacity !== null && <div><dt>전체 정원</dt><dd>{course.capacity}명</dd></div>}
                        {course.durationHours > 0 && <div><dt>교육시간</dt><dd>{course.durationHours}시간</dd></div>}
                        {course.tuition > 0 && <div><dt>수강료</dt><dd>{won.format(course.tuition)}</dd></div>}
                        {course.feeNote && <div><dt>안내</dt><dd>{course.feeNote}</dd></div>}
                      </dl>
                      <p className="public-course-message">
                        {course.status === "WAITING"
                          ? `개강까지 ${course.remainingToOpen}명이 더 필요합니다.`
                          : course.status === "OPENABLE"
                            ? "개강 기준 인원이 모였습니다."
                            : course.status === "FULL"
                              ? "정원이 모두 모집되었습니다."
                              : "현재 접수가 종료된 과정입니다."}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="public-openings-empty">
              <strong>{readableMonth(month)} 공개 과정이 없습니다.</strong>
              <span>새로운 과정이 등록되면 이곳에 바로 표시됩니다.</span>
            </div>
          )}
        </>
      ) : (
        <div className="public-openings-empty">
          <strong>모집 현황을 불러오지 못했습니다.</strong>
          <span>잠시 후 다시 확인해 주세요.</span>
        </div>
      )}

      <footer className="public-openings-footer" aria-live="polite">
        <span>{data ? `마지막 갱신 ${updatedTime(data.updatedAt)}` : "실시간 모집 정보"}</span>
        <span className="public-live-dot">30초마다 자동 갱신</span>
        {refreshError && <small>정보를 갱신하지 못했습니다. 잠시 후 다시 확인해 주세요.</small>}
      </footer>
    </main>
  );
}
