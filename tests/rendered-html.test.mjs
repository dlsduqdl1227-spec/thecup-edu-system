import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the branded reservation portal and preserves the monochrome admin application", async () => {
  const [
    page,
    adminPage,
    layout,
    app,
    bookingPortal,
    styles,
    hosting,
    packageJson,
    socialImage,
    thecupLogo,
    coffeeLogo,
  ] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/components/EduSystemApp.tsx", root), "utf8"),
    readFile(new URL("app/components/BookingPortal.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("public/og.png", root)),
    readFile(new URL("public/brand/thecup-edu.jpg", root)),
    readFile(new URL("public/brand/monthly-coffee.png", root)),
  ]);

  assert.match(page, /BookingPortal/);
  assert.match(adminPage, /EduSystemApp/);
  assert.match(layout, /더컵에듀 커피 스테이션/);
  assert.match(layout, /lang="ko"/);
  assert.match(app, /brand\/thecup-edu\.jpg/);
  assert.match(app, /brand\/monthly-coffee\.png/);
  assert.match(app, /수업 사용 기록/);
  assert.match(app, /로스팅 프로파일/);
  assert.match(app, /예약 운영/);
  assert.match(bookingPortal, /수업 예정자/);
  assert.match(bookingPortal, /수강생 로그인/);
  assert.match(bookingPortal, /운영자 로그인/);
  assert.match(bookingPortal, /portal-calendar/);
  assert.match(app, /복사해서 새로 만들기/);
  assert.match(app, /프로파일 복사본 만들기/);
  assert.match(app, /mode === "edit" \? "PATCH" : "POST"/);
  assert.match(app, /새 프로파일로 저장/);
  assert.match(app, /프로파일 목록/);
  assert.match(app, /끌어서 이동 · ↑↓ 버튼/);
  assert.match(app, /api\/roasting\/order/);
  assert.match(app, /draggable=\{!savingOrder\}/);
  assert.match(app, /자동 계산 디벨롭/);
  assert.match(app, /터닝포인트/);
  assert.match(app, /한눈에 따라하기/);
  assert.match(app, /실제 화력 조절 기록/);
  assert.match(app, /getGasAdjustments/);
  assert.match(app, /화력 높임/);
  assert.match(app, /화력 낮춤/);
  assert.match(app, /RoastFlowCard/);
  assert.match(app, /StableNumberInput/);
  assert.match(app, /실제 로스팅 순서대로/);
  assert.match(app, /key=\{point\.stableId\}/);
  assert.doesNotMatch(app, /key=\{`\$\{index\}-\$\{point\.seconds\}`\}/);
  assert.match(app, /왼쪽 축 ℃ · 오른쪽 축 bar/);
  assert.doesNotMatch(app, /옐로잉|yellowingSeconds/);
  assert.match(app, /가스나 온도가 바뀌는 순간만 세부 포인트/);
  assert.match(app, /가스 압력/);
  assert.match(app, /chargeGasPressure/);
  assert.match(app, /`\$\{minutes\}분 \$\{remainingSeconds\}초`/);
  assert.doesNotMatch(app, /가스 압력\(%\)|투입 80%/);
  assert.match(app, /로스팅\(원두\)/);
  assert.match(app, /새 품목 입고/);
  assert.match(app, /create_item_with_stock/);
  assert.match(app, /재고 작업 선택/);
  assert.match(app, /재고 현황/);
  assert.match(app, /생두 재고/);
  assert.match(app, /원두 재고/);
  assert.match(app, /생두 출고와 완성 원두 입고를 함께 반영/);
  assert.match(app, /inline-roast-workflow/);
  assert.doesNotMatch(app, /\{ key: "roasting", label: "로스팅" \}/);
  assert.doesNotMatch(app, /\{ key: "new", label: "새 품목" \}/);
  assert.match(app, /소비기한 임박순/);
  assert.match(app, /확인 필요 우선/);
  assert.match(app, /수량 적은 순/);
  assert.match(app, /수량 많은 순/);
  assert.match(app, /compareInventoryItems/);
  assert.match(app, /formatInventoryAmount/);
  assert.match(app, /← 이전/);
  assert.match(app, />홈</);
  assert.match(app, /시간강사\(남부\)/);
  assert.match(app, /직원 삭제/);
  assert.doesNotMatch(app, /더컵 볶은 원두/);
  assert.match(app, /title="매출 내역"/);
  assert.match(app, /2022년부터 현재까지/);
  assert.match(app, /CSV 2022–2026 이관 완료/);
  assert.match(app, /월별 상세/);
  assert.match(app, /role="tablist"/);
  assert.match(app, /monthly-detail-content/);
  assert.match(app, /CSV 기준 매출/);
  assert.match(app, /월별 상세 내역/);
  assert.match(app, /CSV 월 지출 합계/);
  assert.match(app, /CSV 지출 1건/);
  assert.match(app, /selectedMonthHasCsvExpense/);
  assert.match(app, /해당 연도의 12개월을 기준으로 계산했습니다/);
  assert.match(app, /\{quarter\}분기/);
  assert.doesNotMatch(app, /숫자가 말해주는 오늘의 운영|Q\{quarter\}/);
  assert.match(app, /직원 전용/);
  assert.doesNotMatch(app, /OPERATIONS, REFINED|개월 매출 이관|단계 권한 분리/);
  assert.match(app, /Asia\/Seoul/);
  assert.match(app, /capture="environment"/);
  assert.match(app, /선택한 영수증 미리보기/);
  assert.match(app, /내가 등록한 기록만 표시됩니다/);
  assert.match(app, /전체 직원의 우유 입고·수업 사용 기록과 등록자/);
  assert.match(app, /name="beanQuantityKg"/);
  assert.match(app, /500g은 <strong>0\.5kg<\/strong>/);
  assert.doesNotMatch(app, /원두 사용 \(g\)/);
  assert.match(app, /전체 매출 Excel/);
  assert.match(app, /전체 재고 Excel/);
  assert.match(app, /api\/exports\/finance/);
  assert.match(app, /api\/exports\/inventory/);
  assert.match(app, /재고 기록 수정/);
  assert.match(app, /품목 정보 수정/);
  assert.match(app, /api\/inventory\/items\//);
  assert.match(app, /매출 및 지출 등록/);
  assert.match(app, /매출·지출 기록 수정/);
  assert.match(app, /api\/inventory\/legacy/);
  assert.doesNotMatch(app, /event\.currentTarget\.reset\(\)/);
  assert.match(styles, /--ink: #111111/);
  assert.match(styles, /\.brand-lockup/);
  assert.match(styles, /\.brand-logo-coffee img/);
  assert.match(styles, /Pretendard Variable/);
  assert.match(styles, /\.inventory-tabs/);
  assert.match(styles, /\.month-tabs/);
  assert.match(styles, /\.monthly-summary-grid/);
  assert.match(styles, /\.monthly-transaction-list/);
  assert.match(styles, /\.csv-expense-entry/);
  assert.match(styles, /\.inventory-sections/);
  assert.match(styles, /\.inventory-section-heading/);
  assert.match(styles, /\.inventory-entry-switch/);
  assert.match(styles, /\.inline-roast-workflow/);
  assert.match(styles, /\.profile-drag-handle/);
  assert.match(styles, /\.profile-order-actions/);
  assert.match(styles, /\.export-button/);
  assert.match(styles, /\.quantity-helper/);
  assert.match(styles, /\.inventory-overview-controls/);
  assert.match(styles, /\.inventory-sort-control/);
  assert.match(styles, /\.inventory-card-controls/);
  assert.match(styles, /\.inventory-item-modal-actions/);
  assert.match(styles, /\.duration-input/);
  assert.match(styles, /\.chart-point-list/);
  assert.match(styles, /\.roast-bean-grid/);
  assert.match(styles, /\.roast-flow-list/);
  assert.match(styles, /\.roast-flow-card/);
  assert.match(styles, /\.roast-follow-guide/);
  assert.match(styles, /\.roast-step-card/);
  assert.match(styles, /\.roast-gas-guide/);
  assert.match(styles, /\.roast-gas-list/);
  assert.match(styles, /\.roast-gas-pressure/);
  assert.match(styles, /\.copy-profile-notice/);
  assert.match(styles, /\.live-development/);
  assert.match(styles, /body \{[\s\S]*?font-size: 16px/);
  assert.match(styles, /\.roast-flow-fields/);
  assert.doesNotMatch(styles, /\.point-row|\.milestone-grid/);
  assert.match(styles, /\.mobile-history-nav/);
  assert.match(styles, /\.staff-delete-button/);
  assert.doesNotMatch(styles, /#17483b|#d9613e|#f3f0e7/i);
  assert.doesNotMatch(`${page}\n${adminPage}\n${layout}\n${app}\n${bookingPortal}`, /codex-preview|Your site is taking shape|SkeletonPreview/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"fflate": "0\.8\.3"/);
  assert.equal(socialImage.readUInt32BE(16), 1536);
  assert.equal(socialImage.readUInt32BE(20), 1024);
  assert.equal(thecupLogo.readUInt16BE(0), 0xffd8);
  assert.equal(coffeeLogo.readUInt32BE(16), 284);
  assert.equal(coffeeLogo.readUInt32BE(20), 284);

  const bindings = JSON.parse(hosting);
  assert.equal(bindings.d1, "DB");
  assert.equal(bindings.r2, null);
});

test("admin record routes preserve linked inventory, finance and receipt data", async () => {
  const [movementRoute, itemRoute, legacyRoute, legacyAdmin, financeRoute, adminRecords, milkPurchase, receiptRoute, imageSignature] = await Promise.all([
    readFile(new URL("app/api/inventory/movements/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/items/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/legacy/[id]/route.ts", root), "utf8"),
    readFile(new URL("lib/legacy-admin.ts", root), "utf8"),
    readFile(new URL("app/api/finance/route.ts", root), "utf8"),
    readFile(new URL("lib/admin-records.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/milk-purchase/route.ts", root), "utf8"),
    readFile(new URL("app/api/receipts/[id]/route.ts", root), "utf8"),
    readFile(new URL("lib/image-signature.ts", root), "utf8"),
  ]);

  assert.match(movementRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(movementRoute, /export async function PATCH/);
  assert.match(movementRoute, /export async function DELETE/);
  assert.match(itemRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(itemRoute, /export async function PATCH/);
  assert.match(itemRoute, /export async function DELETE/);
  assert.match(itemRoute, /classificationChanged/);
  assert.match(itemRoute, /SET active = 0/);
  assert.match(itemRoute, /update_inventory_item/);
  assert.match(itemRoute, /hide_inventory_item/);
  assert.match(legacyRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(legacyRoute, /mutateLegacyInventoryEntry/);
  assert.match(legacyAdmin, /UPDATE inventory_items/);
  assert.match(legacyAdmin, /DELETE FROM entries/);
  assert.match(financeRoute, /update_finance/);
  assert.match(financeRoute, /delete_finance/);
  assert.match(adminRecords, /DELETE FROM receipt_files/);
  assert.match(adminRecords, /DELETE FROM finance_transactions/);
  assert.match(adminRecords, /UPDATE inventory_items SET quantity/);
  assert.match(milkPurchase, /hasValidImageSignature/);
  assert.match(receiptRoute, /content-length/);
  assert.match(receiptRoute, /user\.canFinance/);
  assert.match(receiptRoute, /user\.role !== "instructor"/);
  assert.match(imageSignature, /image\/jpeg/);
  assert.match(imageSignature, /image\/png/);
  assert.match(imageSignature, /image\/webp/);
});

test("migration covers identity, finance, inventory, receipts and roasting", async () => {
  const [migration, turningPointMigration, profileOrderMigration] = await Promise.all([
    readFile(new URL("drizzle/0000_mixed_night_nurse.sql", root), "utf8"),
    readFile(new URL("drizzle/0007_natural_mantis.sql", root), "utf8"),
    readFile(new URL("drizzle/0008_hard_roughhouse.sql", root), "utf8"),
  ]);
  for (const table of [
    "staff",
    "sessions",
    "monthly_finance",
    "finance_transactions",
    "inventory_items",
    "inventory_movements",
    "roasting_profiles",
    "roasting_points",
    "audit_logs",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
  assert.match(migration, /receipt_key/);
  assert.match(migration, /development_ratio/);
  assert.match(migration, /inventory_nonnegative_update/);
  assert.match(turningPointMigration, /turning_point_seconds/);
  assert.match(profileOrderMigration, /ADD `sort_order` integer/);
});

test("public course openings are read-only, privacy-safe and iframe-ready", async () => {
  const [app, publicPage, publicComponent, publicRoute, adminRoute, applicantRoute, authStatusRoute, worker, styles, database, migration, visibilityMigration] = await Promise.all([
    readFile(new URL("app/components/EduSystemApp.tsx", root), "utf8"),
    readFile(new URL("app/embed/course-openings/page.tsx", root), "utf8"),
    readFile(new URL("app/components/PublicCourseOpenings.tsx", root), "utf8"),
    readFile(new URL("app/api/public/course-openings/route.ts", root), "utf8"),
    readFile(new URL("app/api/course-openings/route.ts", root), "utf8"),
    readFile(new URL("app/api/course-openings/[id]/applicants/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/status/route.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/db.ts", root), "utf8"),
    readFile(new URL("drizzle/0009_complex_drax.sql", root), "utf8"),
    readFile(new URL("drizzle/0010_optimal_otto_octavius.sql", root), "utf8"),
  ]);

  assert.match(app, /개강 관리/);
  assert.match(app, /로그인 없이 실시간 개강 현황 보기/);
  assert.match(app, /대기·확정 상태만 공개 인원에 포함/);
  assert.match(app, /외부 공개 페이지 전체 노출/);
  assert.match(app, /페이지 숨기기/);
  assert.match(app, /publicPageVisible &&/);
  assert.match(publicPage, /PublicCourseOpenings/);
  assert.match(publicComponent, /30_000/);
  assert.match(publicComponent, /잠시 후 다시 확인해 주세요/);
  assert.match(publicComponent, /현재 수강 희망 인원/);
  assert.match(publicComponent, /현재 수강 총인원/);
  assert.match(publicComponent, /월간 모집 스케줄/);
  assert.match(publicComponent, /이 달에는 등록된 공개 모집 일정이 없습니다/);
  assert.match(publicComponent, /public-calendar/);
  assert.match(publicComponent, /public-schedule-agenda/);
  assert.match(publicComponent, /개강 현황을 준비하고 있습니다/);
  assert.match(publicComponent, /!data\.isVisible/);
  assert.match(publicRoute, /c\.is_public = 1/);
  assert.match(publicRoute, /a\.status IN \('WAITING', 'CONFIRMED'\)/);
  assert.match(publicRoute, /COUNT\(DISTINCT CASE/);
  assert.match(publicRoute, /recruitment_start_date AS recruitmentStartDate/);
  assert.match(publicRoute, /recruitment_end_date AS recruitmentEndDate/);
  assert.match(publicRoute, /totalApplicants/);
  assert.match(publicRoute, /isVisible: false/);
  assert.match(publicRoute, /public_course_openings_visible/);
  assert.match(publicRoute, /public, max-age=30/);
  assert.match(publicRoute, /export const POST = methodNotAllowed/);
  assert.match(publicRoute, /export const DELETE = methodNotAllowed/);
  assert.doesNotMatch(publicRoute, /applicant_name|phone_last4|email|payment|notes|created_by/i);
  assert.match(adminRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(adminRoute, /export async function PATCH/);
  assert.match(adminRoute, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(applicantRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(authStatusRoute, /publicPageVisible/);
  assert.match(worker, /frame-ancestors 'self' https:\/\/coffeemonthly\.creatorlink\.net https:\/\/\*\.creatorlink\.net/);
  assert.match(worker, /headers\.delete\("X-Frame-Options"\)/);
  assert.match(styles, /\.public-openings-page[\s\S]*?overflow-x: hidden/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.public-course-grid/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.public-calendar[\s\S]*?display: none/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.public-schedule-agenda[\s\S]*?display: grid/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS course_openings/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS course_applicants/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS app_settings/);
  assert.match(database, /public_course_openings_visible', '0'/);
  assert.match(database, /q-grader-\$\{courseMonth\}/);
  assert.match(migration, /idx_course_applicants_course_phone/);
  assert.match(migration, /idx_course_openings_public_month/);
  assert.match(visibilityMigration, /CREATE TABLE `app_settings`/);
  assert.match(visibilityMigration, /public_course_openings_visible', '0'/);
});

test("guards critical identity, date and persistence edge cases", async () => {
  const [http, database, auth, bootstrap, login, staff, finance, inventory, milkPurchase, receiptStorage, roasting, roastingOrder, permissionsMigration, legacyMigration, deletionMigration, dashboard] = await Promise.all([
    readFile(new URL("lib/http.ts", root), "utf8"),
    readFile(new URL("lib/db.ts", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/api/auth/bootstrap/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/login/route.ts", root), "utf8"),
    readFile(new URL("app/api/staff/route.ts", root), "utf8"),
    readFile(new URL("app/api/finance/route.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/route.ts", root), "utf8"),
    readFile(new URL("app/api/inventory/milk-purchase/route.ts", root), "utf8"),
    readFile(new URL("lib/receipt-storage.ts", root), "utf8"),
    readFile(new URL("app/api/roasting/route.ts", root), "utf8"),
    readFile(new URL("app/api/roasting/order/route.ts", root), "utf8"),
    readFile(new URL("drizzle/0001_melted_scalphunter.sql", root), "utf8"),
    readFile(new URL("drizzle/0005_clean_red_skull.sql", root), "utf8"),
    readFile(new URL("drizzle/0006_nappy_winter_soldier.sql", root), "utf8"),
    readFile(new URL("app/api/dashboard/route.ts", root), "utf8"),
  ]);

  assert.match(http, /getUTCDate\(\) !== day/);
  assert.match(http, /inventory_quantity_negative/);
  assert.match(database, /CREATE TRIGGER IF NOT EXISTS inventory_nonnegative_update/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS receipt_files/);
  assert.match(auth, /requirePermission/);
  assert.match(auth, /s\.deleted_at IS NULL/);
  assert.match(bootstrap, /WHERE NOT EXISTS \(SELECT 1 FROM staff\)/);
  assert.match(login, /deleted_at IS NULL/);
  assert.match(staff, /마지막 활성 관리자의 권한/);
  assert.match(staff, /export async function DELETE/);
  assert.match(staff, /현재 로그인한 관리자 본인의 계정은 삭제할 수 없습니다/);
  assert.match(staff, /마지막 활성 관리자 계정은 삭제할 수 없습니다/);
  assert.match(staff, /DELETE FROM sessions WHERE staff_id/);
  assert.match(staff, /phone_hash = 'deleted:'/);
  assert.match(staff, /can_finance END AS canFinance/);
  assert.match(finance, /requirePermission\(request, "finance"\)/);
  assert.match(inventory, /requirePermission\(request, "inventory"\)/);
  assert.match(inventory, /create_item_with_stock/);
  assert.match(inventory, /initialQuantity/);
  assert.match(inventory, /DELETE FROM inventory_items/);
  assert.match(inventory, /item\.category === "green" && movementType === "out"/);
  assert.match(milkPurchase, /INSERT INTO receipt_files/);
  assert.match(milkPurchase, /makeRoomForReceipt/);
  assert.match(receiptStorage, /receipt_deleted_at = CURRENT_TIMESTAMP/);
  assert.match(receiptStorage, /DELETE FROM receipt_files/);
  assert.match(roasting, /requirePermission\(request, "roasting"\)/);
  assert.match(roasting, /sqlite_sequence WHERE name = 'roasting_profiles'/);
  assert.match(roasting, /COALESCE\(p\.sort_order, 2147483647\)/);
  assert.match(roastingOrder, /requireUser\(request, \["admin"\]\)/);
  assert.match(roastingOrder, /profileIds/);
  assert.match(roastingOrder, /UPDATE roasting_profiles SET sort_order/);
  const roastingParser = await readFile(new URL("lib/roasting.ts", root), "utf8");
  assert.match(roastingParser, /point\.gasPressure > 5/);
  assert.match(roastingParser, /가스 압력\(0~5bar\)/);
  assert.match(permissionsMigration, /ADD `can_finance`/);
  assert.match(permissionsMigration, /WHERE `role` IN \('admin', 'employee'\)/);
  assert.match(legacyMigration, /ADD `legacy_key`/);
  assert.match(deletionMigration, /ALTER TABLE `staff` ADD `deleted_at` text/);
  assert.match(database, /ALTER TABLE staff ADD COLUMN deleted_at TEXT/);
  assert.match(database, /readLegacyInventoryEntries/);
  assert.match(database, /summarizeLegacyInventory/);
  assert.match(database, /ensureRoastingProfileColumns/);
  assert.match(database, /ALTER TABLE roasting_profiles ADD COLUMN sort_order INTEGER/);
  assert.match(database, /ORDER BY rp\.bean_temp ASC/);
  assert.match(database, /ON CONFLICT\(legacy_key\) DO NOTHING/);
  const historicalSeeds = [...database.matchAll(
    /\{ year: (2022|2023), month: (\d+), revenue: (\d+), expense: (\d+) \}/g,
  )].map((match) => ({
    year: Number(match[1]),
    month: Number(match[2]),
    revenue: Number(match[3]),
    expense: Number(match[4]),
  }));
  assert.equal(historicalSeeds.length, 24);
  assert.deepEqual(
    historicalSeeds
      .filter((row) => row.year === 2022)
      .reduce((total, row) => ({
        revenue: total.revenue + row.revenue,
        expense: total.expense + row.expense,
      }), { revenue: 0, expense: 0 }),
    { revenue: 83774760, expense: 6125710 },
  );
  assert.deepEqual(
    historicalSeeds
      .filter((row) => row.year === 2023)
      .reduce((total, row) => ({
        revenue: total.revenue + row.revenue,
        expense: total.expense + row.expense,
      }), { revenue: 0, expense: 0 }),
    { revenue: 144425361, expense: 9044186 },
  );
  assert.match(dashboard, /legacyInventoryCount/);
  assert.match(dashboard, /ownMovementScope = user\.role === "instructor"/);
  assert.doesNotMatch(dashboard, /LIMIT 30|LIMIT 60/);
  assert.match(dashboard, /m\.revenue AS baseRevenue/);
  assert.match(dashboard, /AS additionalIncome/);
  assert.match(dashboard, /ORDER BY t\.transaction_date DESC, t\.id DESC/);
  assert.doesNotMatch(dashboard, /ORDER BY t\.id DESC LIMIT 40/);
  assert.match(dashboard, /turningPointSeconds/);
  assert.match(dashboard, /기존 재고 기록/);
  assert.match(dashboard, /소비기한/);
  assert.doesNotMatch(dashboard, /`유효 \$\{entry\.expiry_date\}`/);
});

test("Excel exports are permission-protected and include complete business data", async () => {
  const [financeExport, inventoryExport, xlsx] = await Promise.all([
    readFile(new URL("app/api/exports/finance/route.ts", root), "utf8"),
    readFile(new URL("app/api/exports/inventory/route.ts", root), "utf8"),
    readFile(new URL("lib/xlsx.ts", root), "utf8"),
  ]);
  assert.match(financeExport, /requirePermission\(request, "finance"\)/);
  assert.match(financeExport, /월별 매출/);
  assert.match(financeExport, /추가 매출·지출/);
  assert.match(inventoryExport, /requirePermission\(request, "inventory"\)/);
  assert.match(inventoryExport, /ownRecordsOnly = user\.role === "instructor"/);
  assert.match(inventoryExport, /WHERE m\.created_by = \?/);
  assert.match(inventoryExport, /readLegacyInventoryEntries/);
  assert.match(inventoryExport, /현재 재고/);
  assert.match(inventoryExport, /재고 기록/);
  assert.match(inventoryExport, /createdByName/);
  assert.match(xlsx, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(xlsx, /content-disposition/);
  assert.match(xlsx, /autoFilter/);
});
