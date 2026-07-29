import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the branded monochrome application instead of the starter preview", async () => {
  const [
    page,
    layout,
    app,
    styles,
    hosting,
    packageJson,
    socialImage,
    thecupLogo,
    coffeeLogo,
  ] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/components/EduSystemApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("public/og.png", root)),
    readFile(new URL("public/brand/thecup-edu.jpg", root)),
    readFile(new URL("public/brand/monthly-coffee.png", root)),
  ]);

  assert.match(page, /EduSystemApp/);
  assert.match(layout, /더컵에듀 시스템/);
  assert.match(layout, /lang="ko"/);
  assert.match(app, /brand\/thecup-edu\.jpg/);
  assert.match(app, /brand\/monthly-coffee\.png/);
  assert.match(app, /수업 사용 기록/);
  assert.match(app, /로스팅 프로파일/);
  assert.match(app, /피커 매뉴얼\(로스팅 및 포장\)/);
  assert.match(app, /검사·교육·보건증 D-day/);
  assert.match(app, /보건증은 매년 발급일과 증빙 자료를 확인합니다/);
  assert.match(app, /날짜 입력 후 계산/);
  assert.match(app, /네이버 스마트스토어 관리자센터/);
  assert.match(app, /14:00 전에 로스팅 완료/);
  assert.match(app, /택배 상자에는 피커 도장을 반드시 찍습니다/);
  assert.match(app, /라벨 스티커는 전면부 피커 글자 하단에 붙입니다/);
  assert.match(app, /nextComplianceDueDate/);
  assert.match(app, /api\/roasting\/manual/);
  assert.match(app, /복사해서 새로 만들기/);
  assert.match(app, /프로파일 복사본 만들기/);
  assert.match(app, /mode === "edit" \? "PATCH" : "POST"/);
  assert.match(app, /새 프로파일로 저장/);
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
  assert.match(app, /추가 등록 내역/);
  assert.match(app, /해당 연도의 12개월을 기준으로 계산했습니다/);
  assert.match(app, /\{quarter\}분기/);
  assert.doesNotMatch(app, /숫자가 말해주는 오늘의 운영|Q\{quarter\}/);
  assert.match(app, /직원 전용/);
  assert.doesNotMatch(app, /OPERATIONS, REFINED|개월 매출 이관|단계 권한 분리/);
  assert.match(app, /Asia\/Seoul/);
  assert.match(app, /capture="environment"/);
  assert.match(app, /선택한 영수증 미리보기/);
  assert.match(app, /사진 촬영 또는 앨범 선택/);
  assert.match(app, /aria-label="자료 사진 촬영 또는 앨범 선택"/);
  assert.equal((app.match(/className="manual-file-option"/g) ?? []).length, 1);
  assert.match(app, /encodeURIComponent\(document\.createdAt\)/);
  assert.match(app, /선택한 자료 이미지 미리보기/);
  assert.match(app, /날짜·증빙 함께 저장/);
  assert.match(app, /시스템 등록 기준/);
  assert.match(app, /이전 증빙 \{previousDocuments\.length\}건 보기/);
  assert.match(app, /검사·교육·보건증은 위 D-day 카드에서 함께 관리/);
  assert.match(app, /로스팅·포장 자료/);
  assert.doesNotMatch(app, /검사·교육·보건증·로스팅·포장 자료/);
  assert.match(app, /이미지 크게 보기/);
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
  assert.match(styles, /\.inventory-sections/);
  assert.match(styles, /\.inventory-section-heading/);
  assert.match(styles, /\.inventory-entry-switch/);
  assert.match(styles, /\.inline-roast-workflow/);
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
  assert.match(styles, /\.roasting-workspace-tabs/);
  assert.match(styles, /\.picker-manual/);
  assert.match(styles, /\.compliance-grid/);
  assert.match(styles, /\.compliance-evidence/);
  assert.match(styles, /\.compliance-file-option/);
  assert.match(styles, /\.compliance-card \{[\s\S]*?display: flex;[\s\S]*?height: 100%/);
  assert.match(styles, /\.compliance-update \{[\s\S]*?margin-top: auto/);
  assert.match(styles, /\.manual-document-grid/);
  assert.match(styles, /\.manual-file-options/);
  assert.match(styles, /\.manual-upload-preview/);
  assert.match(styles, /\.manual-document-open/);
  assert.match(styles, /\.copy-profile-notice/);
  assert.match(styles, /\.live-development/);
  assert.match(styles, /body \{[\s\S]*?font-size: 16px/);
  assert.match(styles, /\.roast-flow-fields/);
  assert.doesNotMatch(styles, /\.point-row|\.milestone-grid/);
  assert.match(styles, /\.mobile-history-nav/);
  assert.match(styles, /\.staff-delete-button/);
  assert.doesNotMatch(styles, /#17483b|#d9613e|#f3f0e7/i);
  assert.doesNotMatch(`${page}\n${layout}\n${app}`, /codex-preview|Your site is taking shape|SkeletonPreview/i);
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

test("roasting handover manual is permission-protected and durably stored", async () => {
  const [manualRoute, documentRoute, compliance, database, schema] = await Promise.all([
    readFile(new URL("app/api/roasting/manual/route.ts", root), "utf8"),
    readFile(new URL("app/api/roasting/manual/documents/[id]/route.ts", root), "utf8"),
    readFile(new URL("lib/compliance.ts", root), "utf8"),
    readFile(new URL("lib/db.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(manualRoute, /requirePermission\(request, "roasting"\)/);
  assert.match(manualRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(manualRoute, /hasValidImageSignature/);
  assert.match(manualRoute, /MAX_DOCUMENT_BYTES = 400_000/);
  assert.match(manualRoute, /MAX_DOCUMENT_COUNT = 50/);
  assert.match(manualRoute, /MAX_DOCUMENT_STORAGE_BYTES = 20_000_000/);
  assert.match(manualRoute, /export async function PUT/);
  assert.match(manualRoute, /await db\.batch\(statements\)/);
  assert.match(manualRoute, /검사·교육·보건증 자료는 해당 D-day 카드에서 등록/);
  assert.match(documentRoute, /requirePermission\(request, "roasting"\)/);
  assert.match(documentRoute, /requireUser\(request, \["admin"\]\)/);
  assert.match(documentRoute, /blobResponseBody/);
  assert.match(documentRoute, /content-length/);
  assert.match(documentRoute, /x-content-type-options/);
  assert.match(compliance, /initialCompletedDate: "2026-05-27"/);
  assert.match(compliance, /initialCompletedDate: "2026-05-20"/);
  assert.match(compliance, /key: "health_certificate"/);
  assert.match(compliance, /initialCompletedDate: null/);
  assert.match(compliance, /frequencyMonths: 9/);
  assert.match(compliance, /frequencyMonths: 12/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS manual_compliance/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS manual_documents/);
  assert.match(database, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(database, /ensureManualTableSchemas/);
  assert.match(database, /manual_compliance_next/);
  assert.match(database, /manual_documents_next/);
  assert.match(schema, /sqliteTable\("manual_compliance"/);
  assert.match(schema, /"manual_documents"/);
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
  assert.match(receiptRoute, /blobResponseBody/);
  assert.match(receiptRoute, /user\.canFinance/);
  assert.match(receiptRoute, /user\.role !== "instructor"/);
  assert.match(imageSignature, /image\/jpeg/);
  assert.match(imageSignature, /image\/png/);
  assert.match(imageSignature, /image\/webp/);
});

test("migration covers identity, finance, inventory, receipts, roasting and the handover manual", async () => {
  const [migration, turningPointMigration, manualMigration, healthCertificateMigration] = await Promise.all([
    readFile(new URL("drizzle/0000_mixed_night_nurse.sql", root), "utf8"),
    readFile(new URL("drizzle/0007_natural_mantis.sql", root), "utf8"),
    readFile(new URL("drizzle/0008_rare_the_hunter.sql", root), "utf8"),
    readFile(new URL("drizzle/0009_fixed_spitfire.sql", root), "utf8"),
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
  assert.match(manualMigration, /CREATE TABLE `manual_compliance`/);
  assert.match(manualMigration, /CREATE TABLE `manual_documents`/);
  assert.match(manualMigration, /manual_documents_category_date_idx/);
  assert.match(healthCertificateMigration, /`completed_date` text,/);
  assert.match(healthCertificateMigration, /INSERT INTO `__new_manual_compliance`/);
});

test("guards critical identity, date and persistence edge cases", async () => {
  const [http, database, auth, bootstrap, login, staff, finance, inventory, milkPurchase, receiptStorage, roasting, permissionsMigration, legacyMigration, deletionMigration, dashboard] = await Promise.all([
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
