"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  formatBeanAmount,
  formatBeanQuantity,
  formatInventoryAmount,
  formatSignedInventoryQuantity,
  inventoryQuantityInKilograms,
  kilogramsToInventoryQuantity,
} from "../../lib/quantity";
import { compareInventoryItems, type InventorySort } from "../../lib/inventory-sort";
import { BookingAdmin } from "./BookingAdmin";

type Role = "admin" | "employee" | "instructor";
type TabKey = "dashboard" | "record" | "inventory" | "finance" | "roasting" | "booking" | "openings" | "staff";

type User = {
  id: number;
  name: string;
  role: Role;
  canFinance: boolean;
  canInventory: boolean;
  canRoasting: boolean;
};

type FinanceMonth = {
  year: number;
  month: number;
  baseRevenue: number;
  baseExpense: number;
  additionalIncome: number;
  additionalExpense: number;
  revenue: number;
  expense: number;
  profit: number;
  note: string;
  source: string;
};

type InventoryItem = {
  id: number;
  category: "green" | "roasted" | "gusto" | "milk" | "other";
  name: string;
  lot: string;
  process: string;
  expiryDate: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
  legacyKey: string | null;
  hasMovements: number;
  lowStock: number;
};

type Movement = {
  id: number | string;
  itemId: number;
  movementType: string;
  quantity: number;
  movementDate: string;
  note: string;
  className: string;
  costAmount: number;
  hasReceipt: number;
  receiptArchived: number;
  itemName: string;
  itemCategory: InventoryItem["category"];
  unit: string;
  legacyProcess?: string;
  legacyExpiryDate?: string | null;
  createdByName: string;
  createdAt: string;
};

type FinanceTransaction = {
  id: number;
  kind: "income" | "expense";
  category: string;
  amount: number;
  transactionDate: string;
  description: string;
  createdByName: string;
  inventoryMovementId: number | null;
};

type RoastPoint = {
  seconds: number;
  beanTemp: number;
  gasPressure: number;
};

type RoastProfile = {
  id: number;
  beanName: string;
  origin: string;
  process: string;
  batchWeight: number;
  chargeTemp: number;
  turningPointSeconds: number;
  firstCrackSeconds: number;
  dropTemp: number;
  totalSeconds: number;
  developmentSeconds: number;
  developmentRatio: number;
  gasNotes: string;
  notes: string;
  createdByName: string;
  points: RoastPoint[];
  ror: {
    turningToCrack: number;
    development: number;
  };
};

type RoastEditorState =
  | { mode: "create" }
  | { mode: "edit"; profile: RoastProfile }
  | { mode: "copy"; profile: RoastProfile }
  | null;

type DashboardData = {
  user: User;
  finance: FinanceMonth[];
  inventory: InventoryItem[];
  movements: Movement[];
  transactions: FinanceTransaction[];
  profiles: Array<Omit<RoastProfile, "points" | "ror">>;
  legacyInventoryCount: number;
};

type StaffMember = {
  id: number;
  name: string;
  phoneLast4: string;
  role: Role;
  canFinance: number;
  canInventory: number;
  canRoasting: number;
  active: number;
  createdAt: string;
};

type AuditLog = {
  id: number;
  action: string;
  entityType: string;
  detail: string;
  createdAt: string;
  actorName: string | null;
};

type ApplicantStatus = "WAITING" | "CONFIRMED" | "CANCELLED" | "REJECTED" | "REFUNDED";

type CourseApplicant = {
  id: number;
  courseId: number;
  applicantName: string;
  phoneLast4: string;
  status: ApplicantStatus;
  notes: string;
  bookingMemberId: number | null;
  memberLoginId: string | null;
  memberApprovalStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type CourseOpening = {
  id: number;
  publicId: string;
  name: string;
  category: string;
  courseMonth: string;
  openingMinimum: number;
  capacity: number | null;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  isPublic: number;
  statusOverride: "AUTO" | "CLOSED";
  displayOrder: number;
  durationHours: number;
  tuition: number;
  feeNote: string;
  currentApplicants: number;
  applicants: CourseApplicant[];
};

type ScheduleMonthSummary = {
  month: string;
  totalSlots: number;
  operationDays: number;
  openSlots: number;
  blockedSlots: number;
};

type ScheduleDaySummary = {
  date: string;
  totalSlots: number;
  openSlots: number;
  blockedSlots: number;
};

const today = currentKoreanDate();
const won = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const roleLabel: Record<Role, string> = {
  admin: "관리자",
  employee: "정규직원",
  instructor: "시간강사(남부)",
};

const categoryLabel: Record<InventoryItem["category"], string> = {
  green: "생두",
  roasted: "원두 · 자체 로스팅",
  gusto: "원두 · 구스토",
  milk: "우유",
  other: "기타",
};

const movementLabel: Record<string, string> = {
  in: "입고",
  out: "출고/사용",
  adjust: "실사 조정",
  roast_in: "원두 입고 · 로스팅",
  roast_out: "생두 출고 · 로스팅",
};

const financeCategoryOptions = {
  income: ["수강료", "스테이션 이용료", "교육 · 세미나", "원두 · 상품 판매", "시험 · 평가비"],
  expense: ["생두 · 원두", "우유 · 식자재", "교육 · 세미나 운영", "장비 · 소모품", "광고 · 홍보", "임차 · 관리비", "교통 · 출장", "수수료 · 세금"],
} as const;
const roastOriginOptions = ["", "에티오피아", "콜롬비아", "브라질", "과테말라", "케냐", "코스타리카", "인도네시아", "블렌드"] as const;
const coffeeProcessOptions = ["", "Washed", "Natural", "Honey", "Anaerobic", "Wet Hulled", "Blend"] as const;
const inventoryUnitOptions = ["kg", "g", "팩", "개", "병", "박스"] as const;

type PermissionField = "canFinance" | "canInventory" | "canRoasting";

const navItems: Array<{
  key: TabKey;
  label: string;
  short: string;
  permission?: PermissionField;
  adminOnly?: boolean;
}> = [
  { key: "dashboard", label: "매출 내역", short: "매출", permission: "canFinance" },
  { key: "record", label: "수업 사용 기록", short: "수업 기록" },
  { key: "inventory", label: "재고 관리", short: "재고", permission: "canInventory" },
  { key: "finance", label: "매출 및 지출 등록", short: "매출·지출", permission: "canFinance" },
  { key: "roasting", label: "로스팅 프로파일", short: "로스팅", permission: "canRoasting" },
  { key: "booking", label: "운영 · 개강 관리", short: "운영", adminOnly: true },
  { key: "staff", label: "직원 · 권한", short: "직원", adminOnly: true },
];

const permissionOptions: Array<{
  field: PermissionField;
  label: string;
  description: string;
}> = [
  { field: "canFinance", label: "매출", description: "매출 내역과 매출·지출 등록" },
  { field: "canInventory", label: "재고", description: "생두·원두 재고와 입출고" },
  { field: "canRoasting", label: "로스팅", description: "프로파일 열람" },
];

function allowedNavigation(user: User) {
  return navItems.filter((item) => {
    if (item.adminOnly) return user.role === "admin";
    if (!item.permission) return true;
    return user.role === "admin" || user[item.permission];
  });
}

function initialTab(user: User): TabKey {
  return allowedNavigation(user)[0]?.key ?? "record";
}

export function EduSystemApp() {
  const [authState, setAuthState] = useState<{
    loading: boolean;
    bootstrapRequired: boolean;
    publicPageVisible: boolean;
    user: User | null;
  }>({ loading: true, bootstrapRequired: false, publicPageVisible: false, user: null });
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<TabKey[]>([]);

  const loadAuth = useCallback(async () => {
    try {
      const status = await requestJson<{
        bootstrapRequired: boolean;
        publicPageVisible: boolean;
        user: User | null;
      }>(
        "/api/auth/status",
      );
      setAuthState({ loading: false, ...status });
      if (status.user) {
        setNavigationHistory([]);
        setActiveTab(initialTab(status.user));
      }
    } catch (error) {
      setAuthState({ loading: false, bootstrapRequired: false, publicPageVisible: false, user: null });
      setToast({ kind: "error", message: errorMessage(error) });
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!authState.user) return;
    try {
      const nextData = await requestJson<DashboardData>("/api/dashboard");
      setData(nextData);
    } catch (error) {
      setToast({ kind: "error", message: errorMessage(error) });
    }
  }, [authState.user]);

  useEffect(() => {
    // Initial remote session lookup; the state change happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    // Refresh authenticated server data when the signed-in user changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleAuth(endpoint: string, formData: FormData) {
    setBusy(true);
    try {
      const body = Object.fromEntries(formData.entries());
      const result = await requestJson<{ user: User }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setAuthState((current) => ({
        loading: false,
        bootstrapRequired: false,
        publicPageVisible: current.publicPageVisible,
        user: result.user,
      }));
      setNavigationHistory([]);
      setActiveTab(initialTab(result.user));
      setToast({ kind: "ok", message: `${result.user.name}님, 환영합니다.` });
    } catch (error) {
      setToast({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      setNavigationHistory([]);
      setData(null);
      await loadAuth();
    } catch (error) {
      setToast({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (authState.loading) {
    return (
      <main className="loading-screen" aria-live="polite">
        <BrandMark />
        <div className="loading-line" />
        <p>운영 데이터를 안전하게 불러오는 중입니다.</p>
      </main>
    );
  }

  if (!authState.user) {
    return (
      <>
        <AuthScreen
          bootstrapRequired={authState.bootstrapRequired}
          publicPageVisible={authState.publicPageVisible}
          busy={busy}
          onSubmit={handleAuth}
        />
        {toast && <Toast toast={toast} />}
      </>
    );
  }

  const user = authState.user;
  const allowedNav = allowedNavigation(user);
  const homeTab = allowedNav.find((item) => item.key === "dashboard")?.key ?? allowedNav[0]?.key ?? "record";

  function navigateTo(nextTab: TabKey) {
    if (nextTab === activeTab) return;
    setNavigationHistory((current) => [...current, activeTab]);
    setActiveTab(nextTab);
  }

  function goBack() {
    const previousTab = navigationHistory.at(-1);
    if (!previousTab) return;
    setNavigationHistory((current) => current.slice(0, -1));
    setActiveTab(previousTab);
  }

  function goHome() {
    navigateTo(homeTab);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandMark />
        <div className="sidebar-rule" />
        <nav className="sidebar-actions" aria-label="화면 이동">
          <button type="button" onClick={goBack} disabled={navigationHistory.length === 0}>← 이전</button>
          <button type="button" onClick={goHome} disabled={activeTab === homeTab}>관리 홈</button>
          <Link href="/?home=1">스테이션 홈</Link>
        </nav>
        <nav className="side-nav" aria-label="주요 메뉴">
          {allowedNav.map((item, index) => (
            <button
              type="button"
              key={item.key}
              className={activeTab === item.key ? "nav-item active" : "nav-item"}
              onClick={() => navigateTo(item.key)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className={`role-dot ${user.role}`} />
          <div>
            <strong>{user.name}</strong>
            <small>{roleLabel[user.role]}</small>
          </div>
          <button type="button" onClick={logout} disabled={busy}>
            로그아웃
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="mobile-header">
          <BrandMark compact />
          <div className="mobile-user">
            <strong>{user.name}</strong>
            <span>{roleLabel[user.role]}</span>
          </div>
          <nav className="mobile-history-nav" aria-label="화면 이동">
            <button type="button" onClick={goBack} disabled={navigationHistory.length === 0}>← 이전</button>
            <button type="button" onClick={goHome} disabled={activeTab === homeTab}>관리 홈</button>
            <Link href="/?home=1">스테이션 홈</Link>
          </nav>
        </header>

        {!data ? (
          <section className="page-section loading-panel" aria-live="polite">
            <div className="loading-line" />
            <p>대시보드를 준비하고 있습니다.</p>
          </section>
        ) : (
          <>
            {activeTab === "dashboard" && <DashboardView data={data} />}
            {activeTab === "record" && (
              <RecordView
                data={data}
                onUpdated={refreshData}
                notify={setToast}
              />
            )}
            {activeTab === "inventory" && (
              <InventoryView
                data={data}
                onUpdated={refreshData}
                notify={setToast}
              />
            )}
            {activeTab === "finance" && (
              <FinanceView
                data={data}
                onUpdated={refreshData}
                notify={setToast}
              />
            )}
            {activeTab === "roasting" && (
              <RoastingView user={user} notify={setToast} />
            )}
            {activeTab === "booking" && (
              <OperationsHub notify={setToast} />
            )}
            {activeTab === "staff" && (
              <StaffView currentUserId={user.id} notify={setToast} />
            )}
          </>
        )}
      </main>

      <nav className="bottom-nav" aria-label="모바일 메뉴">
        {allowedNav.map((item) => (
          <button
            type="button"
            key={item.key}
            className={activeTab === item.key ? "active" : ""}
            onClick={() => navigateTo(item.key)}
          >
            {item.short}
          </button>
        ))}
      </nav>
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function OperationsHub({ notify }: { notify: (toast: { kind: "ok" | "error"; message: string }) => void }) {
  const [month, setMonth] = useState("");
  const [scheduleMonths, setScheduleMonths] = useState<string[]>([]);
  const selectedMonthLabel = month ? `${Number(month.slice(5))}월` : "일정 확인 중";

  function moveToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="operations-hub operations-hub-unified">
      <section className="page-section operations-unified-header">
        <PageHeader
          eyebrow="통합 운영"
          title="운영 · 개강 관리"
          description="하나의 월을 기준으로 스테이션 일정, 예약과 과정 모집을 한 화면에서 관리합니다."
        />
        <div className="operations-unified-toolbar panel">
          <label>
            <span>기준 월</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <nav className="operations-unified-months" aria-label="등록된 운영 월">
            {scheduleMonths.length ? scheduleMonths.map((value) => (
              <button type="button" key={value} className={month === value ? "active" : ""} onClick={() => setMonth(value)}>
                <b>{Number(value.slice(5))}월</b>
                <small>일정 등록</small>
              </button>
            )) : <span>등록된 일정을 확인하고 있습니다.</span>}
          </nav>
          <div className="operations-jump-actions" aria-label="통합 관리 바로가기">
            <button type="button" onClick={() => moveToSection("operations-schedule")}>스테이션 일정</button>
            <button type="button" onClick={() => moveToSection("operations-openings")}>개강 모집</button>
          </div>
        </div>
        <div className="operations-unified-status">
          <span>현재 기준</span>
          <strong>{month || selectedMonthLabel}</strong>
          <p>선택한 {selectedMonthLabel}을 기준으로 아래 두 영역이 함께 자동 동기화됩니다.</p>
        </div>
      </section>
      <div id="operations-schedule" className="operations-unified-section">
        <BookingAdmin
          notify={notify}
          month={month}
          onMonthChange={setMonth}
          onScheduleMonthsChange={setScheduleMonths}
          embedded
          initialTab="schedule"
        />
      </div>
      <div id="operations-openings" className="operations-unified-section">
        <CourseOpeningsAdminView notify={notify} month={month} onMonthChange={setMonth} embedded />
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "brand-lockup compact" : "brand-lockup"}
      role="img"
      aria-label="더컵에듀와 월간커피 공동 브랜드"
    >
      <span className="brand-logo-crop brand-logo-thecup" aria-hidden="true">
        {/* vinext의 이미지 래퍼 대신 정적 브랜드 자산을 그대로 전달합니다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/thecup-edu.jpg"
          alt=""
          width={720}
          height={720}
        />
      </span>
      <span className="brand-logo-divider" aria-hidden="true" />
      <span className="brand-logo-crop brand-logo-coffee" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/monthly-coffee.png"
          alt=""
          width={284}
          height={284}
        />
      </span>
    </div>
  );
}

function AuthScreen({
  bootstrapRequired,
  publicPageVisible,
  busy,
  onSubmit,
}: {
  bootstrapRequired: boolean;
  publicPageVisible: boolean;
  busy: boolean;
  onSubmit: (endpoint: string, data: FormData) => Promise<void>;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <BrandMark />
        <div className="auth-headline">
          <span>직원 전용</span>
          <h1>더컵에듀<br />운영 시스템</h1>
          <p>
            이름과 등록된 휴대폰 번호로 로그인하면 담당 업무에 필요한 메뉴만 표시됩니다.
          </p>
        </div>
        <p className="auth-help">계정 등록과 메뉴 권한은 관리자에게 요청하세요.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Link className="station-home-link" href="/?home=1">← 스테이션 예약 홈</Link>
          <span className="eyebrow">{bootstrapRequired ? "초기 설정" : "직원 로그인"}</span>
          <h2>{bootstrapRequired ? "초기 관리자 등록" : "직원 로그인"}</h2>
          <p>
            {bootstrapRequired
              ? "배포 시 전달받은 초기 관리자 코드와 본인 정보를 입력해 주세요."
              : "관리자가 등록한 이름과 휴대폰 번호로 로그인하세요."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(
                bootstrapRequired ? "/api/auth/bootstrap" : "/api/auth/login",
                new FormData(event.currentTarget),
              );
            }}
          >
            <Field label="이름">
              <input name="name" autoComplete="name" placeholder="홍길동" required maxLength={40} />
            </Field>
            <Field label="휴대폰 번호">
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                required
              />
            </Field>
            {bootstrapRequired && (
              <Field label="초기 관리자 코드">
                <input
                  name="code"
                  type="password"
                  autoComplete="one-time-code"
                  placeholder="배포 시 전달된 코드"
                  required
                />
              </Field>
            )}
            <button className="primary-button auth-submit" disabled={busy}>
              {busy ? "확인 중…" : bootstrapRequired ? "관리자 등록하고 시작" : "로그인"}
            </button>
          </form>
          {publicPageVisible && (
            <a className="guest-opening-link" href="/embed/course-openings?month=current">
              <span>게스트 조회</span>
              로그인 없이 실시간 개강 현황 보기 →
            </a>
          )}
          <div className="security-note">
            <span>보안</span>
            휴대폰 번호 원문은 저장하지 않으며, 등록된 직원만 접근할 수 있습니다.
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardView({ data }: { data: DashboardData }) {
  const availableYears = [...new Set(data.finance.map((row) => row.year))].sort((a, b) => b - a);
  const latestYear = availableYears[0] ?? new Date().getFullYear();
  const defaultMonthForYear = (selectedYear: number) => {
    const recordedMonths = data.finance
      .filter((row) => row.year === selectedYear && (row.revenue !== 0 || row.expense !== 0))
      .map((row) => row.month);
    return Math.max(1, ...recordedMonths);
  };
  const [year, setYear] = useState(latestYear);
  const [month, setMonth] = useState(defaultMonthForYear(latestYear));
  const rows = data.finance.filter((row) => row.year === year);
  const includedRows = year === latestYear
    ? rows.filter((row) => row.revenue !== 0 || row.expense !== 0)
    : rows;
  const totalRevenue = sum(includedRows.map((row) => row.revenue));
  const totalProfit = sum(includedRows.map((row) => row.profit));
  const margin = totalRevenue ? (totalProfit / totalRevenue) * 100 : 0;
  const lastMonth = Math.max(0, ...includedRows.map((row) => row.month));
  const priorRows = data.finance.filter((row) => row.year === year - 1 && row.month <= lastMonth);
  const priorRevenue = sum(priorRows.map((row) => row.revenue));
  const yoy = priorRevenue ? ((totalRevenue - priorRevenue) / priorRevenue) * 100 : null;
  const best = includedRows.reduce<FinanceMonth | null>(
    (current, row) => (!current || row.revenue > current.revenue ? row : current),
    null,
  );
  const lowStock = data.inventory.filter((item) => item.lowStock);
  const selectedMonth = rows.find((row) => row.month === month) ?? {
    year,
    month,
    baseRevenue: 0,
    baseExpense: 0,
    additionalIncome: 0,
    additionalExpense: 0,
    revenue: 0,
    expense: 0,
    profit: 0,
    note: "",
    source: "",
  };
  const selectedMonthMargin = selectedMonth.revenue
    ? (selectedMonth.profit / selectedMonth.revenue) * 100
    : 0;
  const selectedMonthTransactions = data.transactions.filter((entry) => {
    const [entryYear, entryMonth] = entry.transactionDate.split("-").map(Number);
    return entryYear === year && entryMonth === month;
  });
  const selectedMonthHasCsvExpense = selectedMonth.baseExpense !== 0;
  const selectedMonthDetailCount =
    selectedMonthTransactions.length + (selectedMonthHasCsvExpense ? 1 : 0);
  const selectedMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  const selectedMonthHasData = selectedMonth.revenue !== 0 || selectedMonth.expense !== 0;

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="매출 현황"
        title="매출 내역"
        description="2022년부터 현재까지의 월별 매출, 비용과 순익을 확인합니다."
        action={
          <div className="page-action-group">
            <select
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                setYear(nextYear);
                setMonth(defaultMonthForYear(nextYear));
              }}
              aria-label="분석 연도"
            >
              {availableYears.map((value) => <option key={value} value={value}>{value}년</option>)}
            </select>
            <a className="export-button" href="/api/exports/finance">전체 매출 Excel</a>
          </div>
        }
      />

      <div className="kpi-grid">
        <KpiCard label={`${year} 누적 매출`} value={won.format(totalRevenue)} meta={`${includedRows.length}개월 집계`} tone="dark" />
        <KpiCard label="누적 순익" value={won.format(totalProfit)} meta={`순익률 ${margin.toFixed(1)}%`} />
        <KpiCard
          label="전년 동기 대비"
          value={yoy === null ? "비교 없음" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`}
          meta={lastMonth ? `${year - 1}년 1–${lastMonth}월 대비` : "집계 전"}
          tone={yoy !== null && yoy < 0 ? "alert" : "green"}
        />
        <KpiCard label="최고 매출 월" value={best ? `${best.month}월` : "—"} meta={best ? won.format(best.revenue) : "데이터 없음"} />
      </div>

      <article className="panel monthly-detail-panel">
        <div className="monthly-detail-heading">
          <div>
            <span className="eyebrow">월별 상세</span>
            <h3>{year}년 {month}월 매출 내역</h3>
          </div>
          <strong className={selectedMonthHasData ? "month-status complete" : "month-status"}>
            {selectedMonthHasData ? "집계 완료" : "집계 전"}
          </strong>
        </div>

        <div className="month-tabs" role="tablist" aria-label={`${year}년 월 선택`}>
          {rows.map((row) => {
            const active = row.month === month;
            const hasData = row.revenue !== 0 || row.expense !== 0;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="monthly-detail-content"
                className={`${active ? "active" : ""}${hasData ? "" : " empty"}`}
                key={row.month}
                onClick={() => setMonth(row.month)}
              >
                {row.month}월
              </button>
            );
          })}
        </div>

        <div id="monthly-detail-content" className="monthly-detail-content" role="tabpanel">
          <div className="monthly-summary-grid">
            <div><span>매출</span><strong>{won.format(selectedMonth.revenue)}</strong></div>
            <div><span>지출</span><strong>{won.format(selectedMonth.expense)}</strong></div>
            <div><span>순익</span><strong>{won.format(selectedMonth.profit)}</strong></div>
            <div><span>순익률</span><strong>{selectedMonth.revenue ? `${selectedMonthMargin.toFixed(1)}%` : "—"}</strong></div>
          </div>

          <div className="monthly-breakdown-grid">
            <section className="monthly-breakdown" aria-labelledby="monthly-breakdown-title">
              <div className="monthly-subheading">
                <h4 id="monthly-breakdown-title">월 집계 구성</h4>
                <span>CSV 기준 + 추가 등록</span>
              </div>
              <dl>
                <div><dt>CSV 기준 매출</dt><dd>{won.format(selectedMonth.baseRevenue)}</dd></div>
                <div><dt>추가 등록 매출</dt><dd>{won.format(selectedMonth.additionalIncome)}</dd></div>
                <div><dt>CSV 기준 지출</dt><dd>{won.format(selectedMonth.baseExpense)}</dd></div>
                <div><dt>추가 등록 지출</dt><dd>{won.format(selectedMonth.additionalExpense)}</dd></div>
              </dl>
              {(selectedMonth.note || selectedMonth.source) && (
                <div className="monthly-source-note">
                  {selectedMonth.note && <strong>{selectedMonth.note}</strong>}
                  {selectedMonth.source && <span>{selectedMonth.source}</span>}
                </div>
              )}
            </section>

            <section className="monthly-transactions" aria-labelledby="monthly-transactions-title">
              <div className="monthly-subheading">
                <h4 id="monthly-transactions-title">월별 상세 내역</h4>
                <span>
                  {selectedMonthHasCsvExpense ? "CSV 지출 1건 · " : ""}
                  추가 등록 {selectedMonthTransactions.length}건
                </span>
              </div>
              {selectedMonthDetailCount ? (
                <div className="monthly-transaction-list">
                  {selectedMonthHasCsvExpense && (
                    <article className="csv-expense-entry">
                      <time dateTime={selectedMonthKey}>{month}월 합계</time>
                      <div>
                        <strong>CSV 월 지출 합계</strong>
                        <span title={selectedMonth.source}>
                          {selectedMonth.source || `${year}년 ${month}월 원본 CSV 기준`}
                        </span>
                      </div>
                      <em className="expense">−{won.format(selectedMonth.baseExpense)}</em>
                    </article>
                  )}
                  {selectedMonthTransactions.map((entry) => (
                    <article key={entry.id}>
                      <time>{entry.transactionDate}</time>
                      <div>
                        <strong>{entry.category}</strong>
                        <span>{entry.description || `${entry.createdByName} 등록`}</span>
                      </div>
                      <em className={entry.kind}>
                        {entry.kind === "income" ? "+" : "−"}{won.format(entry.amount)}
                      </em>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="monthly-empty">
                  이 달에는 CSV 기준 지출과 추가 등록 내역이 없습니다.
                </p>
              )}
            </section>
          </div>
        </div>
      </article>

      <div className="dashboard-grid">
        <article className="panel revenue-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">월별 현황</span>
              <h3>월별 매출과 순익</h3>
            </div>
            <div className="chart-legend"><span className="revenue-dot" />매출 <span className="profit-dot" />순익</div>
          </div>
          <FinanceBarChart rows={rows} />
          <div className="chart-footnote">
            {year === 2026 ? "2026년 7월은 7월 24일까지 입력된 CSV 기준입니다." : "원본 CSV의 월별 합계와 순익을 기준으로 집계했습니다."}
          </div>
        </article>

        <article className="panel signal-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">운영 확인</span>
              <h3>지금 확인할 것</h3>
            </div>
          </div>
          <div className="signal-list">
            <div className={lowStock.length ? "signal warn" : "signal good"}>
              <span>재고</span>
              <strong>{lowStock.length ? `${lowStock.length}개 품목 확인 필요` : "적정 수준"}</strong>
              <p>{lowStock.length ? lowStock.map((item) => item.name).join(", ") : "최소 재고선 아래인 품목이 없습니다."}</p>
            </div>
            <div className="signal">
              <span>월평균 매출</span>
              <strong>{includedRows.length ? won.format(totalRevenue / includedRows.length) : "—"}</strong>
              <p>{year === latestYear ? "실제 입력이 있는 월만 평균에 포함했습니다." : "해당 연도의 12개월을 기준으로 계산했습니다."}</p>
            </div>
            <div className="signal">
              <span>최근 영수증 반영</span>
              <strong>{data.movements.find((movement) => movement.hasReceipt)?.movementDate ?? "등록 전"}</strong>
              <p>우유 구매 비용은 등록 즉시 월 순익에서 차감됩니다.</p>
            </div>
          </div>
        </article>
      </div>

      <div className="quarter-grid">
        {[1, 2, 3, 4].map((quarter) => {
          const quarterRows = rows.filter((row) => Math.ceil(row.month / 3) === quarter);
          const activeQuarter = year === latestYear
            ? quarterRows.filter((row) => row.revenue || row.expense)
            : quarterRows;
          const average = activeQuarter.length ? sum(activeQuarter.map((row) => row.revenue)) / activeQuarter.length : 0;
          return (
            <article className="quarter-card" key={quarter}>
              <span>{quarter}분기</span>
              <strong>{average ? won.format(average) : "집계 전"}</strong>
              <small>{(quarter - 1) * 3 + 1}–{quarter * 3}월 월평균 · {activeQuarter.length}/3개월</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FinanceBarChart({ rows }: { rows: FinanceMonth[] }) {
  const max = Math.max(1, ...rows.map((row) => row.revenue));
  return (
    <div className="bar-chart" role="img" aria-label="월별 매출과 순익 막대 그래프">
      {rows.map((row) => {
        const revenueHeight = (row.revenue / max) * 100;
        const profitHeight = (Math.max(0, row.profit) / max) * 100;
        return (
          <div className="bar-column" key={row.month}>
            <div className="bar-stage" title={`${row.month}월 매출 ${won.format(row.revenue)}, 순익 ${won.format(row.profit)}`}>
              <span className="bar revenue" style={{ height: `${revenueHeight}%` }} />
              <span className="bar profit" style={{ height: `${profitHeight}%` }} />
            </div>
            <span className="bar-label">{row.month}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecordView({
  data,
  onUpdated,
  notify,
}: {
  data: DashboardData;
  onUpdated: () => Promise<void>;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [busy, setBusy] = useState<"milk" | "class" | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{
    url: string;
    name: string;
    size: number;
  } | null>(null);
  const beanItems = data.inventory.filter((item) => ["roasted", "gusto"].includes(item.category));
  const instructor = data.user.role === "instructor";
  const administrator = data.user.role === "admin";

  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview.url);
    };
  }, [receiptPreview]);

  function selectReceipt(file: File | undefined, input: HTMLInputElement) {
    if (!file) {
      setReceiptPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      input.value = "";
      setReceiptPreview(null);
      notify({ kind: "error", message: "영수증 이미지 파일을 선택해 주세요." });
      return;
    }
    if (file.size > 20_000_000) {
      input.value = "";
      setReceiptPreview(null);
      notify({ kind: "error", message: "원본 사진은 20MB 이하만 선택할 수 있습니다." });
      return;
    }
    setReceiptPreview({
      url: URL.createObjectURL(file),
      name: file.name || "촬영한 영수증",
      size: file.size,
    });
  }

  async function submitMilk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("milk");
    try {
      const form = new FormData(formElement);
      const source = form.get("receipt");
      if (!(source instanceof File) || !source.size) throw new Error("영수증 사진을 선택해 주세요.");
      const optimized = await optimizeReceipt(source);
      form.set("receipt", optimized, optimized.name);
      const result = await requestJson<{ id: number; archivedReceipts: number; receiptBytes: number }>(
        "/api/inventory/milk-purchase",
        { method: "POST", body: form },
      );
      formElement.reset();
      setReceiptPreview(null);
      await onUpdated();
      notify({
        kind: "ok",
        message: result.archivedReceipts
          ? `우유 구매를 반영하고 오래된 영수증 ${result.archivedReceipts}건을 자동 정리했습니다.`
          : `우유 입고·비용과 영수증 ${formatFileSize(result.receiptBytes)}을 함께 저장했습니다.`,
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function submitClassUse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy("class");
    try {
      const form = new FormData(formElement);
      await requestJson("/api/inventory/class-use", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formElement.reset();
      const dateInput = formElement.elements.namedItem("movementDate") as HTMLInputElement | null;
      if (dateInput) dateInput.value = today;
      await onUpdated();
      notify({ kind: "ok", message: "수업 사용량이 재고에서 차감됐습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="page-section">
      <PageHeader
        eyebrow={instructor ? "내 수업 기록" : "수업 사용 기록"}
        title={instructor ? `${data.user.name}님의 수업 기록` : "수업별 사용량 기록"}
        description={instructor
          ? "우유 입고와 수업 사용량을 기록합니다. 아래에는 내가 등록한 기록만 표시됩니다."
          : administrator
            ? "전체 직원의 우유 입고·수업 사용 기록과 등록자를 확인하고 관리합니다."
            : "우유 구매는 영수증과 비용까지, 수업 사용량은 원두와 우유 재고까지 한 번에 반영됩니다."}
      />

      <div className="stock-strip">
        {data.inventory
          .filter((item) => ["milk", "roasted", "gusto"].includes(item.category))
          .map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
              {(() => {
                const amount = inventoryItemAmount(item);
                return <strong>{amount.value}<small>{amount.unit}</small></strong>;
              })()}
              {item.lowStock ? <em>보충 필요</em> : <em className="ok">사용 가능</em>}
            </div>
          ))}
      </div>

      <div className="form-grid">
        <article className="panel form-panel">
          <div className="form-title">
            <span className="step-number">01</span>
            <div><h3>우유 구매 등록</h3><p>영수증은 약 350KB 이하로 자동 최적화됩니다.</p></div>
          </div>
          <form onSubmit={submitMilk}>
            <div className="two-columns">
              <Field label="구매일">
                <input name="movementDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="수량 (팩)">
                <input name="quantity" type="number" min="0.1" step="0.1" placeholder="16" required />
              </Field>
            </div>
            <Field label="결제 금액">
              <div className="input-suffix"><input name="amount" type="number" min="1" step="1" placeholder="36800" required /><span>원</span></div>
            </Field>
            <Field label="영수증 사진">
              <label className="file-drop">
                <input
                  name="receipt"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  required
                  onChange={(event) => selectReceipt(event.target.files?.[0], event.target)}
                />
                <span>사진 촬영 또는 파일 선택</span>
                <small>JPG · PNG · WebP / 자동 압축 저장</small>
              </label>
              {receiptPreview && (
                <div className="receipt-preview" aria-live="polite">
                  {/* Local object URLs are preview-only and must not pass through the image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptPreview.url} alt="선택한 영수증 미리보기" />
                  <div>
                    <strong>사진 준비 완료</strong>
                    <span>{receiptPreview.name}</span>
                    <small>원본 {formatFileSize(receiptPreview.size)} · 저장할 때 자동 최적화</small>
                  </div>
                </div>
              )}
            </Field>
            <Field label="메모 (선택)">
              <input name="note" placeholder="구매처 또는 수업명" maxLength={300} />
            </Field>
            <button className="primary-button" disabled={busy === "milk"}>
              {busy === "milk" ? "이미지 최적화 중…" : "구매 내역 반영"}
            </button>
          </form>
        </article>

        <article className="panel form-panel">
          <div className="form-title">
            <span className="step-number">02</span>
            <div><h3>수업 사용량 기록</h3><p>입력한 수량은 현재 재고에서 바로 차감됩니다.</p></div>
          </div>
          <form onSubmit={submitClassUse}>
            <Field label="수업명">
              <input name="className" placeholder="남부센터 바리스타 오전반" required maxLength={100} />
            </Field>
            <div className="two-columns">
              <Field label="수업일">
                <input name="movementDate" type="date" defaultValue={today} required />
              </Field>
              <Field label="우유 사용 (팩)">
                <input name="milkQuantity" type="number" min="0" step="0.1" defaultValue="0" />
              </Field>
            </div>
            <div className="two-columns">
              <Field label="사용 원두">
                <select name="beanItemId" defaultValue={beanItems[0]?.id ?? ""}>
                  {beanItems.map((item) => <option key={item.id} value={item.id}>{inventoryOptionLabel(item)}</option>)}
                </select>
              </Field>
              <Field label="원두 사용 (kg)">
                <input name="beanQuantityKg" type="number" min="0" step="0.01" defaultValue="0" placeholder="0.5" />
              </Field>
            </div>
            <p className="quantity-helper">예: 500g은 <strong>0.5kg</strong>, 1kg은 <strong>1</strong>로 입력하세요.</p>
            <Field label="메모 (선택)">
              <input name="note" placeholder="인원, 특이사항" maxLength={300} />
            </Field>
            <button className="primary-button" disabled={busy === "class"}>
              {busy === "class" ? "기록 중…" : "수업 사용량 반영"}
            </button>
          </form>
        </article>
      </div>

      <article className="panel table-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">기록 확인</span><h3>{instructor ? "내 우유 입고·수업 기록" : administrator ? "전체 우유 입고·수업 기록" : "최근 수업·구매 기록"}</h3></div>
        </div>
        <MovementTable
          movements={data.movements.filter((movement) => movement.className || movement.costAmount)}
          isAdmin={data.user.role === "admin"}
          onUpdated={onUpdated}
          notify={notify}
        />
      </article>
    </section>
  );
}

function InventoryView({
  data,
  onUpdated,
  notify,
}: {
  data: DashboardData;
  onUpdated: () => Promise<void>;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const greenItems = data.inventory.filter((item) => item.category === "green");
  const roastedItems = data.inventory.filter((item) => item.category === "roasted");
  const beanItems = data.inventory.filter((item) => item.category === "roasted" || item.category === "gusto");
  const [busy, setBusy] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemBusy, setItemBusy] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<"overview" | "movement" | "history">("movement");
  const [entryMode, setEntryMode] = useState<"existing" | "new">("existing");
  const [newItemCategory, setNewItemCategory] = useState<InventoryItem["category"]>("green");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "green" | "beans" | "support">("all");
  const [inventorySort, setInventorySort] = useState<InventorySort>("expiry");
  const [movementItemId, setMovementItemId] = useState(data.inventory[0]?.id ?? 0);
  const [movementType, setMovementType] = useState<"in" | "out" | "adjust">("in");
  const [roastedOutputItemId, setRoastedOutputItemId] = useState(roastedItems[0]?.id ?? 0);
  const inventoryEntryRef = useRef<HTMLElement>(null);
  const movementItem = data.inventory.find((item) => item.id === movementItemId) ?? data.inventory[0];
  const roastedOutputItem = roastedItems.find((item) => item.id === roastedOutputItemId) ?? roastedItems[0];
  const isGreenRoast = movementItem?.category === "green" && movementType === "out";
  const visibleItems = data.inventory
    .filter((item) => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "beans") return item.category === "roasted" || item.category === "gusto";
      if (categoryFilter === "support") return item.category === "milk" || item.category === "other";
      return item.category === "green";
    })
    .sort((left, right) => compareInventoryItems(left, right, inventorySort));
  const inventorySections = [
    {
      key: "green",
      eyebrow: "로스팅 전",
      title: "생두 재고",
      description: "로스팅 전 보관 중인 생두입니다. 출고는 로스팅 사용으로 기록됩니다.",
      items: visibleItems.filter((item) => item.category === "green"),
    },
    {
      key: "beans",
      eyebrow: "수업 사용",
      title: "원두 재고",
      description: "수업에 바로 사용하는 자체 로스팅 원두와 구스토 원두입니다.",
      items: visibleItems.filter((item) => item.category === "roasted" || item.category === "gusto"),
    },
    {
      key: "support",
      eyebrow: "부자재",
      title: "우유 · 기타 재고",
      description: "수업에 사용하는 우유와 소모품입니다.",
      items: visibleItems.filter((item) => item.category === "milk" || item.category === "other"),
    },
  ].filter((section) => section.items.length > 0);
  const inventoryTabs = [
    { key: "movement", label: "빠른 입력" },
    { key: "overview", label: "재고 현황" },
    { key: "history", label: "입출고 기록" },
  ] as const;
  const categoryFilters = [
    { key: "all", label: "전체" },
    { key: "green", label: "생두" },
    { key: "beans", label: "원두" },
    { key: "support", label: "우유 · 기타" },
  ] as const;

  function openInventoryEntry(mode: "existing" | "new", type: "in" | "out" | "adjust" = "in") {
    setInventoryTab("movement");
    setEntryMode(mode);
    setMovementType(type);
    window.requestAnimationFrame(() => {
      inventoryEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const selector = mode === "new" ? 'input[name="name"]' : 'select[name="itemId"]';
      inventoryEntryRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  async function submitJson(event: FormEvent<HTMLFormElement>, endpoint: string, success: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    try {
      const form = new FormData(formElement);
      await requestJson(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formElement.reset();
      await onUpdated();
      notify({ kind: "ok", message: success });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const enteredQuantity = Number(form.get("quantity"));
    const storedQuantity = movementItem && (movementItem.category === "roasted" || movementItem.category === "gusto")
      ? kilogramsToInventoryQuantity(enteredQuantity, movementItem.unit)
      : form.get("quantity");
    const enteredOutputQuantity = Number(form.get("outputQuantity"));
    const storedOutputQuantity = roastedOutputItem
      ? kilogramsToInventoryQuantity(enteredOutputQuantity, roastedOutputItem.unit)
      : form.get("outputQuantity");
    setBusy(true);
    try {
      const payload = isGreenRoast
        ? {
            greenItemId: movementItemId,
            roastedItemId: roastedOutputItemId,
            greenKg: form.get("quantity"),
            outputGrams: storedOutputQuantity,
            movementDate: form.get("movementDate"),
            note: form.get("note"),
          }
        : {
            ...Object.fromEntries(form.entries()),
            action: "movement",
            itemId: movementItemId,
            movementType,
            quantity: storedQuantity,
          };
      await requestJson(isGreenRoast ? "/api/inventory/roast" : "/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      formElement.reset();
      setMovementType("in");
      await onUpdated();
      notify({
        kind: "ok",
        message: isGreenRoast
          ? "생두 출고와 완성 원두 입고를 함께 반영했습니다."
          : "재고 변동을 반영했습니다.",
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function saveInventoryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setItemBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      if (editingItem.category === "roasted" || editingItem.category === "gusto") {
        form.set(
          "reorderLevel",
          String(kilogramsToInventoryQuantity(Number(form.get("reorderLevel")), editingItem.unit)),
        );
      }
      await requestJson(`/api/inventory/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      setEditingItem(null);
      await onUpdated();
      notify({ kind: "ok", message: "품목 정보를 수정했습니다. 연결된 재고 기록에도 새 명칭이 반영됩니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setItemBusy(false);
    }
  }

  async function hideInventoryItem(item: InventoryItem) {
    if (Math.abs(item.quantity) > 0.000001) return;
    if (!window.confirm(`${item.name} 품목을 재고 현황에서 숨길까요? 기존 기록은 그대로 보관됩니다.`)) return;
    setItemBusy(true);
    try {
      await requestJson(`/api/inventory/items/${item.id}`, { method: "DELETE" });
      setEditingItem(null);
      await onUpdated();
      notify({ kind: "ok", message: "품목을 재고 현황에서 숨겼습니다. 기존 기록은 보관됩니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setItemBusy(false);
    }
  }

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="빠른 재고 업무"
        title="재고 관리"
        description="자주 쓰는 입고·출고·실사 조정을 먼저 선택하고 필요한 값만 바로 입력하세요."
        action={<a className="export-button" href="/api/exports/inventory">전체 재고 Excel</a>}
      />

      <section className="inventory-command-bar" aria-label="재고 빠른 입력">
        <header><span>QUICK ENTRY</span><strong>어떤 작업을 할까요?</strong><p>선택하면 입력칸으로 바로 이동합니다.</p></header>
        <div>
          <button type="button" className={inventoryTab === "movement" && entryMode === "existing" && movementType === "in" ? "active" : ""} onClick={() => openInventoryEntry("existing", "in")}><small>01</small><b>입고 등록</b><span>수량을 더합니다</span></button>
          <button type="button" className={inventoryTab === "movement" && entryMode === "existing" && movementType === "out" ? "active" : ""} onClick={() => openInventoryEntry("existing", "out")}><small>02</small><b>출고 · 사용</b><span>수업·로스팅 사용</span></button>
          <button type="button" className={inventoryTab === "movement" && entryMode === "existing" && movementType === "adjust" ? "active" : ""} onClick={() => openInventoryEntry("existing", "adjust")}><small>03</small><b>실사 조정</b><span>현재 수량으로 맞춤</span></button>
          <button type="button" className={inventoryTab === "movement" && entryMode === "new" ? "active" : ""} onClick={() => openInventoryEntry("new")}><small>04</small><b>새 품목</b><span>등록과 입고를 한 번에</span></button>
        </div>
      </section>

      <div className="inventory-summary inventory-summary-always">
        <div><span>생두 품목</span><strong>{greenItems.length}<small>개</small></strong></div>
        <div><span>원두 품목</span><strong>{beanItems.length}<small>개</small></strong></div>
        <div className={data.inventory.some((item) => item.lowStock) ? "attention" : ""}><span>확인 필요</span><strong>{data.inventory.filter((item) => item.lowStock).length}<small>개</small></strong></div>
      </div>

      <div className="inventory-tabs" role="tablist" aria-label="재고 작업 선택">
        {inventoryTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={inventoryTab === tab.key}
            className={inventoryTab === tab.key ? "active" : ""}
            key={tab.key}
            onClick={() => setInventoryTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {inventoryTab === "overview" && (
        <div role="tabpanel">
          <div className="inventory-overview-controls">
            <div className="inventory-filter" role="group" aria-label="재고 분류 필터">
              {categoryFilters.map((filter) => (
                <button
                  type="button"
                  className={categoryFilter === filter.key ? "active" : ""}
                  key={filter.key}
                  onClick={() => setCategoryFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="inventory-sort-control">
              <span>정렬</span>
              <select value={inventorySort} onChange={(event) => setInventorySort(event.target.value as InventorySort)}>
                <option value="expiry">소비기한 임박순</option>
                <option value="attention">확인 필요 우선</option>
                <option value="quantityAsc">수량 적은 순</option>
                <option value="quantityDesc">수량 많은 순</option>
                <option value="name">이름순</option>
              </select>
            </label>
          </div>
          <div className="inventory-sections">
            {inventorySections.map((section) => (
              <section className={`inventory-section inventory-section-${section.key}`} key={section.key} aria-labelledby={`inventory-section-${section.key}`}>
                <div className="inventory-section-heading">
                  <div>
                    <span>{section.eyebrow}</span>
                    <h3 id={`inventory-section-${section.key}`}>{section.title}</h3>
                    <p>{section.description}</p>
                  </div>
                  <strong>{section.items.length}<small>개 품목</small></strong>
                </div>
                <div className="inventory-grid">
                  {section.items.map((item) => {
                    const amount = inventoryItemAmount(item);
                    const minimum = inventoryItemAmount(item, item.reorderLevel);
                    return (
                      <article className={item.lowStock ? "inventory-card low" : "inventory-card"} key={item.id}>
                        <div className="inventory-card-top">
                          <span className={`category-tag category-${item.category}`}>{categoryLabel[item.category]}</span>
                          <div className="inventory-card-controls">
                            <span className={item.lowStock ? "stock-status low" : "stock-status"}>{item.lowStock ? "확인 필요" : "정상"}</span>
                            {data.user.role === "admin" && <button type="button" onClick={() => setEditingItem(item)}>정보 수정</button>}
                          </div>
                        </div>
                        <h3>{item.name}</h3>
                        {(item.lot || item.process || item.expiryDate) && (
                          <div className="inventory-meta">
                            {item.lot && <span>LOT {item.lot}</span>}
                            {item.process && <span>{item.process}</span>}
                            {formatDateOnly(item.expiryDate) && <span>소비기한 {formatDateOnly(item.expiryDate)}</span>}
                          </div>
                        )}
                        <strong>{amount.value}<small>{amount.unit}</small></strong>
                        <div className="stock-meter"><span style={{ width: `${Math.min(100, item.reorderLevel ? (item.quantity / (item.reorderLevel * 2)) * 100 : 100)}%` }} /></div>
                        <p>최소 재고 {minimum.value}{minimum.unit}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {data.legacyInventoryCount > 0 && <p className="inventory-source-note">기존 더컵인벤토리의 입고·로스팅 기록과 현재 잔량을 그대로 연결했습니다.</p>}
        </div>
      )}

      {inventoryTab === "movement" && (
        <article ref={inventoryEntryRef} id="inventory-quick-entry" className="panel compact-form-panel inventory-workspace-panel" role="tabpanel">
          <div className="inventory-entry-switch segmented" role="group" aria-label="입출고 대상 선택">
            <label className={entryMode === "existing" ? "active" : ""}>
              <input type="radio" checked={entryMode === "existing"} onChange={() => setEntryMode("existing")} />기존 품목
            </label>
            <label className={entryMode === "new" ? "active" : ""}>
              <input type="radio" checked={entryMode === "new"} onChange={() => setEntryMode("new")} />새 품목 입고
            </label>
          </div>

          {entryMode === "existing" ? (
            <>
              <div className="form-title"><div><h3>기존 품목 입출고</h3><p>생두 출고를 선택하면 로스팅된 원두 입고까지 한 번에 기록됩니다.</p></div></div>
              {movementItem && (() => {
                const amount = inventoryItemAmount(movementItem);
                return <div className="inventory-selected-item"><div><span>선택된 품목</span><strong>{movementItem.name}</strong></div><p>{categoryLabel[movementItem.category]}</p><b>{amount.value}<small>{amount.unit}</small></b></div>;
              })()}
              <form onSubmit={submitMovement}>
                <Field label="품목">
                  <select name="itemId" required value={movementItemId} onChange={(event) => setMovementItemId(Number(event.target.value))}>
                    {greenItems.length > 0 && <optgroup label="생두">{greenItems.map((item) => <option key={item.id} value={item.id}>{inventoryOptionLabel(item)}</option>)}</optgroup>}
                    {beanItems.length > 0 && <optgroup label="원두">{beanItems.map((item) => <option key={item.id} value={item.id}>{inventoryOptionLabel(item)}</option>)}</optgroup>}
                    {data.inventory.some((item) => item.category === "milk" || item.category === "other") && (
                      <optgroup label="우유 · 기타">{data.inventory.filter((item) => item.category === "milk" || item.category === "other").map((item) => <option key={item.id} value={item.id}>{inventoryOptionLabel(item)}</option>)}</optgroup>
                    )}
                  </select>
                </Field>
                <div className="two-columns">
                  <Field label="작업">
                    <select name="movementType" value={movementType} onChange={(event) => setMovementType(event.target.value as "in" | "out" | "adjust")}>
                      <option value="in">입고</option>
                      <option value="out">{movementItem?.category === "green" ? "로스팅 사용 (출고)" : "출고/사용"}</option>
                      <option value="adjust">실사 수량으로 조정</option>
                    </select>
                  </Field>
                  <Field label={`${movementType === "adjust" ? "실사 수량" : isGreenRoast ? "생두 투입량" : "수량"} (${movementItem && (movementItem.category === "roasted" || movementItem.category === "gusto") ? "kg" : movementItem?.unit ?? "단위"})`}>
                    <input name="quantity" type="number" min={movementType === "adjust" ? "0" : "0.01"} step="0.01" required />
                  </Field>
                </div>
                {isGreenRoast && (
                  <div className="inline-roast-workflow">
                    <div className="inline-roast-heading"><strong>완성된 원두도 함께 입고</strong><span>두 번 입력할 필요 없이 자동으로 연결됩니다.</span></div>
                    <div className="two-columns">
                      <Field label="완성 원두 품목">
                        <select name="roastedItemId" required value={roastedOutputItem?.id ?? ""} onChange={(event) => setRoastedOutputItemId(Number(event.target.value))}>
                          {roastedItems.length > 0
                            ? roastedItems.map((item) => <option key={item.id} value={item.id}>{inventoryOptionLabel(item)}</option>)
                            : <option value="">새 품목 입고에서 원두를 먼저 등록하세요</option>}
                        </select>
                      </Field>
                      <Field label="완성 원두 수량 (kg)">
                        <input name="outputQuantity" type="number" min="0.01" step="0.01" required />
                      </Field>
                    </div>
                  </div>
                )}
                <Field label="날짜"><input name="movementDate" type="date" defaultValue={today} required /></Field>
                <Field label="메모"><input name="note" placeholder={isGreenRoast ? "배치 또는 프로파일명" : "입고처, 출고·사용 사유"} /></Field>
                <button className="secondary-button" disabled={busy || (isGreenRoast && !roastedOutputItem)}>{busy ? "반영 중…" : isGreenRoast ? "로스팅 재고 함께 반영" : "재고 반영"}</button>
              </form>
            </>
          ) : (
            <>
              <div className="form-title"><div><h3>새 품목 입고</h3><p>목록에 없는 생두, 원두 또는 부자재를 등록하면서 입고합니다.</p></div></div>
              <form onSubmit={(event) => submitJson(event, "/api/inventory", "새 품목과 입고 수량을 함께 반영했습니다.")}>
                <input type="hidden" name="action" value="create_item_with_stock" />
                <Field label="품목명"><input name="name" required placeholder="에티오피아 구지 워시드" /></Field>
                <div className="two-columns">
                  <Field label="LOT (선택)"><input name="lot" placeholder="26.07.24" /></Field>
                  <PresetOrCustomField name="process" label="가공 방식" options={coffeeProcessOptions} customPlaceholder="가공 방식을 입력하세요" />
                </div>
                <div className="two-columns">
                  <Field label="분류">
                    <select name="category" value={newItemCategory} onChange={(event) => setNewItemCategory(event.target.value as InventoryItem["category"])}><option value="green">생두</option><option value="roasted">원두 · 자체 로스팅</option><option value="gusto">원두 · 구스토</option><option value="milk">우유</option><option value="other">기타</option></select>
                  </Field>
                  <PresetOrCustomField key={newItemCategory} name="unit" label="단위" options={inventoryUnitOptions} initialValue={newItemCategory === "milk" ? "팩" : newItemCategory === "other" ? "개" : "kg"} required customPlaceholder="사용할 단위를 입력하세요" />
                </div>
                <div className="two-columns">
                  <Field label="입고 수량"><input name="initialQuantity" type="number" min="0.01" step="0.01" required /></Field>
                  <Field label="입고일"><input name="movementDate" type="date" defaultValue={today} required /></Field>
                </div>
                <div className="two-columns">
                  <Field label="최소 재고"><input name="reorderLevel" type="number" min="0" step="0.1" defaultValue="0" /></Field>
                  <Field label="소비기한 (선택)"><input name="expiryDate" type="date" /></Field>
                </div>
                <Field label="입고 메모 (선택)"><input name="note" placeholder="구매처, 입고 사유" maxLength={300} /></Field>
                <button className="secondary-button" disabled={busy}>{busy ? "등록 중…" : "품목 등록 및 입고"}</button>
              </form>
            </>
          )}
        </article>
      )}

      {inventoryTab === "history" && (
        <article className="panel table-panel" role="tabpanel">
          <div className="panel-heading"><div><span className="eyebrow">재고 장부</span><h3>최근 재고 기록</h3></div></div>
          <MovementTable
            movements={data.movements}
            isAdmin={data.user.role === "admin"}
            onUpdated={onUpdated}
            notify={notify}
          />
        </article>
      )}

      {editingItem && (() => {
        const classificationLocked = Boolean(editingItem.legacyKey)
          || Boolean(editingItem.hasMovements)
          || Math.abs(editingItem.quantity) > 0.000001;
        const currentAmount = inventoryItemAmount(editingItem);
        return (
          <div className="record-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditingItem(null);
          }}>
            <article className="record-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-item-editor-title">
              <div className="record-modal-heading">
                <div><span className="eyebrow">관리자 편집</span><h3 id="inventory-item-editor-title">품목 정보 수정</h3></div>
                <button type="button" aria-label="닫기" onClick={() => setEditingItem(null)}>×</button>
              </div>
              <p className="record-modal-summary"><strong>{editingItem.name}</strong> · 현재 {currentAmount.value}{currentAmount.unit}</p>
              <form onSubmit={saveInventoryItem}>
                <Field label="품목명"><input name="name" defaultValue={editingItem.name} maxLength={80} required autoFocus /></Field>
                <div className="two-columns">
                  <Field label="분류">
                    {classificationLocked ? (
                      <><input type="hidden" name="category" value={editingItem.category} /><input value={categoryLabel[editingItem.category]} disabled /></>
                    ) : (
                      <select name="category" defaultValue={editingItem.category}><option value="green">생두</option><option value="roasted">로스팅(원두)</option><option value="gusto">구스토 원두</option><option value="milk">우유</option><option value="other">기타</option></select>
                    )}
                  </Field>
                  <Field label="단위">
                    {classificationLocked ? (
                      <><input type="hidden" name="unit" value={editingItem.unit} /><input value={editingItem.category === "roasted" || editingItem.category === "gusto" ? "kg" : editingItem.unit} disabled /></>
                    ) : <input name="unit" defaultValue={editingItem.unit} maxLength={10} required />}
                  </Field>
                </div>
                <div className="two-columns">
                  <Field label="LOT (선택)"><input name="lot" defaultValue={editingItem.lot} maxLength={40} /></Field>
                  <Field label="가공 방식 (선택)"><input name="process" defaultValue={editingItem.process} maxLength={80} /></Field>
                </div>
                <div className="two-columns">
                  <Field label="소비기한 (선택)"><input name="expiryDate" type="date" defaultValue={formatDateOnly(editingItem.expiryDate) ?? ""} /></Field>
                  <Field label={`최소 재고 (${editingItem.category === "roasted" || editingItem.category === "gusto" ? "kg" : editingItem.unit})`}><input name="reorderLevel" type="number" min="0" step="0.01" defaultValue={editingItem.category === "roasted" || editingItem.category === "gusto" ? inventoryQuantityInKilograms(editingItem.reorderLevel, editingItem.unit) : editingItem.reorderLevel} required /></Field>
                </div>
                <p className="linked-record-note">품목명을 수정하면 연결된 입출고·수업·영수증 기록에도 즉시 반영됩니다. 현재 잔량은 입출고 탭의 ‘실사 수량으로 조정’을 이용하세요.</p>
                {classificationLocked && <p className="locked-field-note">기존 수량과 기록의 단위가 달라지지 않도록 분류와 단위는 잠겨 있습니다.</p>}
                <div className="record-modal-actions inventory-item-modal-actions">
                  <button
                    type="button"
                    className="ghost-button danger inventory-hide-button"
                    disabled={itemBusy || Math.abs(editingItem.quantity) > 0.000001}
                    onClick={() => void hideInventoryItem(editingItem)}
                    title={Math.abs(editingItem.quantity) > 0.000001 ? "현재 재고를 0으로 조정한 뒤 숨길 수 있습니다." : "기존 기록을 보관하고 현황에서 숨깁니다."}
                  >품목 숨기기</button>
                  <button type="button" className="ghost-button" onClick={() => setEditingItem(null)}>취소</button>
                  <button className="primary-button" disabled={itemBusy}>{itemBusy ? "저장 중…" : "수정 저장"}</button>
                </div>
              </form>
            </article>
          </div>
        );
      })()}
    </section>
  );
}

function FinanceView({
  data,
  onUpdated,
  notify,
}: {
  data: DashboardData;
  onUpdated: () => Promise<void>;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);
  const [editingKind, setEditingKind] = useState<"income" | "expense">("income");
  const [busyTransactionId, setBusyTransactionId] = useState<number | null>(null);

  function startEditingTransaction(entry: FinanceTransaction) {
    setEditingKind(entry.kind);
    setEditingTransaction(entry);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    try {
      const form = new FormData(formElement);
      await requestJson("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      formElement.reset();
      await onUpdated();
      notify({ kind: "ok", message: `${kind === "income" ? "매출" : "지출"} 내역이 월별 지표에 반영됐습니다.` });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransaction) return;
    setBusyTransactionId(editingTransaction.id);
    try {
      const form = new FormData(event.currentTarget);
      form.set("id", String(editingTransaction.id));
      await requestJson("/api/finance", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      setEditingTransaction(null);
      await onUpdated();
      notify({ kind: "ok", message: "매출·지출 기록을 수정했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function deleteTransaction(entry: FinanceTransaction) {
    const linkedMessage = entry.inventoryMovementId
      ? " 연결된 우유 입고·영수증·재고 수량도 함께 정리됩니다."
      : "";
    if (!window.confirm(`${entry.category} ${won.format(entry.amount)} 기록을 삭제할까요?${linkedMessage}`)) return;
    setBusyTransactionId(entry.id);
    try {
      await requestJson("/api/finance", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      await onUpdated();
      notify({ kind: "ok", message: "매출·지출 기록을 삭제했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusyTransactionId(null);
    }
  }

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="매출 · 지출"
        title="매출 및 지출 등록"
        description="CSV 매출 자료 이후 새로 발생한 매출과 지출만 입력하세요. 우유 구매 비용은 자동으로 들어옵니다."
      />
      <div className="finance-layout">
        <article className="panel finance-entry">
          <div className="panel-heading"><div><span className="eyebrow">새 내역</span><h3>매출 및 지출 등록</h3></div></div>
          <form onSubmit={submit}>
            <div className="segmented">
              <label className={kind === "income" ? "active" : ""}><input type="radio" name="kind" value="income" checked={kind === "income"} onChange={() => setKind("income")} />매출</label>
              <label className={kind === "expense" ? "active" : ""}><input type="radio" name="kind" value="expense" checked={kind === "expense"} onChange={() => setKind("expense")} />지출</label>
            </div>
            <Field label="날짜"><input name="transactionDate" type="date" defaultValue={today} required /></Field>
            <PresetOrCustomField key={kind} name="category" label={`${kind === "income" ? "매출" : "지출"} 분류`} options={financeCategoryOptions[kind]} initialValue={financeCategoryOptions[kind][0]} required customPlaceholder="기타 분류명을 입력하세요" />
            <Field label="금액"><div className="input-suffix"><input name="amount" type="number" min="1" step="1" required /><span>원</span></div></Field>
            <Field label="설명"><textarea name="description" rows={3} placeholder="거래 내용을 간단히 기록하세요." /></Field>
            <button className="primary-button" disabled={busy}>{busy ? "반영 중…" : "장부에 반영"}</button>
          </form>
        </article>

        <article className="panel table-panel finance-ledger">
          <div className="panel-heading">
            <div><span className="eyebrow">최근 장부</span><h3>최근 입력 내역</h3></div>
            <span className="csv-badge">CSV 2022–2026 이관 완료</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>일자</th><th>구분</th><th>분류</th><th>설명</th><th>금액</th><th>등록자</th>{data.user.role === "admin" && <th>관리</th>}</tr></thead>
              <tbody>
                {data.transactions.length ? data.transactions.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.transactionDate}</td>
                    <td><span className={`kind-badge ${entry.kind}`}>{entry.kind === "income" ? "매출" : "지출"}</span></td>
                    <td>{entry.category}</td>
                    <td>{entry.description || "—"}</td>
                    <td className={entry.kind}>{entry.kind === "income" ? "+" : "−"} {won.format(entry.amount)}</td>
                    <td>{entry.createdByName}</td>
                    {data.user.role === "admin" && (
                      <td>
                        <div className="record-actions">
                          <button type="button" onClick={() => startEditingTransaction(entry)}>수정</button>
                          <button type="button" className="danger" disabled={busyTransactionId === entry.id} onClick={() => void deleteTransaction(entry)}>
                            {busyTransactionId === entry.id ? "처리 중" : "삭제"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )) : <tr><td colSpan={data.user.role === "admin" ? 7 : 6} className="empty-cell">신규 입력 내역이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {editingTransaction && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setEditingTransaction(null);
        }}>
          <article className="record-modal" role="dialog" aria-modal="true" aria-labelledby="finance-editor-title">
            <div className="record-modal-heading">
              <div><span className="eyebrow">관리자 편집</span><h3 id="finance-editor-title">매출·지출 기록 수정</h3></div>
              <button type="button" aria-label="닫기" onClick={() => setEditingTransaction(null)}>×</button>
            </div>
            <form onSubmit={saveTransaction}>
              <div className="two-columns">
                <Field label="구분">
                  {editingTransaction.inventoryMovementId
                    ? <><input type="hidden" name="kind" value="expense" /><input value="지출 (우유 구매 연결)" disabled /></>
                    : <select name="kind" value={editingKind} onChange={(event) => setEditingKind(event.target.value as "income" | "expense")}><option value="income">매출</option><option value="expense">지출</option></select>}
                </Field>
                <Field label="날짜"><input name="transactionDate" type="date" defaultValue={editingTransaction.transactionDate} required /></Field>
              </div>
              <PresetOrCustomField key={`${editingTransaction.id}-${editingKind}`} name="category" label="분류" options={financeCategoryOptions[editingKind]} initialValue={editingKind === editingTransaction.kind ? editingTransaction.category : financeCategoryOptions[editingKind][0]} required customPlaceholder="기타 분류명을 입력하세요" />
              <Field label="금액"><div className="input-suffix"><input name="amount" type="number" min="1" step="1" defaultValue={editingTransaction.amount} required /><span>원</span></div></Field>
              <Field label="설명"><textarea name="description" rows={3} defaultValue={editingTransaction.description} maxLength={300} /></Field>
              {editingTransaction.inventoryMovementId && <p className="linked-record-note">우유 구매 기록과 연결되어 있습니다. 날짜·금액 수정 시 재고 기록에도 함께 반영됩니다.</p>}
              <div className="record-modal-actions">
                <button type="button" className="ghost-button" onClick={() => setEditingTransaction(null)}>취소</button>
                <button className="primary-button" disabled={busyTransactionId === editingTransaction.id}>{busyTransactionId === editingTransaction.id ? "저장 중…" : "수정 저장"}</button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}

function RoastingView({
  user,
  notify,
}: {
  user: User;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [profiles, setProfiles] = useState<RoastProfile[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<RoastEditorState>(null);
  const [loading, setLoading] = useState(true);
  const [draggedProfileId, setDraggedProfileId] = useState<number | null>(null);
  const [dragOverProfileId, setDragOverProfileId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const load = useCallback(async (preferredId?: number) => {
    try {
      const result = await requestJson<{ profiles: RoastProfile[] }>("/api/roasting");
      setProfiles(result.profiles);
      setSelectedId((current) => {
        if (preferredId && result.profiles.some((profile) => profile.id === preferredId)) return preferredId;
        if (current && result.profiles.some((profile) => profile.id === current)) return current;
        return result.profiles[0]?.id ?? null;
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    // Fetch the protected profile list when this workspace opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  async function deleteProfile(profile: RoastProfile) {
    if (!window.confirm(`${profile.beanName} 프로파일을 삭제할까요?`)) return;
    try {
      await requestJson(`/api/roasting/${profile.id}`, { method: "DELETE" });
      setSelectedId(null);
      await load();
      notify({ kind: "ok", message: "로스팅 프로파일을 삭제했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    }
  }

  async function moveProfile(profileId: number, targetIndex: number) {
    if (savingOrder) return;
    const sourceIndex = profiles.findIndex((profile) => profile.id === profileId);
    const boundedTarget = Math.max(0, Math.min(targetIndex, profiles.length - 1));
    if (sourceIndex < 0 || sourceIndex === boundedTarget) return;

    const previous = profiles;
    const next = [...profiles];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(boundedTarget, 0, moved);
    setProfiles(next);
    setSavingOrder(true);
    try {
      await requestJson("/api/roasting/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIds: next.map((profile) => profile.id) }),
      });
      notify({ kind: "ok", message: "프로파일 목록 순서를 저장했습니다." });
    } catch (error) {
      setProfiles(previous);
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setSavingOrder(false);
    }
  }

  if (editor) {
    const sourceProfile = editor.mode === "create" ? null : editor.profile;
    return (
      <section className="page-section">
        <RoastProfileForm
          initial={sourceProfile}
          mode={editor.mode}
          onCancel={() => setEditor(null)}
          onSaved={async (savedId) => {
            setEditor(null);
            await load(savedId);
            notify({
              kind: "ok",
              message: editor.mode === "copy"
                ? "복사한 프로파일을 새 프로파일로 저장했습니다."
                : "로스팅 프로파일을 저장했습니다.",
            });
          }}
          notify={notify}
        />
      </section>
    );
  }

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="로스팅 기록"
        title="로스팅 프로파일"
        description="온도, bar 기준 가스 압력, 1차 크랙과 배출 시점을 기록하고 구간별 평균 ROR을 확인합니다."
      />

      {user.role === "admin" && (
        <section className="roast-quick-start">
          <div><span>QUICK PROFILE</span><h2>새 로스팅 기록을 바로 입력하세요.</h2><p>빈 양식으로 시작하거나 선택한 프로파일을 복사해 달라진 값만 수정할 수 있습니다.</p></div>
          <div className="roast-quick-actions">
            <button className="primary-button" onClick={() => setEditor({ mode: "create" })}>새 프로파일 바로 입력</button>
            <button className="ghost-button" disabled={!selected} onClick={() => selected && setEditor({ mode: "copy", profile: selected })}>선택값 복사해 입력</button>
          </div>
        </section>
      )}

      {loading ? <div className="panel empty-state">프로파일을 불러오는 중입니다.</div> : profiles.length ? (
        <div className="roast-layout">
          <aside className="profile-sidebar">
            <div className="profile-list-heading">
              <strong>프로파일 목록</strong>
              {user.role === "admin" && (
                <span aria-live="polite">
                  {savingOrder ? "순서 저장 중…" : "끌어서 이동 · ↑↓ 버튼"}
                </span>
              )}
            </div>
            <div className="profile-list" aria-label="로스팅 프로파일 순서">
              {profiles.map((profile, index) => (
                <div
                  className={[
                    "profile-list-item",
                    user.role === "admin" ? "editable" : "",
                    draggedProfileId === profile.id ? "dragging" : "",
                    dragOverProfileId === profile.id && draggedProfileId !== profile.id ? "drag-over" : "",
                  ].filter(Boolean).join(" ")}
                  key={profile.id}
                  onDragOver={(event) => {
                    if (user.role !== "admin" || savingOrder) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (dragOverProfileId !== profile.id) setDragOverProfileId(profile.id);
                  }}
                  onDrop={(event) => {
                    if (user.role !== "admin" || savingOrder) return;
                    event.preventDefault();
                    const sourceId = Number(event.dataTransfer.getData("text/plain")) || draggedProfileId;
                    setDraggedProfileId(null);
                    setDragOverProfileId(null);
                    if (sourceId) void moveProfile(sourceId, index);
                  }}
                >
                  {user.role === "admin" && (
                    <button
                      type="button"
                      className="profile-drag-handle"
                      draggable={!savingOrder}
                      disabled={savingOrder}
                      aria-label={`${profile.beanName} 프로파일 순서 이동`}
                      title="끌어서 원하는 위치로 이동"
                      onDragStart={(event) => {
                        setDraggedProfileId(profile.id);
                        setDragOverProfileId(null);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(profile.id));
                      }}
                      onDragEnd={() => {
                        setDraggedProfileId(null);
                        setDragOverProfileId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" && index > 0) {
                          event.preventDefault();
                          void moveProfile(profile.id, index - 1);
                        }
                        if (event.key === "ArrowDown" && index < profiles.length - 1) {
                          event.preventDefault();
                          void moveProfile(profile.id, index + 1);
                        }
                      }}
                    >
                      <span aria-hidden="true">⠿</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={selectedId === profile.id ? "profile-card active" : "profile-card"}
                    onClick={() => setSelectedId(profile.id)}
                  >
                    <span>{profile.origin || "ORIGIN"}</span>
                    <strong>{profile.beanName}</strong>
                    <small>{profile.process || "프로세스 미입력"} · {formatTime(profile.totalSeconds)}</small>
                  </button>
                  {user.role === "admin" && (
                    <div className="profile-order-actions" aria-label={`${profile.beanName} 순서 조정`}>
                      <button
                        type="button"
                        onClick={() => void moveProfile(profile.id, index - 1)}
                        disabled={savingOrder || index === 0}
                        aria-label={`${profile.beanName} 위로 이동`}
                        title="위로 이동"
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => void moveProfile(profile.id, index + 1)}
                        disabled={savingOrder || index === profiles.length - 1}
                        aria-label={`${profile.beanName} 아래로 이동`}
                        title="아래로 이동"
                      >↓</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>
          {selected && (
            <article className="panel profile-detail">
              <div className="profile-hero">
                <div>
                  <span className="eyebrow">{selected.origin || "산지 미입력"} · {selected.process || "가공 방식 미입력"}</span>
                  <h2>{selected.beanName}</h2>
                  <p>{number.format(selected.batchWeight)}kg 배치 · 작성 {selected.createdByName}</p>
                </div>
                {user.role === "admin" && (
                  <div className="button-row">
                    <button className="ghost-button" onClick={() => setEditor({ mode: "copy", profile: selected })}>복사해서 새로 만들기</button>
                    <button className="ghost-button" onClick={() => setEditor({ mode: "edit", profile: selected })}>수정</button>
                    <button className="ghost-button danger" onClick={() => void deleteProfile(selected)}>삭제</button>
                  </div>
                )}
              </div>
              <RoastFollowGuide profile={selected} />
              <RoastCurve profile={selected} />
              <div className="roast-metrics">
                <Metric label="배치 중량" value={`${number.format(selected.batchWeight)}kg`} />
                <Metric label="전체 시간" value={formatTime(selected.totalSeconds)} />
                <Metric label="디벨롭" value={`${formatTime(selected.developmentSeconds)} · ${selected.developmentRatio}%`} accent />
              </div>
              <div className="ror-grid">
                <div><span>터닝 → 1차 크랙 평균 ROR</span><strong>{selected.ror.turningToCrack}℃/분</strong><small>1분마다 올라간 평균 온도</small></div>
                <div><span>1차 크랙 → 종료 평균 ROR</span><strong>{selected.ror.development}℃/분</strong><small>디벨롭 구간의 평균 온도 상승</small></div>
              </div>
              <div className="profile-notes">
                <div><span>가스 운용</span><p>{selected.gasNotes || "기록 없음"}</p></div>
                <div><span>컵 노트 · 주의사항</span><p>{selected.notes || "기록 없음"}</p></div>
              </div>
            </article>
          )}
        </div>
      ) : (
        <div className="panel empty-state">
          <strong>아직 저장된 로스팅 프로파일이 없습니다.</strong>
          <p>첫 프로파일을 등록하면 온도 곡선과 구간별 ROR이 여기에 표시됩니다.</p>
          {user.role === "admin" && <button className="primary-button small" onClick={() => setEditor({ mode: "create" })}>첫 프로파일 만들기</button>}
        </div>
      )}
    </section>
  );
}

function RoastFollowGuide({ profile }: { profile: RoastProfile }) {
  const chargePoint = roastPointAt(profile.points, 0, { beanTemp: profile.chargeTemp, gasPressure: 0 });
  const charge = { ...chargePoint, beanTemp: chargePoint.beanTemp > 0 ? chargePoint.beanTemp : profile.chargeTemp };
  const turning = roastPointAt(profile.points, profile.turningPointSeconds, { beanTemp: 0, gasPressure: 0 });
  const firstCrack = roastPointAt(profile.points, profile.firstCrackSeconds, { beanTemp: 0, gasPressure: 0 });
  const finish = roastPointAt(profile.points, profile.totalSeconds, { beanTemp: profile.dropTemp, gasPressure: 0 });
  const gasAdjustments = getGasAdjustments(profile.points, profile.totalSeconds);
  const steps = [
    { label: "투입", description: "예열한 로스터에 원두를 넣는 시작 시점", seconds: 0, point: charge },
    { label: "터닝포인트", description: "온도가 가장 낮아졌다가 다시 오르기 시작하는 시점", seconds: profile.turningPointSeconds, point: turning },
    { label: "1차 크랙 시작", description: "원두에서 첫 크랙 소리가 들리기 시작하는 시점", seconds: profile.firstCrackSeconds, point: firstCrack },
    { label: "종료", description: "로스팅을 마치고 원두를 배출하는 시점", seconds: profile.totalSeconds, point: finish },
  ];

  return (
    <section className="roast-follow-guide" aria-labelledby="roast-follow-title">
      <div className="roast-follow-heading">
        <div><span className="eyebrow">한눈에 따라하기</span><h3 id="roast-follow-title">이 순서대로 확인하세요</h3></div>
        <p>주요 시점과 실제 화력 변경 기록을 함께 보면서 진행하세요.</p>
      </div>
      <div className="roast-step-list">
        {steps.map((step, index) => (
          <article className="roast-step-card" key={step.label}>
            <span className="roast-step-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="roast-step-copy"><h4>{step.label}</h4><p>{step.description}</p></div>
            <dl>
              <div><dt>시간</dt><dd>{formatTime(step.seconds)}</dd></div>
              <div><dt>온도</dt><dd>{number.format(step.point.beanTemp)}℃</dd></div>
              <div><dt>가스</dt><dd>{formatGasPressure(step.point.gasPressure)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <div className="roast-gas-guide">
        <div className="roast-gas-heading">
          <div>
            <span>실제 화력 조절 기록</span>
            <h4>가스를 바꾼 순간만 시간순으로 표시합니다</h4>
          </div>
          <strong>{gasAdjustments.length}개 기록</strong>
        </div>
        {gasAdjustments.length ? (
          <ol className="roast-gas-list">
            {gasAdjustments.map((adjustment) => {
              const isStart = adjustment.previousGasPressure === null;
              const increased = !isStart && adjustment.gasPressure > adjustment.previousGasPressure!;
              const action = isStart ? "시작 화력" : increased ? "화력 높임" : "화력 낮춤";
              return (
                <li key={`${adjustment.seconds}-${adjustment.gasPressure}`}>
                  <time>{formatTime(adjustment.seconds)}</time>
                  <div className="roast-gas-action">
                    <strong>{action}</strong>
                    <span>원두 온도 {number.format(adjustment.beanTemp)}℃</span>
                  </div>
                  <div className="roast-gas-pressure">
                    {!isStart && <small>{formatGasPressure(adjustment.previousGasPressure!)} →</small>}
                    <strong>{formatGasPressure(adjustment.gasPressure)}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="roast-gas-empty">저장된 화력 조절 기록이 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function DurationInput({
  value,
  onChange,
  ariaLabel,
  name,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  name?: string;
  disabled?: boolean;
}) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  const update = (nextMinutes: number, nextSeconds: number) => {
    const normalizedMinutes = Math.max(0, Math.floor(Number.isFinite(nextMinutes) ? nextMinutes : 0));
    const normalizedSeconds = Math.min(59, Math.max(0, Math.floor(Number.isFinite(nextSeconds) ? nextSeconds : 0)));
    onChange((normalizedMinutes * 60) + normalizedSeconds);
  };

  return (
    <div className="duration-input">
      {name && <input type="hidden" name={name} value={safeValue} readOnly />}
      <div className="duration-part">
        <StableNumberInput
          value={minutes}
          onChange={(nextMinutes) => update(nextMinutes, seconds)}
          min="0"
          integer
          disabled={disabled}
          ariaLabel={`${ariaLabel} 분`}
          required={!disabled}
        />
        <span>분</span>
      </div>
      <div className="duration-part">
        <StableNumberInput
          value={seconds}
          onChange={(nextSeconds) => update(minutes, nextSeconds)}
          min="0"
          max="59"
          integer
          disabled={disabled}
          ariaLabel={`${ariaLabel} 초`}
          required={!disabled}
        />
        <span>초</span>
      </div>
    </div>
  );
}

function StableNumberInput({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  integer = false,
  disabled = false,
  required = true,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  min?: string;
  max?: string;
  integer?: boolean;
  disabled?: boolean;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(() => formatEditableNumber(value));

  function apply(raw: string) {
    const pattern = integer ? /^\d*$/ : /^\d*(?:\.\d*)?$/;
    if (!pattern.test(raw)) return;
    setDraft(raw);
    if (raw === "" || raw === ".") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(clampNumber(parsed, min, max, integer));
  }

  function commit() {
    const parsed = draft === "" || draft === "." ? value : Number(draft);
    const normalized = clampNumber(Number.isFinite(parsed) ? parsed : value, min, max, integer);
    setDraft(formatEditableNumber(normalized));
    onChange(normalized);
  }

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={draft}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      onChange={(event) => apply(event.target.value)}
      onBlur={commit}
    />
  );
}

type RoastFlowPoint = RoastPoint & {
  stableId: string;
  kind: "charge" | "turning" | "extra" | "firstCrack" | "finish";
  title: string;
  description: string;
};

type EditableRoastPoint = RoastPoint & { stableId: string };

function RoastFlowCard({
  index,
  point,
  onChange,
  onRemove,
}: {
  index: number;
  point: RoastFlowPoint;
  onChange: (field: keyof RoastPoint, value: number) => void;
  onRemove?: () => void;
}) {
  const charge = point.kind === "charge";
  return (
    <article className={`roast-flow-card ${point.kind}`}>
      <div className="roast-flow-marker"><span>{String(index + 1).padStart(2, "0")}</span></div>
      <div className="roast-flow-content">
        <div className="roast-flow-heading">
          <div><strong>{point.title}</strong><p>{point.description}</p></div>
          {onRemove && <button type="button" className="remove-flow-point" onClick={onRemove}>이 포인트 삭제</button>}
        </div>
        <div className="roast-flow-fields">
          <Field label="시간">
            <DurationInput value={point.seconds} disabled={charge} onChange={(value) => onChange("seconds", value)} ariaLabel={`${point.title} 시간`} />
          </Field>
          <Field label="원두 온도">
            <div className="input-suffix">
              <StableNumberInput value={point.beanTemp} onChange={(value) => onChange("beanTemp", value)} min="0" ariaLabel={`${point.title} 원두 온도`} />
              <span>℃</span>
            </div>
          </Field>
          <Field label="가스 압력">
            <div className="input-suffix">
              <StableNumberInput value={point.gasPressure} onChange={(value) => onChange("gasPressure", value)} min="0" max="5" ariaLabel={`${point.title} 가스 압력`} />
              <span>bar</span>
            </div>
          </Field>
        </div>
      </div>
    </article>
  );
}

function RoastProfileForm({
  initial,
  mode,
  onCancel,
  onSaved,
  notify,
}: {
  initial: RoastProfile | null;
  mode: "create" | "edit" | "copy";
  onCancel: () => void;
  onSaved: (savedId?: number) => Promise<void>;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const sourcePoints = initial?.points ?? [];
  const initialTurningSeconds = initial?.turningPointSeconds ?? 90;
  const initialFirstCrackSeconds = initial?.firstCrackSeconds ?? 480;
  const initialTotalSeconds = initial?.totalSeconds ?? 600;
  const initialCharge = roastPointAt(sourcePoints, 0, { beanTemp: initial?.chargeTemp ?? 185, gasPressure: 1.5 });
  const initialTurning = roastPointAt(sourcePoints, initialTurningSeconds, { beanTemp: 95, gasPressure: 1.5 });
  const initialFirstCrack = roastPointAt(sourcePoints, initialFirstCrackSeconds, { beanTemp: 190, gasPressure: 1 });
  const initialFinish = roastPointAt(sourcePoints, initialTotalSeconds, { beanTemp: initial?.dropTemp ?? 204, gasPressure: 0.8 });
  const [chargeTemp, setChargeTemp] = useState(initial?.chargeTemp ?? initialCharge.beanTemp);
  const [chargeGasPressure, setChargeGasPressure] = useState(initialCharge.gasPressure);
  const [turningPoint, setTurningPoint] = useState<RoastPoint>({ seconds: initialTurningSeconds, ...initialTurning });
  const [firstCrackPoint, setFirstCrackPoint] = useState<RoastPoint>({ seconds: initialFirstCrackSeconds, ...initialFirstCrack });
  const [finishPoint, setFinishPoint] = useState<RoastPoint>({ seconds: initialTotalSeconds, ...initialFinish });
  const extraPointSequence = useRef(0);
  const [extraPoints, setExtraPoints] = useState<EditableRoastPoint[]>(
    sourcePoints
      .filter((point) => ![0, initialTurningSeconds, initialFirstCrackSeconds, initialTotalSeconds].includes(point.seconds))
      .map((point, index) => ({ ...point, stableId: `saved-extra-${index}` })),
  );
  const flowPoints: RoastFlowPoint[] = [
    {
      stableId: "charge",
      kind: "charge" as const,
      title: "투입",
      description: "예열한 로스터에 생두를 넣는 시작점",
      seconds: 0,
      beanTemp: chargeTemp,
      gasPressure: chargeGasPressure,
    },
    {
      stableId: "turning",
      kind: "turning" as const,
      title: "터닝포인트",
      description: "온도가 가장 낮아졌다가 다시 오르기 시작하는 시점",
      ...turningPoint,
    },
    ...extraPoints.map((point) => ({
      ...point,
      kind: "extra" as const,
      title: "세부 포인트",
      description: "온도나 가스가 바뀌는 지점을 필요할 때만 기록",
    })),
    {
      stableId: "first-crack",
      kind: "firstCrack" as const,
      title: "1차 크랙 시작",
      description: "원두에서 첫 크랙 소리가 들리기 시작하는 시점",
      ...firstCrackPoint,
    },
    {
      stableId: "finish",
      kind: "finish" as const,
      title: "종료 · 배출",
      description: "로스팅을 마치고 원두를 배출하는 시점",
      ...finishPoint,
    },
  ].sort((left, right) => left.seconds - right.seconds || flowKindOrder(left.kind) - flowKindOrder(right.kind));
  const points: RoastPoint[] = flowPoints.map(({ seconds, beanTemp, gasPressure }) => ({ seconds, beanTemp, gasPressure }));
  const developmentSeconds = Math.max(0, finishPoint.seconds - firstCrackPoint.seconds);
  const developmentRatio = finishPoint.seconds > 0
    ? Math.round((developmentSeconds / finishPoint.seconds) * 1000) / 10
    : 0;
  const flowError = validateRoastFlow(points, turningPoint.seconds, firstCrackPoint.seconds, finishPoint.seconds);

  function updateExtraPoint(stableId: string, field: keyof RoastPoint, value: number) {
    setExtraPoints((current) => current.map((point) => point.stableId === stableId ? { ...point, [field]: value } : point));
  }

  function updateFlowPoint(point: RoastFlowPoint, field: keyof RoastPoint, value: number) {
    if (point.kind === "charge") {
      if (field === "beanTemp") setChargeTemp(value);
      if (field === "gasPressure") setChargeGasPressure(value);
      return;
    }
    if (point.kind === "turning") {
      setTurningPoint((current) => ({ ...current, [field]: value }));
      return;
    }
    if (point.kind === "firstCrack") {
      setFirstCrackPoint((current) => ({ ...current, [field]: value }));
      return;
    }
    if (point.kind === "finish") {
      setFinishPoint((current) => ({ ...current, [field]: value }));
      return;
    }
    updateExtraPoint(point.stableId, field, value);
  }

  function addPoint() {
    const gaps = points.slice(0, -1).map((point, index) => ({
      start: point.seconds,
      end: points[index + 1].seconds,
    }));
    const largestGap = gaps.sort((left, right) => (right.end - right.start) - (left.end - left.start))[0];
    if (!largestGap || largestGap.end - largestGap.start < 2) return;
    const seconds = Math.round((largestGap.start + largestGap.end) / 2);
    const estimate = interpolateRoastPoint(points, seconds);
    extraPointSequence.current += 1;
    setExtraPoints((current) => [
      ...current,
      { stableId: `new-extra-${extraPointSequence.current}`, seconds, ...estimate },
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flowError) {
      notify({ kind: "error", message: flowError });
      return;
    }
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const body = {
        ...values,
        id: mode === "edit" ? initial?.id : undefined,
        chargeTemp,
        turningPointSeconds: turningPoint.seconds,
        firstCrackSeconds: firstCrackPoint.seconds,
        totalSeconds: finishPoint.seconds,
        dropTemp: finishPoint.beanTemp,
        points,
      };
      const result = await requestJson<{ id?: number; ok?: boolean }>("/api/roasting", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await onSaved(result.id ?? initial?.id);
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="프로파일 작성"
        title={mode === "copy" ? "프로파일 복사본 만들기" : mode === "edit" ? "로스팅 프로파일 수정" : "새 로스팅 프로파일"}
        description={mode === "copy"
          ? "기존 설정을 모두 복사했습니다. 원두명과 달라진 시점만 수정하면 새 프로파일로 저장됩니다."
          : "주요 시점만 한 번 입력하면 온도·가스 포인트와 그래프가 자동으로 완성됩니다."}
        action={<button className="ghost-button" onClick={onCancel}>목록으로</button>}
      />
      <form className="panel roast-form" onSubmit={submit}>
        <nav className="roast-form-shortcuts" aria-label="프로파일 입력 단계">
          <button type="button" onClick={() => document.getElementById("roast-basic")?.scrollIntoView({ behavior: "smooth", block: "start" })}><b>01</b><span>원두 정보</span></button>
          <button type="button" onClick={() => document.getElementById("roast-flow")?.scrollIntoView({ behavior: "smooth", block: "start" })}><b>02</b><span>시간 · 온도 · 가스</span></button>
          <button type="button" onClick={() => document.getElementById("roast-notes")?.scrollIntoView({ behavior: "smooth", block: "start" })}><b>03</b><span>노트와 저장</span></button>
        </nav>
        {mode === "copy" && initial && (
          <div className="copy-profile-notice">
            <div><span>복사한 원본</span><strong>{initial.beanName}</strong></div>
            <p>원본은 그대로 보관됩니다. 새 원두명과 달라진 디벨롭·온도·가스 값만 확인한 뒤 저장하세요.</p>
          </div>
        )}
        <div id="roast-basic" className="roast-form-section">
          <span className="section-index">01 / 원두 정보</span>
          <div className="roast-bean-grid standardized">
            <Field label="원두명"><input name="beanName" defaultValue={mode === "copy" && initial ? `${initial.beanName} 복사본` : initial?.beanName} autoFocus required /></Field>
            <Field label="배치 중량 (kg)"><input name="batchWeight" type="number" min="0.01" step="0.01" defaultValue={initial?.batchWeight ?? 1} required /></Field>
            <PresetOrCustomField name="origin" label="산지" options={roastOriginOptions} initialValue={initial?.origin ?? ""} customPlaceholder="예: 에티오피아 구지" />
            <PresetOrCustomField name="process" label="프로세스" options={coffeeProcessOptions} initialValue={initial?.process ?? ""} customPlaceholder="프로세스를 입력하세요" />
          </div>
        </div>
        <div id="roast-flow" className="roast-form-section">
          <div className="section-heading roast-flow-section-heading">
            <div><span className="section-index">02 / 로스팅 흐름</span><p>실제 로스팅 순서대로 시간·온도·가스를 한 번씩만 입력하세요.</p></div>
            <div className="live-development">
              <span>자동 계산 디벨롭</span>
              <strong>{formatTime(developmentSeconds)} · {developmentRatio}%</strong>
            </div>
          </div>
          <div className="roast-flow-toolbar">
            <p>기본 흐름은 투입·터닝포인트·1차 크랙·종료입니다. 가스나 온도가 바뀌는 순간만 세부 포인트를 추가하세요.</p>
            <button type="button" className="ghost-button" onClick={addPoint}>중간 포인트 추가</button>
          </div>
          {flowError && <div className="roast-flow-error" role="alert">{flowError}</div>}
          <div className="roast-flow-list">
            {flowPoints.map((point, index) => (
              <RoastFlowCard
                key={point.stableId}
                index={index}
                point={point}
                onChange={(field, value) => updateFlowPoint(point, field, value)}
                onRemove={point.kind === "extra"
                  ? () => setExtraPoints((current) => current.filter((item) => item.stableId !== point.stableId))
                  : undefined}
              />
            ))}
          </div>
        </div>
        <div id="roast-notes" className="roast-form-section">
          <span className="section-index">03 / 따라 하기 노트</span>
          <div className="two-columns">
            <Field label="가스 운용 메모"><textarea name="gasNotes" rows={5} defaultValue={initial?.gasNotes} placeholder="예: 터닝 후 1.2bar 유지, 1차 크랙 30초 전 1.0bar" /></Field>
            <Field label="컵 노트 · 주의사항"><textarea name="notes" rows={5} defaultValue={initial?.notes} placeholder="배출 기준, 향미, 다음 배치 보정 사항" /></Field>
          </div>
        </div>
        <div className="form-actions roast-form-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>취소</button>
          <button className="primary-button" disabled={busy || Boolean(flowError)}>{busy ? "계산·저장 중…" : mode === "copy" ? "새 프로파일로 저장" : "프로파일 저장"}</button>
        </div>
      </form>
    </>
  );
}

function RoastCurve({ profile }: { profile: RoastProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !profile.points.length) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = 320 * dpr;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      const width = rect.width;
      const height = 320;
      const pad = { left: 54, right: 62, top: 36, bottom: 42 };
      const chartWidth = width - pad.left - pad.right;
      const chartHeight = height - pad.top - pad.bottom;
      const temperatures = profile.points.map((point) => point.beanTemp);
      const minTemp = Math.floor((Math.min(...temperatures) - 10) / 10) * 10;
      const maxTemp = Math.ceil((Math.max(...temperatures) + 10) / 10) * 10;
      const maxGas = Math.max(...profile.points.map((point) => point.gasPressure));
      const gasScaleMax = Math.max(2, Math.ceil(maxGas * 2) / 2);
      const x = (seconds: number) => pad.left + (seconds / profile.totalSeconds) * chartWidth;
      const y = (temp: number) => pad.top + ((maxTemp - temp) / (maxTemp - minTemp)) * chartHeight;
      const yGas = (gas: number) => pad.top + ((gasScaleMax - gas) / gasScaleMax) * chartHeight;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#f5f5f5";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#d6d6d6";
      context.lineWidth = 1;
      context.fillStyle = "#6f6f6f";
      context.font = "13px Pretendard, Arial, sans-serif";
      for (let index = 0; index <= 4; index += 1) {
        const gridY = pad.top + (chartHeight / 4) * index;
        context.beginPath();
        context.moveTo(pad.left, gridY);
        context.lineTo(width - pad.right, gridY);
        context.stroke();
        const label = Math.round(maxTemp - ((maxTemp - minTemp) / 4) * index);
        const gasLabel = gasScaleMax - ((gasScaleMax / 4) * index);
        context.textAlign = "start";
        context.fillText(`${label}℃`, 6, gridY + 4);
        context.textAlign = "right";
        context.fillText(`${Number(gasLabel.toFixed(1))}bar`, width - 5, gridY + 4);
      }
      context.textAlign = "start";

      [
        [profile.turningPointSeconds, "터닝"],
        [profile.firstCrackSeconds, "1차 크랙"],
        [profile.totalSeconds, "종료"],
      ].forEach(([seconds, label]) => {
        const markerX = x(Number(seconds));
        context.strokeStyle = "#a6a6a6";
        context.setLineDash([4, 5]);
        context.beginPath();
        context.moveTo(markerX, pad.top);
        context.lineTo(markerX, height - pad.bottom);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "#555555";
        const isFinish = Number(seconds) === profile.totalSeconds;
        context.textAlign = isFinish ? "right" : "start";
        context.fillText(String(label), markerX + (isFinish ? -5 : 5), pad.top + 12);
      });
      context.textAlign = "start";

      context.strokeStyle = "#777777";
      context.lineWidth = 2;
      context.setLineDash([6, 5]);
      context.beginPath();
      profile.points.forEach((point, index) => {
        const pointX = x(point.seconds);
        const pointY = yGas(point.gasPressure);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      });
      context.stroke();
      context.setLineDash([]);

      context.strokeStyle = "#111111";
      context.lineWidth = 3;
      context.beginPath();
      profile.points.forEach((point, index) => {
        const pointX = x(point.seconds);
        const pointY = y(point.beanTemp);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      });
      context.stroke();
      profile.points.forEach((point) => {
        context.beginPath();
        context.fillStyle = "#f5f5f5";
        context.strokeStyle = "#111111";
        context.lineWidth = 2;
        context.arc(x(point.seconds), y(point.beanTemp), 4, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      });

      context.fillStyle = "#6f6f6f";
      context.textAlign = "center";
      for (let seconds = 0; seconds <= profile.totalSeconds; seconds += Math.max(60, Math.round(profile.totalSeconds / 5 / 60) * 60)) {
        context.fillText(formatTime(seconds), x(seconds), height - 13);
      }
      context.textAlign = "start";
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [profile]);

  return (
    <div className="curve-wrap">
      <div className="curve-heading"><div><strong>온도와 가스 흐름</strong><span>왼쪽 축 ℃ · 오른쪽 축 bar</span></div><div className="curve-legend"><span className="temp-line" />원두 온도 <span className="gas-line" />가스 압력</div></div>
      <canvas ref={canvasRef} aria-label={`${profile.beanName} 로스팅 온도 및 가스 압력 그래프`} />
      <div className="chart-point-list" aria-label="기록된 온도와 가스 포인트">
        {profile.points.map((point) => (
          <div key={`${point.seconds}-${point.gasPressure}`}>
            <span>{formatTime(point.seconds)}</span>
            <strong>{number.format(point.beanTemp)}℃</strong>
            <em>{formatGasPressure(point.gasPressure)}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

const applicantStatusLabel: Record<ApplicantStatus, string> = {
  WAITING: "상담·대기",
  CONFIRMED: "수강 확정",
  CANCELLED: "신청 취소",
  REJECTED: "신청 반려",
  REFUNDED: "환불 완료",
};

function adminCourseStatus(course: CourseOpening): { code: string; label: string } {
  if (course.statusOverride === "CLOSED") return { code: "CLOSED", label: "접수 종료" };
  if (course.capacity !== null && course.currentApplicants >= course.capacity) {
    return { code: "FULL", label: "모집 마감" };
  }
  if (course.currentApplicants >= course.openingMinimum) {
    return { code: "OPENABLE", label: "개강 가능" };
  }
  return {
    code: "WAITING",
    label: `개강까지 ${Math.max(0, course.openingMinimum - course.currentApplicants)}명`,
  };
}

function CourseOpeningsAdminView({
  notify,
  month: controlledMonth,
  onMonthChange,
  embedded = false,
}: {
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
  month?: string;
  onMonthChange?: (month: string) => void;
  embedded?: boolean;
}) {
  const [internalMonth, setInternalMonth] = useState(today.slice(0, 7));
  const month = controlledMonth ?? internalMonth;
  const [courses, setCourses] = useState<CourseOpening[]>([]);
  const [scheduleMonths, setScheduleMonths] = useState<ScheduleMonthSummary[]>([]);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDaySummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<"create" | CourseOpening | null>(null);
  const [publicPageVisible, setPublicPageVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function changeMonth(nextMonth: string) {
    setInternalMonth(nextMonth);
    onMonthChange?.(nextMonth);
    setSelectedId(null);
  }

  const load = useCallback(async (targetMonth = month, preferredId?: number) => {
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await requestJson<{
        publicPageVisible: boolean;
        courses: CourseOpening[];
        scheduleMonths: ScheduleMonthSummary[];
        scheduleDays: ScheduleDaySummary[];
      }>(
        `/api/course-openings?month=${encodeURIComponent(targetMonth)}`,
      );
      setCourses(result.courses);
      setScheduleMonths(result.scheduleMonths);
      setScheduleDays(result.scheduleDays);
      setPublicPageVisible(result.publicPageVisible);
      setSelectedId((current) => {
        if (preferredId && result.courses.some((course) => course.id === preferredId)) return preferredId;
        if (current && result.courses.some((course) => course.id === current)) return current;
        return result.courses[0]?.id ?? null;
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [month, notify]);

  useEffect(() => {
    // Load the selected month's private administration data after the tab opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selected = courses.find((course) => course.id === selectedId) ?? null;
  const scheduleForMonth = scheduleMonths.find((summary) => summary.month === month) ?? null;

  async function saveCourse(payload: Record<string, unknown>, course?: CourseOpening) {
    setBusy(true);
    try {
      const result = await requestJson<{ id?: number }>(
        course ? `/api/course-openings/${course.id}` : "/api/course-openings",
        {
          method: course ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const savedMonth = String(payload.courseMonth);
      changeMonth(savedMonth);
      setEditor(null);
      await load(savedMonth, course?.id ?? result.id);
      notify({ kind: "ok", message: course ? "과정 정보를 수정했습니다." : "새 개강 과정을 등록했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function updatePublicPageVisibility(nextVisible: boolean) {
    setBusy(true);
    try {
      const result = await requestJson<{ publicPageVisible: boolean }>("/api/course-openings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicPageVisible: nextVisible }),
      });
      setPublicPageVisible(result.publicPageVisible);
      notify({
        kind: "ok",
        message: result.publicPageVisible
          ? "외부 개강 현황 페이지를 공개했습니다."
          : "외부 개강 현황 페이지를 숨겼습니다.",
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(course: CourseOpening) {
    if (!window.confirm(`${course.name} 과정과 등록된 신청자를 모두 삭제할까요?`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/course-openings/${course.id}`, { method: "DELETE" });
      setSelectedId(null);
      await load(month);
      notify({ kind: "ok", message: "과정을 삭제했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function addApplicant(course: CourseOpening, form: HTMLFormElement) {
    setBusy(true);
    try {
      const data = new FormData(form);
      const result = await requestJson<{ bookingMember?: { id: number; loginId: string } | null }>(`/api/course-openings/${course.id}/applicants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(data.entries())),
      });
      form.reset();
      await load(month, course.id);
      notify({
        kind: "ok",
        message: result.bookingMember
          ? `수강 확정과 함께 회원 DB에 등록했습니다. 수강생 ID: ${result.bookingMember.loginId}`
          : "수강 희망자를 등록했습니다. 공개 인원이 갱신됩니다.",
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function updateApplicant(course: CourseOpening, applicant: CourseApplicant, status: ApplicantStatus) {
    setBusy(true);
    try {
      const result = await requestJson<{ bookingMember?: { id: number; loginId: string } | null }>(`/api/course-openings/${course.id}/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: applicant.notes }),
      });
      await load(month, course.id);
      notify({
        kind: "ok",
        message: result.bookingMember
          ? `수강 확정과 함께 회원 DB에 등록했습니다. 수강생 ID: ${result.bookingMember.loginId}`
          : "신청 상태를 변경했습니다. 공개 집계에도 반영됩니다.",
      });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteApplicant(course: CourseOpening, applicant: CourseApplicant) {
    if (!window.confirm(`${applicant.applicantName} 신청 기록을 삭제할까요?`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/course-openings/${course.id}/applicants/${applicant.id}`, { method: "DELETE" });
      await load(month, course.id);
      notify({ kind: "ok", message: "신청 기록을 삭제했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (editor) {
    return (
      <section className={embedded ? "page-section opening-admin-page integrated-admin-section" : "page-section"}>
        <PageHeader
          eyebrow="개강 관리"
          title={editor === "create" ? "새 과정 등록" : "과정 정보 수정"}
          description="외부 공개 화면에 표시할 과정 정보와 모집 조건을 설정합니다."
          action={<button type="button" className="ghost-button" onClick={() => setEditor(null)}>목록으로</button>}
        />
        <CourseOpeningForm
          course={editor === "create" ? null : editor}
          defaultMonth={month}
          busy={busy}
          onSubmit={(payload) => saveCourse(payload, editor === "create" ? undefined : editor)}
        />
      </section>
    );
  }

  if (!month) {
    return <section className="page-section opening-admin-page integrated-admin-section"><div className="panel empty-state">통합 운영 월을 불러오는 중입니다.</div></section>;
  }

  return (
    <section className={embedded ? "page-section opening-admin-page integrated-admin-section" : "page-section"}>
      {embedded ? (
        <header className="integrated-section-heading">
          <div><span>02 · COURSE RECRUITMENT</span><h2>개강 모집과 수강 희망자</h2><p>같은 달의 과정 모집, 희망 인원과 게스트 공개 상태를 이어서 관리합니다.</p></div>
          <button type="button" className="primary-button small" onClick={() => setEditor("create")}>새 과정</button>
        </header>
      ) : <PageHeader
        eyebrow="외부 홈페이지 연동"
        title="실시간 개강 현황 관리"
        description="과정과 수강 희망자를 관리하면 공개 화면의 모집 인원이 30초 이내 자동 갱신됩니다."
        action={<button type="button" className="primary-button small" onClick={() => setEditor("create")}>새 과정</button>}
      />}

      <div className="opening-admin-toolbar panel">
        {!embedded && <Field label="진행 월">
          <input
            type="month"
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
          />
        </Field>}
        {embedded && <div className="opening-admin-current-month"><span>통합 기준 월</span><strong>{month}</strong><small>상단 월 선택과 연동</small></div>}
        <a className="public-preview-link" href={`/embed/course-openings?month=${month}`} target="_blank" rel="noreferrer">
          {publicPageVisible ? "게스트 공개 화면 열기 ↗" : "숨김 화면 확인 ↗"}
        </a>
      </div>

      {!embedded && scheduleMonths.length > 0 && (
        <nav className="opening-schedule-months" aria-label="등록된 스테이션 운영 월">
          <span>등록된 스테이션 일정</span>
          <div>{scheduleMonths.map((summary) => <button type="button" className={summary.month === month ? "active" : ""} key={summary.month} onClick={() => changeMonth(summary.month)}><b>{Number(summary.month.slice(5))}월</b><small>{summary.operationDays}일 · {summary.totalSlots}개</small></button>)}</div>
        </nav>
      )}

      <div className={publicPageVisible ? "opening-visibility-control panel is-visible" : "opening-visibility-control panel is-hidden"}>
        <div>
          <span className="eyebrow">외부 공개 페이지 전체 노출</span>
          <strong>{publicPageVisible ? "현재 공개 중" : "현재 숨김"}</strong>
          <p>
            {publicPageVisible
              ? "게스트가 로그인 없이 과정 일정과 모집 인원을 확인할 수 있습니다."
              : "로그인 화면의 게스트 링크와 외부 과정·인원 정보가 모두 숨겨져 있습니다."}
          </p>
        </div>
        <button
          type="button"
          className={publicPageVisible ? "danger-button" : "primary-button"}
          disabled={busy}
          aria-pressed={publicPageVisible}
          onClick={() => void updatePublicPageVisibility(!publicPageVisible)}
        >
          {busy ? "변경 중…" : publicPageVisible ? "페이지 숨기기" : "페이지 공개하기"}
        </button>
      </div>

      <section className="opening-schedule-sync panel">
        <div className="opening-schedule-sync-heading">
          <div><span className="eyebrow">예약 운영과 자동 동기화</span><h3>{month} 스테이션 운영 일정</h3><p>예약 운영에서 만든 날짜와 시간대를 이 화면에서도 함께 확인합니다.</p></div>
          <button type="button" className="ghost-button" onClick={() => setEditor("create")}>{month} 모집 과정 추가</button>
        </div>
        {scheduleForMonth ? (
          <>
            <div className="opening-schedule-kpis">
              <div><span>운영 날짜</span><strong>{scheduleForMonth.operationDays}일</strong></div>
              <div><span>전체 시간대</span><strong>{scheduleForMonth.totalSlots}개</strong></div>
              <div><span>예약 가능</span><strong>{scheduleForMonth.openSlots}개</strong></div>
              <div><span>휴강 · 차단</span><strong>{scheduleForMonth.blockedSlots}개</strong></div>
            </div>
            <div className="opening-schedule-days" aria-label={`${month} 날짜별 스테이션 일정`}>
              {scheduleDays.map((day) => <article key={day.date} className={day.openSlots ? "open" : "blocked"}><strong>{Number(day.date.slice(8))}일</strong><span>예약 가능 {day.openSlots}</span>{day.blockedSlots > 0 && <small>휴강 {day.blockedSlots}</small>}</article>)}
            </div>
          </>
        ) : <div className="opening-schedule-empty">이 달에는 등록된 스테이션 운영 일정이 없습니다.</div>}
      </section>

      {loading ? <div className="panel empty-state">개강 정보를 불러오는 중입니다.</div> : courses.length ? (
        <div className="opening-admin-layout">
          <aside className="opening-course-list" aria-label="과정 목록">
            {courses.map((course) => {
              const status = adminCourseStatus(course);
              return (
                <button
                  type="button"
                  key={course.id}
                  className={selectedId === course.id ? "opening-course-option active" : "opening-course-option"}
                  onClick={() => setSelectedId(course.id)}
                >
                  <span>{course.category.replaceAll("_", " ")}</span>
                  <strong>{course.name}</strong>
                  <small>{course.currentApplicants}명 / 개강 기준 {course.openingMinimum}명</small>
                  <em className={`opening-status ${status.code.toLowerCase()}`}>{status.label}</em>
                </button>
              );
            })}
          </aside>

          {selected && (
            <article className="panel opening-course-detail">
              <div className="panel-heading opening-detail-heading">
                <div>
                  <span className="eyebrow">{selected.courseMonth} · 표시 순서 {selected.displayOrder}</span>
                  <h3>{selected.name}</h3>
                  <p>{selected.isPublic ? "외부 공개 중" : "관리자에게만 표시"} · {adminCourseStatus(selected).label}</p>
                </div>
                <div className="button-row">
                  <button type="button" className="ghost-button" onClick={() => setEditor(selected)}>과정 수정</button>
                  <button type="button" className="danger-button" disabled={busy} onClick={() => void deleteCourse(selected)}>과정 삭제</button>
                </div>
              </div>

              <div className="opening-kpi-grid">
                <div><span>현재 모집 인원</span><strong>{selected.currentApplicants}명</strong></div>
                <div><span>개강 기준</span><strong>{selected.openingMinimum}명</strong></div>
                <div><span>전체 정원</span><strong>{selected.capacity === null ? "미설정" : `${selected.capacity}명`}</strong></div>
                <div><span>모집 상태</span><strong>{adminCourseStatus(selected).label}</strong></div>
              </div>

              <section className="applicant-entry-section">
                <div className="panel-heading">
                  <div><span className="eyebrow">비공개 관리자 정보</span><h3>수강 희망자 추가</h3></div>
                  <span className="privacy-badge">공개 API에서 제외</span>
                </div>
                <form
                  className="applicant-entry-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addApplicant(selected, event.currentTarget);
                  }}
                >
                  <Field label="신청자 이름"><input name="applicantName" required maxLength={40} /></Field>
                  <Field label="연락처"><input name="phone" type="tel" inputMode="numeric" required placeholder="010-0000-0000" /></Field>
                  <Field label="신청 상태">
                    <select name="status" defaultValue="WAITING">
                      <option value="WAITING">상담·대기</option>
                      <option value="CONFIRMED">수강 확정</option>
                      <option value="CANCELLED">신청 취소</option>
                      <option value="REJECTED">신청 반려</option>
                      <option value="REFUNDED">환불 완료</option>
                    </select>
                  </Field>
                  <Field label="관리 메모"><input name="notes" maxLength={300} placeholder="공개되지 않습니다" /></Field>
                  <button className="primary-button" disabled={busy}>{busy ? "처리 중…" : "신청자 추가"}</button>
                </form>
              </section>

              <section className="applicant-list-section">
                <div className="panel-heading">
                  <div><span className="eyebrow">신청 상태 관리</span><h3>등록 인원 {selected.applicants.length}명</h3></div>
                  <small>대기·확정 상태만 공개 인원에 포함됩니다.</small>
                </div>
                {selected.applicants.length ? (
                  <div className="applicant-list">
                    {selected.applicants.map((applicant) => (
                      <div className="applicant-row" key={applicant.id}>
                        <div className="applicant-identity">
                          <strong>{applicant.applicantName}</strong>
                          <span>연락처 끝 4자리 · {applicant.phoneLast4}</span>
                          {applicant.memberLoginId && <small className="course-member-linked">회원 DB 등록 완료 · {applicant.memberLoginId}</small>}
                          {applicant.notes && <small>{applicant.notes}</small>}
                        </div>
                        <select
                          aria-label={`${applicant.applicantName} 신청 상태`}
                          value={applicant.status}
                          disabled={busy}
                          onChange={(event) => void updateApplicant(selected, applicant, event.target.value as ApplicantStatus)}
                        >
                          {Object.entries(applicantStatusLabel).map(([value, label]) => (
                            <option value={value} key={value}>{label}</option>
                          ))}
                        </select>
                        <button type="button" className="staff-delete-button" disabled={busy} onClick={() => void deleteApplicant(selected, applicant)}>삭제</button>
                      </div>
                    ))}
                  </div>
                ) : <div className="empty-state compact">아직 등록된 수강 희망자가 없습니다.</div>}
              </section>
            </article>
          )}
        </div>
      ) : (
        <div className="panel empty-state">
          <strong>{month}에 등록된 과정이 없습니다.</strong>
          <span>{scheduleForMonth ? "스테이션 일정은 정상 등록되어 있습니다. 모집 과정을 추가하면 개강 현황에도 함께 표시됩니다." : "‘새 과정’을 눌러 첫 모집 과정을 등록하세요."}</span>
        </div>
      )}
    </section>
  );
}

function CourseOpeningForm({
  course,
  defaultMonth,
  busy,
  onSubmit,
}: {
  course: CourseOpening | null;
  defaultMonth: string;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <form
      className="panel course-opening-form"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
        payload.isPublic = formData.get("isPublic") === "on";
        void onSubmit(payload);
      }}
    >
      <div className="course-form-intro">
        <span className="eyebrow">공개 모집 정보</span>
        <h3>{course ? course.name : "Q Grader 기본값으로 시작"}</h3>
        <p>전체 정원은 선택 입력이며, 미설정 시 공개 화면에도 표시하지 않습니다.</p>
      </div>
      <div className="course-form-grid">
        <Field label="과정명"><input name="name" required maxLength={80} defaultValue={course?.name ?? "Q Grader"} /></Field>
        <Field label="과정 유형">
          <select name="category" defaultValue={course?.category ?? "Q_GRADER"}>
            <option value="Q_GRADER">Q Grader</option>
            <option value="BARISTA">바리스타</option>
            <option value="SCA">SCA</option>
            <option value="ROASTING">로스팅</option>
            <option value="OTHER">기타</option>
          </select>
        </Field>
        <Field label="진행 월"><input name="courseMonth" type="month" required defaultValue={course?.courseMonth ?? defaultMonth} /></Field>
        <Field label="개강 기준 인원"><input name="openingMinimum" type="number" min="1" required defaultValue={course?.openingMinimum ?? 6} /></Field>
        <Field label="전체 정원 (선택)"><input name="capacity" type="number" min="1" defaultValue={course?.capacity ?? ""} /></Field>
        <Field label="모집 상태">
          <select name="statusOverride" defaultValue={course?.statusOverride ?? "AUTO"}>
            <option value="AUTO">인원에 따라 자동 계산</option>
            <option value="CLOSED">접수 종료</option>
          </select>
        </Field>
        <Field label="모집 시작일"><input name="recruitmentStartDate" type="date" defaultValue={course?.recruitmentStartDate ?? ""} /></Field>
        <Field label="모집 종료일"><input name="recruitmentEndDate" type="date" defaultValue={course?.recruitmentEndDate ?? ""} /></Field>
        <Field label="표시 순서"><input name="displayOrder" type="number" min="0" defaultValue={course?.displayOrder ?? 0} /></Field>
        <Field label="교육시간"><input name="durationHours" type="number" min="0" defaultValue={course?.durationHours ?? 48} /></Field>
        <Field label="수강료"><input name="tuition" type="number" min="0" step="1000" defaultValue={course?.tuition ?? 1500000} /></Field>
        <Field label="비용 안내"><input name="feeNote" maxLength={100} defaultValue={course?.feeNote ?? "시험비 별도"} /></Field>
      </div>
      <label className="course-public-toggle">
        <input name="isPublic" type="checkbox" defaultChecked={course ? Boolean(course.isPublic) : true} />
        <span><strong>외부 홈페이지 공개</strong><small>켜면 게스트 화면과 공개 API에 과정이 표시됩니다.</small></span>
      </label>
      <div className="button-row form-actions">
        <button className="primary-button" disabled={busy}>{busy ? "저장 중…" : course ? "변경 내용 저장" : "과정 등록"}</button>
      </div>
    </form>
  );
}

function StaffView({
  currentUserId,
  notify,
}: {
  currentUserId: number;
  notify: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await requestJson<{ staff: StaffMember[]; audits: AuditLog[] }>("/api/staff");
      setStaff(result.staff);
      setAudits(result.audits);
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    }
  }, [notify]);

  useEffect(() => {
    // Fetch staff and audit records when the admin workspace opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    try {
      await requestJson("/api/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      formElement.reset();
      await load();
      notify({ kind: "ok", message: "직원이 등록되어 바로 로그인할 수 있습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function updateStaff(
    member: StaffMember,
    patch: Partial<
      Pick<
        StaffMember,
        "role" | "active" | "canFinance" | "canInventory" | "canRoasting"
      >
    >,
  ) {
    try {
      await requestJson("/api/staff", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          role: patch.role ?? member.role,
          canFinance: Boolean(patch.canFinance ?? member.canFinance),
          canInventory: Boolean(patch.canInventory ?? member.canInventory),
          canRoasting: Boolean(patch.canRoasting ?? member.canRoasting),
          active: Boolean(patch.active ?? member.active),
        }),
      });
      await load();
      notify({ kind: "ok", message: "직원 권한이 변경됐습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    }
  }

  async function deleteStaff(member: StaffMember) {
    if (!window.confirm(`${member.name} 직원을 삭제할까요?\n기존 운영 기록의 작성자 이름은 유지됩니다.`)) return;
    setDeletingId(member.id);
    try {
      await requestJson("/api/staff", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: member.id }),
      });
      await load();
      notify({ kind: "ok", message: `${member.name} 직원이 삭제됐습니다.` });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="page-section">
      <PageHeader
        eyebrow="권한 관리"
        title="직원 권한 관리"
        description="직원 구분과 메뉴 권한을 수정하거나 더 이상 사용하지 않는 계정을 안전하게 삭제합니다."
      />
      <div className="staff-layout">
        <article className="panel staff-form">
          <div className="panel-heading"><div><span className="eyebrow">직원 등록</span><h3>새 직원</h3></div></div>
          <form onSubmit={addStaff}>
            <Field label="이름"><input name="name" required maxLength={40} /></Field>
            <Field label="휴대폰 번호"><input name="phone" type="tel" inputMode="numeric" placeholder="010-0000-0000" required /></Field>
            <Field label="직원 구분">
              <select name="role" defaultValue="instructor">
                <option value="instructor">시간강사(남부)</option>
                <option value="employee">정규직원</option>
                <option value="admin">관리자 · 모든 메뉴</option>
              </select>
            </Field>
            <fieldset className="permission-fieldset">
              <legend>추가 메뉴 권한</legend>
              <p>수업 기록은 기본으로 제공됩니다.</p>
              <div className="permission-grid">
                {permissionOptions.map((permission) => (
                  <label className="permission-choice" key={permission.field}>
                    <input name={permission.field} type="checkbox" />
                    <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="primary-button" disabled={busy}>{busy ? "등록 중…" : "직원 등록"}</button>
          </form>
        </article>
        <article className="panel staff-list-panel">
          <div className="panel-heading"><div><span className="eyebrow">등록 직원</span><h3>직원 목록</h3></div><span className="count-badge">{staff.filter((member) => member.active).length}명 사용 중</span></div>
          <div className="staff-list">
            {staff.map((member) => (
              <div className={member.active ? "staff-row" : "staff-row inactive"} key={member.id}>
                <div className="staff-summary">
                  <div className="staff-avatar">{member.name.slice(0, 1)}</div>
                  <div className="staff-identity"><strong>{member.name}</strong><span>휴대폰 끝 4자리 · {member.phoneLast4}</span></div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(member.active)}
                      aria-label={`${member.name} 계정 ${member.active ? "비활성화" : "활성화"}`}
                      onChange={(event) => void updateStaff(member, { active: event.target.checked ? 1 : 0 })}
                    />
                    <span />
                  </label>
                </div>
                <div className="staff-access-controls">
                  <select value={member.role} onChange={(event) => void updateStaff(member, { role: event.target.value as Role })} aria-label={`${member.name} 직원 구분`}>
                    <option value="admin">관리자</option><option value="employee">정규직원</option><option value="instructor">시간강사(남부)</option>
                  </select>
                  <div className="staff-permissions" aria-label={`${member.name} 메뉴 권한`}>
                    {permissionOptions.map((permission) => (
                      <label key={permission.field}>
                        <input
                          type="checkbox"
                          checked={member.role === "admin" || Boolean(member[permission.field])}
                          disabled={member.role === "admin"}
                          onChange={(event) => void updateStaff(member, { [permission.field]: event.target.checked ? 1 : 0 })}
                        />
                        <span>{permission.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="staff-row-actions">
                  <span>변경 내용은 즉시 저장됩니다.</span>
                  <button
                    type="button"
                    className="staff-delete-button"
                    disabled={member.id === currentUserId || deletingId === member.id}
                    onClick={() => void deleteStaff(member)}
                  >
                    {member.id === currentUserId ? "현재 계정" : deletingId === member.id ? "삭제 중…" : "직원 삭제"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
      <article className="panel audit-panel">
        <div className="panel-heading"><div><span className="eyebrow">변경 기록</span><h3>최근 작업</h3></div></div>
        <div className="audit-list">
          {audits.map((entry) => (
            <div key={entry.id}><span>{formatDateTime(entry.createdAt)}</span><strong>{entry.actorName ?? "시스템"}</strong><p>{auditLabel(entry.action)} · {entry.detail || entry.entityType}</p></div>
          ))}
        </div>
      </article>
    </section>
  );
}

function MovementTable({
  movements,
  isAdmin = false,
  onUpdated,
  notify,
}: {
  movements: Movement[];
  isAdmin?: boolean;
  onUpdated?: () => Promise<void>;
  notify?: (toast: { kind: "ok" | "error"; message: string }) => void;
}) {
  const [editing, setEditing] = useState<Movement | null>(null);
  const [busyId, setBusyId] = useState<Movement["id"] | null>(null);

  function movementEndpoint(movement: Movement): string {
    if (typeof movement.id === "number") return `/api/inventory/movements/${movement.id}`;
    const legacyId = movement.id.startsWith("legacy:")
      ? movement.id.slice("legacy:".length)
      : movement.id;
    return `/api/inventory/legacy/${encodeURIComponent(legacyId)}`;
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !onUpdated || !notify) return;
    setBusyId(editing.id);
    try {
      const form = new FormData(event.currentTarget);
      if (isBeanMovement(editing)) {
        form.set(
          "quantity",
          String(kilogramsToInventoryQuantity(Number(form.get("quantity")), editing.unit)),
        );
      }
      await requestJson(movementEndpoint(editing), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      setEditing(null);
      await onUpdated();
      notify({ kind: "ok", message: "재고 기록과 현재 재고를 함께 수정했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMovement(movement: Movement) {
    if (!onUpdated || !notify) return;
    const deleteMessage = typeof movement.id === "number"
      ? `${movement.itemName} 기록을 삭제할까요? 현재 재고와 연결된 비용·영수증도 함께 정리됩니다.`
      : `${movement.itemName} 이관 기록을 삭제할까요? 기존 재고 잔량도 함께 다시 계산됩니다.`;
    if (!window.confirm(deleteMessage)) return;
    setBusyId(movement.id);
    try {
      await requestJson(movementEndpoint(movement), { method: "DELETE" });
      await onUpdated();
      notify({ kind: "ok", message: "재고 기록을 삭제하고 현재 재고를 다시 계산했습니다." });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>일자</th><th>품목</th><th>구분</th><th>수량</th><th>수업 / 메모</th><th>비용</th><th>등록자</th><th>첨부</th>{isAdmin && <th>관리</th>}</tr></thead>
          <tbody>
            {movements.length ? movements.map((movement) => {
              return (
                <tr key={movement.id}>
                  <td>{movement.movementDate}</td>
                  <td><strong>{movement.itemName}</strong></td>
                  <td><span className={`movement-badge ${movement.movementType}`}>{movementLabel[movement.movementType] ?? movement.movementType}</span></td>
                  <td className={movement.quantity < 0 ? "expense" : "income"}>{formatMovementQuantity(movement)}</td>
                  <td>{movement.className || movement.note || "—"}</td>
                  <td>{movement.costAmount ? won.format(movement.costAmount) : "—"}</td>
                  <td>{movement.createdByName}</td>
                  <td>{movement.hasReceipt
                    ? <a className="receipt-link" href={`/api/receipts/${movement.id}`} target="_blank" rel="noreferrer">영수증 보기</a>
                    : movement.receiptArchived
                      ? <span className="receipt-archived">보관 만료</span>
                      : "—"}</td>
                  {isAdmin && (
                    <td>
                      <div className="record-actions">
                        <button type="button" onClick={() => setEditing(movement)}>수정</button>
                        <button type="button" className="danger" disabled={busyId === movement.id} onClick={() => void deleteMovement(movement)}>
                          {busyId === movement.id ? "처리 중" : "삭제"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            }) : <tr><td colSpan={isAdmin ? 9 : 8} className="empty-cell">아직 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setEditing(null);
        }}>
          <article className="record-modal" role="dialog" aria-modal="true" aria-labelledby="movement-editor-title">
            <div className="record-modal-heading">
              <div><span className="eyebrow">관리자 편집</span><h3 id="movement-editor-title">재고 기록 수정</h3></div>
              <button type="button" aria-label="닫기" onClick={() => setEditing(null)}>×</button>
            </div>
            <p className="record-modal-summary"><strong>{editing.itemName}</strong> · {movementLabel[editing.movementType] ?? editing.movementType}</p>
            <form onSubmit={saveMovement}>
              <div className="two-columns">
                <Field label="날짜"><input name="movementDate" type="date" defaultValue={editing.movementDate} required /></Field>
                <Field label={`${editing.movementType === "adjust" ? "실사 변동량" : "수량"} (${isBeanMovement(editing) ? "kg" : editing.unit})`}>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min={editing.movementType === "adjust" ? undefined : "0.01"}
                    defaultValue={movementInputQuantity(editing)}
                    required
                  />
                </Field>
              </div>
              {typeof editing.id === "number" ? (
                <>
                  <Field label="수업명 (선택)"><input name="className" defaultValue={editing.className} maxLength={100} /></Field>
                  <Field label="메모 (선택)"><textarea name="note" rows={3} defaultValue={editing.note} maxLength={300} /></Field>
                </>
              ) : (
                <div className="two-columns">
                  <Field label="가공 방식 (선택)"><input name="process" defaultValue={editing.legacyProcess ?? ""} maxLength={80} /></Field>
                  <Field label="소비기한 (선택)"><input name="expiryDate" type="date" defaultValue={editing.legacyExpiryDate ?? ""} /></Field>
                </div>
              )}
              {typeof editing.id === "number" && (editing.costAmount > 0 || editing.hasReceipt > 0) && (
                <Field label="결제 금액"><div className="input-suffix"><input name="costAmount" type="number" min="1" step="1" defaultValue={editing.costAmount} required /><span>원</span></div></Field>
              )}
              {typeof editing.id === "number" && editing.hasReceipt > 0 && <p className="linked-record-note">영수증과 지출 내역이 연결되어 있습니다. 날짜·금액 수정 시 함께 반영됩니다.</p>}
              <div className="record-modal-actions">
                <button type="button" className="ghost-button" onClick={() => setEditing(null)}>취소</button>
                <button className="primary-button" disabled={busyId === editing.id}>{busyId === editing.id ? "저장 중…" : "수정 저장"}</button>
              </div>
            </form>
          </article>
        </div>
      )}
    </>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action && <div className="page-action">{action}</div>}
    </header>
  );
}

function KpiCard({
  label,
  value,
  meta,
  tone = "light",
}: {
  label: string;
  value: string;
  meta: string;
  tone?: "light" | "dark" | "green" | "alert";
}) {
  return <article className={`kpi-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? "metric accent" : "metric"}><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function PresetOrCustomField({
  name,
  label,
  options,
  initialValue = "",
  required = false,
  customPlaceholder,
}: {
  name: string;
  label: string;
  options: readonly string[];
  initialValue?: string;
  required?: boolean;
  customPlaceholder: string;
}) {
  const customKey = "__custom__";
  const matched = options.includes(initialValue);
  const [choice, setChoice] = useState(matched ? initialValue : initialValue ? customKey : options[0] ?? customKey);
  const [customValue, setCustomValue] = useState(matched ? "" : initialValue);
  const value = choice === customKey ? customValue.trim() : choice;

  return (
    <Field label={label}>
      <input type="hidden" name={name} value={value} />
      <div className="preset-options" role="radiogroup" aria-label={`${label} 선택`}>
        {options.map((option) => (
          <button type="button" role="radio" aria-checked={choice === option} className={choice === option ? "active" : ""} key={option || "blank"} onClick={() => setChoice(option)}>{option || "미지정"}</button>
        ))}
        <button type="button" role="radio" aria-checked={choice === customKey} className={choice === customKey ? "active" : ""} onClick={() => setChoice(customKey)}>기타</button>
      </div>
      {choice === customKey && <input className="preset-custom-input" value={customValue} onChange={(event) => setCustomValue(event.target.value)} placeholder={customPlaceholder} required={required} autoFocus />}
    </Field>
  );
}

function Toast({ toast }: { toast: { kind: "ok" | "error"; message: string } }) {
  return <div className={`toast ${toast.kind}`} role="status"><span>{toast.kind === "ok" ? "완료" : "확인"}</span>{toast.message}</div>;
}

async function requestJson<T = { ok: boolean }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}

async function optimizeReceipt(source: File): Promise<File> {
  const image = await loadReceiptImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 최적화할 수 없습니다.");
  let maxSide = 1400;
  let quality = 0.76;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("이미지 변환에 실패했습니다.")),
        "image/jpeg",
        quality,
      );
    });
    if (blob.size <= 350_000) break;
    maxSide = Math.round(maxSide * 0.82);
    quality = Math.max(0.58, quality - 0.07);
  }
  image.close();
  if (!blob || blob.size > 400_000) {
    throw new Error("영수증 이미지를 400KB 이하로 줄일 수 없습니다. 다른 사진을 선택해 주세요.");
  }
  return new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
}

async function loadReceiptImage(source: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some mobile browsers decode camera images only through an HTMLImageElement.
    }
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = "async";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이 기기에서 영수증 이미지를 읽을 수 없습니다."));
      element.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + Number(value), 0);
}

function inventoryOptionLabel(item: InventoryItem): string {
  const amount = inventoryItemAmount(item);
  const name = item.lot ? `${item.name} · LOT ${item.lot}` : item.name;
  return `[${categoryLabel[item.category]}] ${name} · 현재 ${amount.value}${amount.unit}`;
}

function inventoryItemAmount(item: InventoryItem, quantity = item.quantity) {
  return item.category === "roasted" || item.category === "gusto"
    ? formatBeanAmount(quantity, item.unit)
    : formatInventoryAmount(quantity, item.unit);
}

function isBeanMovement(movement: Movement): boolean {
  return movement.itemCategory === "roasted" || movement.itemCategory === "gusto";
}

function formatMovementQuantity(movement: Movement): string {
  return isBeanMovement(movement)
    ? formatBeanQuantity(movement.quantity, movement.unit, true)
    : formatSignedInventoryQuantity(movement.quantity, movement.unit);
}

function movementInputQuantity(movement: Movement): number {
  const quantity = isBeanMovement(movement)
    ? inventoryQuantityInKilograms(movement.quantity, movement.unit)
    : movement.quantity;
  return movement.movementType === "adjust" ? quantity : Math.abs(quantity);
}

function formatDateOnly(value: string | null | undefined): string | null {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB";
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))}KB`;
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
}

function currentKoreanDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function roastPointAt(
  points: RoastPoint[],
  seconds: number,
  fallback: Pick<RoastPoint, "beanTemp" | "gasPressure">,
): Pick<RoastPoint, "beanTemp" | "gasPressure"> {
  const exact = points.find((point) => point.seconds === seconds);
  if (exact) return { beanTemp: exact.beanTemp, gasPressure: exact.gasPressure };
  if (points.length < 2) return fallback;
  return interpolateRoastPoint(points, seconds);
}

type GasAdjustment = RoastPoint & { previousGasPressure: number | null };

function getGasAdjustments(points: RoastPoint[], totalSeconds: number): GasAdjustment[] {
  const pointsBySecond = new Map<number, RoastPoint>();
  [...points]
    .filter((point) => (
      [point.seconds, point.beanTemp, point.gasPressure].every(Number.isFinite)
      && point.seconds >= 0
      && point.seconds <= totalSeconds
    ))
    .sort((left, right) => left.seconds - right.seconds)
    .forEach((point) => pointsBySecond.set(point.seconds, point));

  const ordered = [...pointsBySecond.values()];
  return ordered.reduce<GasAdjustment[]>((adjustments, point, index) => {
    const previous = ordered[index - 1];
    if (previous && Math.abs(point.gasPressure - previous.gasPressure) < 0.001) return adjustments;
    adjustments.push({
      ...point,
      previousGasPressure: previous?.gasPressure ?? null,
    });
    return adjustments;
  }, []);
}

function interpolateRoastPoint(
  points: RoastPoint[],
  seconds: number,
): Pick<RoastPoint, "beanTemp" | "gasPressure"> {
  const ordered = [...points].sort((left, right) => left.seconds - right.seconds);
  const before = [...ordered].reverse().find((point) => point.seconds < seconds);
  const after = ordered.find((point) => point.seconds > seconds);
  if (!before) return { beanTemp: ordered[0]?.beanTemp ?? 0, gasPressure: ordered[0]?.gasPressure ?? 0 };
  if (!after) return { beanTemp: before.beanTemp, gasPressure: before.gasPressure };
  const ratio = (seconds - before.seconds) / (after.seconds - before.seconds);
  return {
    beanTemp: Number((before.beanTemp + ((after.beanTemp - before.beanTemp) * ratio)).toFixed(1)),
    gasPressure: Number((before.gasPressure + ((after.gasPressure - before.gasPressure) * ratio)).toFixed(1)),
  };
}

function formatEditableNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "";
}

function clampNumber(value: number, min?: string, max?: string, integer = false): number {
  const minimum = min === undefined ? Number.NEGATIVE_INFINITY : Number(min);
  const maximum = max === undefined ? Number.POSITIVE_INFINITY : Number(max);
  const normalized = integer ? Math.round(value) : value;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function flowKindOrder(kind: RoastFlowPoint["kind"]): number {
  return { charge: 0, turning: 1, extra: 2, firstCrack: 3, finish: 4 }[kind];
}

function validateRoastFlow(
  points: RoastPoint[],
  turningSeconds: number,
  firstCrackSeconds: number,
  finishSeconds: number,
): string | null {
  if (!(turningSeconds > 0 && turningSeconds < firstCrackSeconds && firstCrackSeconds < finishSeconds)) {
    return "시간 순서를 확인해 주세요. 투입 → 터닝포인트 → 1차 크랙 → 종료 순서여야 합니다.";
  }
  if (points.some((point) => ![point.seconds, point.beanTemp, point.gasPressure].every(Number.isFinite))) {
    return "시간·온도·가스 값을 모두 숫자로 입력해 주세요.";
  }
  if (points.some((point) => point.seconds < 0 || point.seconds > finishSeconds)) {
    return "모든 중간 포인트는 투입 이후, 종료 이전 시간으로 입력해 주세요.";
  }
  if (new Set(points.map((point) => point.seconds)).size !== points.length) {
    return "같은 시간에 두 포인트가 있습니다. 각 포인트 시간을 다르게 입력해 주세요.";
  }
  if (points.some((point) => point.beanTemp < 0 || point.gasPressure < 0 || point.gasPressure > 5)) {
    return "온도는 0℃ 이상, 가스 압력은 0~5bar 범위로 입력해 주세요.";
  }
  return null;
}

function formatTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes && remainingSeconds) return `${minutes}분 ${remainingSeconds}초`;
  if (minutes) return `${minutes}분`;
  return `${remainingSeconds}초`;
}

function formatGasPressure(value: number): string {
  return `${Number(value.toFixed(2))}bar`;
}

function formatDateTime(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    bootstrap_admin: "최초 관리자 등록",
    login: "로그인",
    create_staff: "직원 등록",
    update_staff: "권한 변경",
    delete_staff: "직원 삭제",
    create_finance: "장부 입력",
    update_finance: "장부 수정",
    delete_finance: "장부 삭제",
    create_item: "품목 추가",
    create_item_with_stock: "품목 등록 · 입고",
    update_inventory_item: "품목 정보 수정",
    hide_inventory_item: "품목 숨김",
    inventory_movement: "재고 변동",
    update_inventory_record: "재고 기록 수정",
    delete_inventory_record: "재고 기록 삭제",
    update_legacy_inventory_record: "이관 재고 수정",
    delete_legacy_inventory_record: "이관 재고 삭제",
    class_consumption: "수업 사용",
    milk_purchase: "우유 구매",
    roast_inventory: "생두 출고 · 원두 입고",
    create_roast_profile: "프로파일 생성",
    update_roast_profile: "프로파일 수정",
    delete_roast_profile: "프로파일 삭제",
    create_course_opening: "개강 과정 등록",
    update_course_opening: "개강 과정 수정",
    delete_course_opening: "개강 과정 삭제",
    create_course_applicant: "수강 희망자 등록",
    update_course_applicant: "신청 상태 변경",
    delete_course_applicant: "신청 기록 삭제",
    update_public_course_openings_visibility: "외부 개강 현황 노출 변경",
  };
  return labels[action] ?? action;
}
