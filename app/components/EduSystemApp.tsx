"use client";

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

type Role = "admin" | "employee" | "instructor";
type TabKey = "dashboard" | "record" | "inventory" | "finance" | "roasting" | "staff";

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
    user: User | null;
  }>({ loading: true, bootstrapRequired: false, user: null });
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<TabKey[]>([]);

  const loadAuth = useCallback(async () => {
    try {
      const status = await requestJson<{ bootstrapRequired: boolean; user: User | null }>(
        "/api/auth/status",
      );
      setAuthState({ loading: false, ...status });
      if (status.user) {
        setNavigationHistory([]);
        setActiveTab(initialTab(status.user));
      }
    } catch (error) {
      setAuthState({ loading: false, bootstrapRequired: false, user: null });
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
      setAuthState({ loading: false, bootstrapRequired: false, user: result.user });
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
      setAuthState((current) => ({ ...current, user: null }));
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
          <button type="button" onClick={goHome} disabled={activeTab === homeTab}>홈</button>
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
            <button type="button" onClick={goHome} disabled={activeTab === homeTab}>홈</button>
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
  busy,
  onSubmit,
}: {
  bootstrapRequired: boolean;
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
  const selectedMonthKey = `${year}-${String(month).padStart(2, "0"…24427 tokens truncated…async function saveMovement(event: FormEvent<HTMLFormElement>) {
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
  };
  return labels[action] ?? action;
}
