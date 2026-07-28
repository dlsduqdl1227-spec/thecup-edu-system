import { requireUser } from "../../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../../lib/db";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  optionalText,
  positiveNumber,
} from "../../../../../lib/http";
import { mutateLegacyInventoryEntry } from "../../../../../lib/legacy-admin";
import { formatInventoryQuantity } from "../../../../../lib/quantity";

function legacyId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 100) throw new Error("이관 기록 번호가 올바르지 않습니다.");
  return id;
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
    const id = legacyId(rawId);
    const payload = (await request.json()) as Record<string, unknown>;
    const movementDate = isoDate(payload.movementDate);
    const quantityKg = positiveNumber(payload.quantity, "수량");
    const process = optionalText(payload.process, 80);
    const expiryDate = payload.expiryDate ? isoDate(payload.expiryDate) : null;
    const db = getD1();
    const entries = await db
      .prepare(
        `SELECT id, created_at, item, lot, type, amount_mkg,
                expiry_date, process, category
         FROM entries WHERE id = ?`,
      )
      .bind(id)
      .all<{
        id: string;
        created_at: string;
        item: string;
        lot: string;
        type: string;
        amount_mkg: number;
        expiry_date: string | null;
        process: string;
        category: "GREEN" | "ROASTED";
      }>();
    const current = entries.results[0];
    if (!current) return Response.json({ error: "수정할 이관 기록을 찾을 수 없습니다." }, { status: 404 });
    const sign = Number(current.amount_mkg) < 0 ? -1 : 1;
    const updated = {
      ...current,
      created_at: `${movementDate}T00:00:00Z`,
      amount_mkg: sign * quantityKg * 1000,
      process,
      expiry_date: expiryDate,
    };
    await mutateLegacyInventoryEntry(db, id, { kind: "update", entry: updated });
    await audit(
      actor.id,
      "update_legacy_inventory_record",
      "legacy_inventory_entry",
      id,
      `${current.item} · ${formatInventoryQuantity(sign * quantityKg, "kg")}`,
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
    const id = legacyId(rawId);
    const record = await mutateLegacyInventoryEntry(getD1(), id, { kind: "delete" });
    if (!record) return Response.json({ error: "삭제할 이관 기록을 찾을 수 없습니다." }, { status: 404 });
    await audit(
      actor.id,
      "delete_legacy_inventory_record",
      "legacy_inventory_entry",
      id,
      record.item,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
