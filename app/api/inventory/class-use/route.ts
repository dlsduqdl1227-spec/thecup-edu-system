import { requireUser } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  nonNegativeNumber,
  optionalText,
  textValue,
} from "../../../../lib/http";
import {
  formatBeanQuantity,
  formatInventoryQuantity,
  kilogramsToInventoryQuantity,
} from "../../../../lib/quantity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const className = textValue(payload.className, "수업명", 100);
    const movementDate = isoDate(payload.movementDate);
    const milkQuantity = nonNegativeNumber(payload.milkQuantity, "우유 사용량");
    const beanQuantityKg = nonNegativeNumber(payload.beanQuantityKg, "원두 사용량");
    const beanItemId = Number(payload.beanItemId);
    const note = optionalText(payload.note, 300);
    if (milkQuantity <= 0 && beanQuantityKg <= 0) {
      throw new Error("우유 또는 원두 사용량을 입력해 주세요.");
    }

    const db = getD1();
    const items = await db
      .prepare(
        `SELECT id, name, category, quantity, unit
         FROM inventory_items WHERE active = 1 AND (category = 'milk' OR id = ?)`,
      )
      .bind(Number.isInteger(beanItemId) ? beanItemId : -1)
      .all<{ id: number; name: string; category: string; quantity: number; unit: string }>();
    const milkItem = items.results.find((item) => item.category === "milk");
    const beanItem = items.results.find((item) => item.id === beanItemId);
    if (milkQuantity > 0 && !milkItem) throw new Error("우유 재고 품목을 찾을 수 없습니다.");
    if (beanQuantityKg > 0 && (!beanItem || !["roasted", "gusto"].includes(beanItem.category))) {
      throw new Error("사용할 원두를 선택해 주세요.");
    }
    const beanQuantity = beanItem && beanQuantityKg > 0
      ? kilogramsToInventoryQuantity(beanQuantityKg, beanItem.unit)
      : 0;
    if (milkItem && milkQuantity > Number(milkItem.quantity)) {
      throw new Error(`우유 재고가 부족합니다. 현재 ${formatInventoryQuantity(Number(milkItem.quantity), milkItem.unit)}입니다.`);
    }
    if (beanItem && beanQuantity > Number(beanItem.quantity)) {
      throw new Error(`${beanItem.name} 재고가 부족합니다. 현재 ${formatBeanQuantity(Number(beanItem.quantity), beanItem.unit)}입니다.`);
    }

    const statements: D1PreparedStatement[] = [];
    if (milkItem && milkQuantity > 0) {
      statements.push(
        db
          .prepare("UPDATE inventory_items SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(milkQuantity, milkItem.id),
        db
          .prepare(
            `INSERT INTO inventory_movements
              (item_id, movement_type, quantity, movement_date, note, class_name, created_by)
             VALUES (?, 'out', ?, ?, ?, ?, ?)`,
          )
          .bind(milkItem.id, -milkQuantity, movementDate, note, className, user.id),
      );
    }
    if (beanItem && beanQuantity > 0) {
      statements.push(
        db
          .prepare("UPDATE inventory_items SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(beanQuantity, beanItem.id),
        db
          .prepare(
            `INSERT INTO inventory_movements
              (item_id, movement_type, quantity, movement_date, note, class_name, created_by)
             VALUES (?, 'out', ?, ?, ?, ?, ?)`,
          )
          .bind(beanItem.id, -beanQuantity, movementDate, note, className, user.id),
      );
    }
    await db.batch(statements);
    await audit(
      user.id,
      "class_consumption",
      "inventory_movement",
      "",
      `${className} · 우유 ${formatInventoryQuantity(milkQuantity, milkItem?.unit ?? "팩")} · 원두 ${formatInventoryQuantity(beanQuantityKg, "kg")}`,
    );
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
