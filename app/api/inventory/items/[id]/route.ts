import { requireUser } from "../../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../../lib/db";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  nonNegativeNumber,
  optionalText,
  textValue,
} from "../../../../../lib/http";

const categories = ["green", "roasted", "gusto", "milk", "other"];

type InventoryItemRecord = {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  legacyKey: string | null;
  movementCount: number;
};

function itemId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("재고 품목 번호가 올바르지 않습니다.");
  return id;
}

async function readItem(db: D1Database, id: number): Promise<InventoryItemRecord | null> {
  return db
    .prepare(
      `SELECT i.id, i.name, i.category, i.unit, i.quantity,
              i.legacy_key AS legacyKey,
              (SELECT COUNT(*) FROM inventory_movements m WHERE m.item_id = i.id) AS movementCount
       FROM inventory_items i
       WHERE i.id = ? AND i.active = 1`,
    )
    .bind(id)
    .first<InventoryItemRecord>();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const { id: rawId } = await context.params;
    const id = itemId(rawId);
    const payload = (await request.json()) as Record<string, unknown>;
    const name = textValue(payload.name, "품목명", 80);
    const category = String(payload.category ?? "");
    const lot = optionalText(payload.lot, 40);
    const process = optionalText(payload.process, 80);
    const expiryDate = payload.expiryDate ? isoDate(payload.expiryDate) : null;
    const unit = textValue(payload.unit, "단위", 10);
    const reorderLevel = nonNegativeNumber(payload.reorderLevel, "최소 재고");
    if (!categories.includes(category)) throw new Error("재고 분류를 선택해 주세요.");

    const db = getD1();
    const current = await readItem(db, id);
    if (!current) return Response.json({ error: "수정할 재고 품목을 찾을 수 없습니다." }, { status: 404 });
    const classificationChanged = current.category !== category || current.unit.trim() !== unit.trim();
    if (classificationChanged && (current.legacyKey || current.movementCount > 0 || Math.abs(Number(current.quantity)) > 0.000001)) {
      throw new Error("기존 수량이나 기록이 있는 품목은 분류와 단위를 변경할 수 없습니다. 품목명·LOT·가공 방식 등은 바로 수정할 수 있습니다.");
    }

    await db
      .prepare(
        `UPDATE inventory_items
         SET name = ?, category = ?, lot = ?, process = ?, expiry_date = ?,
             unit = ?, reorder_level = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND active = 1`,
      )
      .bind(name, category, lot, process, expiryDate, unit, reorderLevel, id)
      .run();
    await audit(
      actor.id,
      "update_inventory_item",
      "inventory_item",
      String(id),
      current.name === name ? name : `${current.name} → ${name}`,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const { id: rawId } = await context.params;
    const id = itemId(rawId);
    const db = getD1();
    const current = await readItem(db, id);
    if (!current) return Response.json({ error: "숨길 재고 품목을 찾을 수 없습니다." }, { status: 404 });
    if (Math.abs(Number(current.quantity)) > 0.000001) {
      throw new Error("현재 재고가 남아 있습니다. 입출고 탭에서 실사 수량을 0으로 조정한 뒤 숨겨 주세요.");
    }

    await db
      .prepare(
        "UPDATE inventory_items SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(id)
      .run();
    await audit(actor.id, "hide_inventory_item", "inventory_item", String(id), current.name);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
