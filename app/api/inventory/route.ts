import { AuthError, requirePermission } from "../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../lib/db";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  nonNegativeNumber,
  optionalText,
  positiveNumber,
  textValue,
} from "../../../lib/http";
import { formatInventoryQuantity } from "../../../lib/quantity";
import { inventoryChange, readStockQuantity, roundStockQuantity, type InventoryMovementType } from "../../../lib/inventory-movement";

const categories = ["roasted", "gusto", "milk"];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requirePermission(request, "inventory");
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const db = getD1();

    if (action === "create_item" || action === "create_item_with_stock") {
      const name = textValue(payload.name, "품목명", 80);
      const category = String(payload.category ?? "");
      const lot = optionalText(payload.lot, 40);
      const process = optionalText(payload.process, 80);
      const expiryDate = payload.expiryDate ? isoDate(payload.expiryDate) : null;
      const unit = textValue(payload.unit, "단위", 10);
      const reorderLevel = nonNegativeNumber(payload.reorderLevel, "최소 재고");
      if (!categories.includes(category)) throw new Error("재고 분류를 선택해 주세요.");
      const withInitialStock = action === "create_item_with_stock";
      const initialQuantity = withInitialStock
        ? positiveNumber(payload.initialQuantity, "입고 수량")
        : 0;
      const movementDate = withInitialStock ? isoDate(payload.movementDate) : null;
      const note = withInitialStock ? optionalText(payload.note, 300) : "";
      const result = await db
        .prepare(
          `INSERT INTO inventory_items
            (category, name, lot, process, expiry_date,
             unit, quantity, reorder_level, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          category,
          name,
          lot,
          process,
          expiryDate,
          unit,
          initialQuantity,
          reorderLevel,
          user.id,
        )
        .run();
      const id = Number(result.meta.last_row_id);
      let movementId: number | null = null;

      if (withInitialStock && movementDate) {
        try {
          const movement = await db
            .prepare(
              `INSERT INTO inventory_movements
                (item_id, movement_type, quantity, movement_date, note, created_by)
               VALUES (?, 'in', ?, ?, ?, ?)`,
            )
            .bind(id, initialQuantity, movementDate, note, user.id)
            .run();
          movementId = Number(movement.meta.last_row_id);
        } catch (error) {
          await db
            .prepare(
              `DELETE FROM inventory_items
               WHERE id = ?
                 AND NOT EXISTS (SELECT 1 FROM inventory_movements WHERE item_id = ?)`,
            )
            .bind(id, id)
            .run();
          throw error;
        }
      }

      await audit(
        user.id,
        withInitialStock ? "create_item_with_stock" : "create_item",
        "inventory_item",
        String(id),
        withInitialStock ? `${name} · 입고 ${formatInventoryQuantity(initialQuantity, unit)}` : name,
      );
      return Response.json({ id, movementId, quantity: initialQuantity }, { status: 201 });
    }

    if (action !== "movement") throw new Error("재고 작업을 선택해 주세요.");
    const itemId = Number(payload.itemId);
    const movementType = String(payload.movementType ?? "");
    const movementDate = isoDate(payload.movementDate);
    const note = optionalText(payload.note, 300);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new Error("품목을 선택해 주세요.");
    if (!["in", "out", "adjust"].includes(movementType)) throw new Error("입고·사용·실사 조정 중 하나를 선택해 주세요.");
    const inputQuantity = readStockQuantity(payload.quantity, movementType === "adjust" ? "실사 수량" : "수량");
    if (inputQuantity === 0 && movementType !== "adjust") {
      throw new Error("입고·출고 수량은 0보다 커야 합니다. 재고를 비우려면 ‘실사 수량 0’으로 처리해 주세요.");
    }

    const item = await db
      .prepare("SELECT id, name, category, quantity, unit FROM inventory_items WHERE id = ? AND active = 1")
      .bind(itemId)
      .first<{ id: number; name: string; category: string; quantity: number; unit: string }>();
    if (!item) throw new Error("재고 품목을 찾을 수 없습니다.");
    const currentQuantity = Number(item.quantity);
    if (payload.expectedQuantity !== undefined && readStockQuantity(payload.expectedQuantity, "확인한 재고") !== roundStockQuantity(currentQuantity)) {
      throw new AuthError("다른 작업으로 재고가 변경됐습니다. 목록을 새로고침한 뒤 수량을 확인해 주세요.", 409);
    }
    if (!categories.includes(item.category)) throw new Error("원두와 우유 품목만 관리할 수 있습니다. 이전 기록은 보관됩니다.");

    const { delta, nextQuantity } = inventoryChange(currentQuantity, inputQuantity, movementType as InventoryMovementType);

    const movement = db
      .prepare(
        `INSERT INTO inventory_movements
          (item_id, movement_type, quantity, movement_date, note, created_by)
         SELECT ?, ?, ?, ?, ?, ? FROM inventory_items WHERE id = ? AND active = 1 AND quantity = ?`,
      )
      .bind(itemId, movementType, delta, movementDate, note, user.id, itemId, currentQuantity);
    const update = db
      .prepare("UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1 AND quantity = ?")
      .bind(nextQuantity, itemId, currentQuantity);
    const [, inserted, updated] = await db.batch([
      db.prepare(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
        SELECT ?, 'inventory_movement', 'inventory_item', ?, ? FROM inventory_items WHERE id = ? AND active = 1 AND quantity = ?`)
        .bind(user.id, String(itemId), `${item.name} · ${formatInventoryQuantity(delta, item.unit)}${nextQuantity === 0 ? " · 잔량 0, 기록 보관" : ""}`, itemId, currentQuantity),
      movement, update,
    ]);
    if (!Number(updated.meta.changes)) throw new AuthError("다른 작업으로 재고가 변경됐습니다. 목록을 새로고침한 뒤 다시 입력해 주세요.", 409);
    const movementId = Number(inserted.meta.last_row_id);
    return Response.json({ id: movementId, quantity: nextQuantity }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
