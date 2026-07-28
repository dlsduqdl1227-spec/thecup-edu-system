import { requirePermission } from "../../../lib/auth";
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

const categories = ["green", "roasted", "gusto", "milk", "other"];

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
    const inputQuantity =
      movementType === "adjust"
        ? nonNegativeNumber(payload.quantity, "실사 수량")
        : positiveNumber(payload.quantity, "수량");

    const item = await db
      .prepare("SELECT id, name, category, quantity, unit FROM inventory_items WHERE id = ? AND active = 1")
      .bind(itemId)
      .first<{ id: number; name: string; category: string; quantity: number; unit: string }>();
    if (!item) throw new Error("재고 품목을 찾을 수 없습니다.");
    if (item.category === "green" && movementType === "out") {
      throw new Error("생두 출고는 완성된 원두 수량과 함께 로스팅 사용으로 기록해 주세요.");
    }

    let delta = inputQuantity;
    if (movementType === "out") delta = -inputQuantity;
    if (movementType === "adjust") delta = inputQuantity - Number(item.quantity);
    const nextQuantity = Number(item.quantity) + delta;
    if (nextQuantity < 0) throw new Error(`재고가 부족합니다. 현재 ${formatInventoryQuantity(Number(item.quantity), item.unit)}입니다.`);

    const movement = db
      .prepare(
        `INSERT INTO inventory_movements
          (item_id, movement_type, quantity, movement_date, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(itemId, movementType, delta, movementDate, note, user.id);
    const update = db
      .prepare("UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(nextQuantity, itemId);
    const [, inserted] = await db.batch([update, movement]);
    const movementId = Number(inserted.meta.last_row_id);
    await audit(user.id, "inventory_movement", "inventory_movement", String(movementId), `${item.name} · ${formatInventoryQuantity(delta, item.unit)}`);
    return Response.json({ id: movementId, quantity: nextQuantity }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
