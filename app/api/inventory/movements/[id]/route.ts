import { requireUser } from "../../../../../lib/auth";
import {
  deleteInventoryMovementRecord,
  readInventoryMovementRecord,
} from "../../../../../lib/admin-records";
import { audit, ensureDatabase, getD1 } from "../../../../../lib/db";
import {
  assertSameOrigin,
  integerAmount,
  isoDate,
  jsonError,
  optionalText,
  positiveNumber,
} from "../../../../../lib/http";
import { formatBeanQuantity, formatInventoryQuantity } from "../../../../../lib/quantity";

function recordId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("기록 번호가 올바르지 않습니다.");
  return id;
}

function editedDelta(movementType: string, value: unknown): number {
  if (movementType === "adjust") {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new Error("실사 변동 수량은 0이 아닌 숫자로 입력해 주세요.");
    }
    return quantity;
  }
  const quantity = positiveNumber(value, "수량");
  return ["out", "roast_out"].includes(movementType) ? -quantity : quantity;
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
    const id = recordId(rawId);
    const payload = (await request.json()) as Record<string, unknown>;
    const movementDate = isoDate(payload.movementDate);
    const note = optionalText(payload.note, 300);
    const className = optionalText(payload.className, 100);
    const db = getD1();
    const record = await readInventoryMovementRecord(db, id);
    if (!record) return Response.json({ error: "수정할 기록을 찾을 수 없습니다." }, { status: 404 });

    const quantity = editedDelta(record.movementType, payload.quantity);
    const linkedFinance = await db
      .prepare("SELECT id FROM finance_transactions WHERE inventory_movement_id = ?")
      .bind(id)
      .first<{ id: number }>();
    const hasCost = Boolean(linkedFinance || record.costAmount || record.hasReceipt);
    const costAmount = hasCost ? integerAmount(payload.costAmount) : 0;
    const nextQuantity = Number(record.itemQuantity) + quantity - Number(record.quantity);
    if (nextQuantity < -0.000001) {
      throw new Error("수정한 수량을 반영하면 현재 재고가 부족합니다. 수량을 다시 확인해 주세요.");
    }

    const statements = [
      db
        .prepare(
          "UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(Math.max(0, nextQuantity), record.itemId),
      db
        .prepare(
          `UPDATE inventory_movements
           SET quantity = ?, movement_date = ?, note = ?, class_name = ?, cost_amount = ?
           WHERE id = ?`,
        )
        .bind(quantity, movementDate, note, className, costAmount, id),
    ];
    if (linkedFinance) {
      statements.push(
        db
          .prepare(
            `UPDATE finance_transactions
             SET amount = ?, transaction_date = ?, description = ?
             WHERE inventory_movement_id = ?`,
          )
          .bind(costAmount, movementDate, note || `${record.itemName} 구매`, id),
      );
    }
    await db.batch(statements);
    await audit(
      actor.id,
      "update_inventory_record",
      "inventory_movement",
      String(id),
      `${record.itemName} · ${formatRecordQuantity(record.itemCategory, quantity, record.unit)}`,
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
    const id = recordId(rawId);
    const record = await deleteInventoryMovementRecord(getD1(), id);
    if (!record) return Response.json({ error: "삭제할 기록을 찾을 수 없습니다." }, { status: 404 });
    await audit(
      actor.id,
      "delete_inventory_record",
      "inventory_movement",
      String(id),
      `${record.itemName} · ${formatRecordQuantity(record.itemCategory, record.quantity, record.unit)}`,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

function formatRecordQuantity(category: string, quantity: number, unit: string): string {
  return category === "roasted" || category === "gusto"
    ? formatBeanQuantity(quantity, unit, quantity > 0)
    : formatInventoryQuantity(quantity, unit);
}
