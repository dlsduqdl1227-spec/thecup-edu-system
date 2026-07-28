import { requirePermission, requireUser } from "../../../lib/auth";
import { deleteInventoryMovementRecord } from "../../../lib/admin-records";
import { audit, ensureDatabase, getD1 } from "../../../lib/db";
import {
  assertSameOrigin,
  integerAmount,
  isoDate,
  jsonError,
  optionalText,
  textValue,
} from "../../../lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requirePermission(request, "finance");
    const payload = (await request.json()) as Record<string, unknown>;
    const kind = String(payload.kind ?? "");
    if (kind !== "income" && kind !== "expense") throw new Error("매출 또는 지출을 선택해 주세요.");
    const category = textValue(payload.category, "분류", 50);
    const amount = integerAmount(payload.amount);
    const transactionDate = isoDate(payload.transactionDate);
    const description = optionalText(payload.description, 300);

    const result = await getD1()
      .prepare(
        `INSERT INTO finance_transactions
          (kind, category, amount, transaction_date, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(kind, category, amount, transactionDate, description, user.id)
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(user.id, "create_finance", "finance_transaction", String(id), `${kind} · ${category} · ${amount}`);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("장부 기록을 선택해 주세요.");
    const kind = String(payload.kind ?? "");
    if (kind !== "income" && kind !== "expense") throw new Error("매출 또는 지출을 선택해 주세요.");
    const category = textValue(payload.category, "분류", 50);
    const amount = integerAmount(payload.amount);
    const transactionDate = isoDate(payload.transactionDate);
    const description = optionalText(payload.description, 300);
    const db = getD1();
    const target = await db
      .prepare("SELECT inventory_movement_id AS inventoryMovementId FROM finance_transactions WHERE id = ?")
      .bind(id)
      .first<{ inventoryMovementId: number | null }>();
    if (!target) return Response.json({ error: "수정할 장부 기록을 찾을 수 없습니다." }, { status: 404 });
    if (target.inventoryMovementId && kind !== "expense") {
      throw new Error("우유 구매와 연결된 기록은 지출로만 저장할 수 있습니다.");
    }

    const statements = [
      db
        .prepare(
          `UPDATE finance_transactions
           SET kind = ?, category = ?, amount = ?, transaction_date = ?, description = ?
           WHERE id = ?`,
        )
        .bind(kind, category, amount, transactionDate, description, id),
    ];
    if (target.inventoryMovementId) {
      statements.push(
        db
          .prepare(
            `UPDATE inventory_movements
             SET cost_amount = ?, movement_date = ?, note = ?
             WHERE id = ?`,
          )
          .bind(amount, transactionDate, description, target.inventoryMovementId),
      );
    }
    await db.batch(statements);
    await audit(actor.id, "update_finance", "finance_transaction", String(id), `${kind} · ${category} · ${amount}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("장부 기록을 선택해 주세요.");
    const db = getD1();
    const target = await db
      .prepare(
        `SELECT kind, category, amount, inventory_movement_id AS inventoryMovementId
         FROM finance_transactions WHERE id = ?`,
      )
      .bind(id)
      .first<{ kind: string; category: string; amount: number; inventoryMovementId: number | null }>();
    if (!target) return Response.json({ error: "삭제할 장부 기록을 찾을 수 없습니다." }, { status: 404 });

    if (target.inventoryMovementId) {
      const movement = await deleteInventoryMovementRecord(db, target.inventoryMovementId);
      if (!movement) throw new Error("연결된 재고 기록을 찾을 수 없습니다.");
    } else {
      await db.prepare("DELETE FROM finance_transactions WHERE id = ?").bind(id).run();
    }
    await audit(actor.id, "delete_finance", "finance_transaction", String(id), `${target.kind} · ${target.category} · ${target.amount}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
