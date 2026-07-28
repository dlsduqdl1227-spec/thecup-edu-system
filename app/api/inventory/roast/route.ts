import { requirePermission } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  optionalText,
  positiveNumber,
} from "../../../../lib/http";
import { formatInventoryQuantity } from "../../../../lib/quantity";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requirePermission(request, "inventory");
    const payload = (await request.json()) as Record<string, unknown>;
    const greenItemId = Number(payload.greenItemId);
    const roastedItemId = Number(payload.roastedItemId);
    const greenKg = positiveNumber(payload.greenKg, "생두 사용량");
    const outputGrams = positiveNumber(payload.outputGrams, "로스팅(원두) 중량");
    const movementDate = isoDate(payload.movementDate);
    const note = optionalText(payload.note, 300);
    const db = getD1();
    const items = await db
      .prepare(
        "SELECT id, name, category, quantity, unit FROM inventory_items WHERE id IN (?, ?) AND active = 1",
      )
      .bind(greenItemId, roastedItemId)
      .all<{ id: number; name: string; category: string; quantity: number; unit: string }>();
    const green = items.results.find((item) => item.id === greenItemId && item.category === "green");
    const roasted = items.results.find((item) => item.id === roastedItemId && item.category === "roasted");
    if (!green || !roasted) throw new Error("투입할 생두와 로스팅(원두) 입고 품목을 정확히 선택해 주세요.");
    if (greenKg > Number(green.quantity)) throw new Error(`생두 재고가 부족합니다. 현재 ${formatInventoryQuantity(Number(green.quantity), green.unit)}입니다.`);

    await db.batch([
      db
        .prepare("UPDATE inventory_items SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(greenKg, green.id),
      db
        .prepare("UPDATE inventory_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(outputGrams, roasted.id),
      db
        .prepare(
          `INSERT INTO inventory_movements
            (item_id, movement_type, quantity, movement_date, note, created_by)
           VALUES (?, 'roast_out', ?, ?, ?, ?)`,
        )
        .bind(green.id, -greenKg, movementDate, note, user.id),
      db
        .prepare(
          `INSERT INTO inventory_movements
            (item_id, movement_type, quantity, movement_date, note, created_by)
           VALUES (?, 'roast_in', ?, ?, ?, ?)`,
        )
        .bind(roasted.id, outputGrams, movementDate, note, user.id),
    ]);
    await audit(
      user.id,
      "roast_inventory",
      "inventory_movement",
      "",
      `${formatInventoryQuantity(greenKg, green.unit)} → ${formatInventoryQuantity(outputGrams, roasted.unit)}`,
    );
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
