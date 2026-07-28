import { requirePermission } from "../../../../lib/auth";
import {
  ensureDatabase,
  getD1,
  readLegacyInventoryEntries,
} from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";
import { normalizeLegacyCategory, toDateOnly } from "../../../../lib/legacy-inventory";
import { inventoryQuantityInKilograms } from "../../../../lib/quantity";
import { koreanDateStamp, xlsxResponse, type ExcelValue } from "../../../../lib/xlsx";

type InventoryRow = {
  category: string;
  name: string;
  lot: string;
  process: string;
  expiryDate: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
};

type MovementRow = {
  id: number;
  movementType: string;
  quantity: number;
  movementDate: string;
  note: string;
  className: string;
  costAmount: number;
  receiptKey: string | null;
  receiptDeletedAt: string | null;
  itemName: string;
  itemCategory: string;
  unit: string;
  createdByName: string;
  createdAt: string;
};

const categoryNames: Record<string, string> = {
  green: "생두",
  roasted: "원두 · 자체 로스팅",
  gusto: "원두 · 구스토",
  milk: "우유",
  other: "기타",
};

const movementNames: Record<string, string> = {
  in: "입고",
  out: "출고/사용",
  adjust: "실사 조정",
  roast_in: "원두 입고 · 로스팅",
  roast_out: "생두 출고 · 로스팅",
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requirePermission(request, "inventory");
    const db = getD1();
    const ownRecordsOnly = user.role === "instructor";
    const movementStatement = db.prepare(
      `SELECT m.id, m.movement_type AS movementType, m.quantity,
              m.movement_date AS movementDate, m.note, m.class_name AS className,
              m.cost_amount AS costAmount, m.receipt_key AS receiptKey,
              m.receipt_deleted_at AS receiptDeletedAt,
              i.name AS itemName, i.category AS itemCategory, i.unit,
              s.name AS createdByName, m.created_at AS createdAt
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.item_id
       JOIN staff s ON s.id = m.created_by
       ${ownRecordsOnly ? "WHERE m.created_by = ?" : ""}
       ORDER BY m.movement_date, m.id`,
    );
    const [inventory, movements, legacyEntries] = await Promise.all([
      db
        .prepare(
          `SELECT category, name, lot, process, expiry_date AS expiryDate,
                  unit, quantity, reorder_level AS reorderLevel
           FROM inventory_items
           WHERE active = 1
           ORDER BY category, name`,
        )
        .all<InventoryRow>(),
      ownRecordsOnly
        ? movementStatement.bind(user.id).all<MovementRow>()
        : movementStatement.all<MovementRow>(),
      ownRecordsOnly ? Promise.resolve([]) : readLegacyInventoryEntries(db),
    ]);

    const movementRows: Array<{ createdAt: string; values: ExcelValue[] }> = [
      ...movements.results.map((row) => {
        const amount = exportQuantity(row.itemCategory, Number(row.quantity), row.unit);
        return {
          createdAt: row.createdAt,
          values: [
            row.movementDate,
            categoryNames[row.itemCategory] ?? row.itemCategory,
            row.itemName,
            movementNames[row.movementType] ?? row.movementType,
            amount.quantity,
            amount.unit,
            row.className,
            row.note,
            Number(row.costAmount),
            row.createdByName,
            row.receiptDeletedAt ? "보관 만료" : row.receiptKey ? "보관 중" : "",
          ],
        };
      }),
      ...legacyEntries.map((entry) => {
        const category = normalizeLegacyCategory(entry);
        return {
          createdAt: entry.created_at,
          values: [
            entry.created_at.slice(0, 10),
            categoryNames[category] ?? category,
            entry.item,
            entry.type === "입고" ? "입고" : category === "green" ? "생두 출고 · 로스팅" : "출고/사용",
            Number(entry.amount_mkg) / 1000,
            "kg",
            "",
            [entry.lot ? `LOT ${entry.lot}` : "", entry.process, toDateOnly(entry.expiry_date) ? `소비기한 ${toDateOnly(entry.expiry_date)}` : ""].filter(Boolean).join(" · "),
            0,
            "기존 재고 기록",
            "",
          ],
        };
      }),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return xlsxResponse(`더컵에듀_재고_${koreanDateStamp()}.xlsx`, [
      {
        name: "현재 재고",
        columns: ["구분", "품목", "LOT", "가공 방식", "소비기한", "현재 수량", "단위", "최소 재고", "상태"],
        rows: inventory.results.map((row) => {
          const quantity = exportQuantity(row.category, Number(row.quantity), row.unit);
          const minimum = exportQuantity(row.category, Number(row.reorderLevel), row.unit);
          return [
            categoryNames[row.category] ?? row.category,
            row.name,
            row.lot,
            row.process,
            toDateOnly(row.expiryDate) ?? "",
            quantity.quantity,
            quantity.unit,
            minimum.quantity,
            Number(row.quantity) <= Number(row.reorderLevel) ? "확인 필요" : "정상",
          ];
        }),
      },
      {
        name: "재고 기록",
        columns: ["일자", "구분", "품목", "작업", "수량", "단위", "수업명", "메모", "비용", "등록자", "영수증"],
        rows: movementRows.map((row) => row.values),
      },
    ]);
  } catch (error) {
    return jsonError(error);
  }
}

function exportQuantity(category: string, quantity: number, unit: string) {
  if ((category === "roasted" || category === "gusto") && ["g", "kg", "㎏"].includes(unit.trim().toLowerCase())) {
    return { quantity: inventoryQuantityInKilograms(quantity, unit), unit: "kg" };
  }
  return { quantity, unit };
}
