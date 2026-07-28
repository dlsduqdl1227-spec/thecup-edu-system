import { readLegacyInventoryEntries } from "./db";
import {
  legacyInventoryKey,
  summarizeLegacyInventory,
  type LegacyInventoryEntry,
} from "./legacy-inventory";

type LegacyMutation =
  | { kind: "update"; entry: LegacyInventoryEntry }
  | { kind: "delete" };

export async function mutateLegacyInventoryEntry(
  db: D1Database,
  id: string,
  mutation: LegacyMutation,
): Promise<LegacyInventoryEntry | null> {
  const entries = await readLegacyInventoryEntries(db);
  const target = entries.find((entry) => String(entry.id) === id);
  if (!target) return null;

  const key = legacyInventoryKey(target);
  const oldSummary = summarizeLegacyInventory(entries).find((item) => item.legacyKey === key);
  const nextEntries = mutation.kind === "delete"
    ? entries.filter((entry) => String(entry.id) !== id)
    : entries.map((entry) => String(entry.id) === id ? mutation.entry : entry);
  const newSummary = summarizeLegacyInventory(nextEntries).find((item) => item.legacyKey === key);
  const quantityDelta = Number(newSummary?.quantity ?? 0) - Number(oldSummary?.quantity ?? 0);
  const item = await db
    .prepare(
      `SELECT id, quantity
       FROM inventory_items
       WHERE legacy_key = ?`,
    )
    .bind(key)
    .first<{ id: number; quantity: number }>();

  if (!item && Math.abs(quantityDelta) > 0.000001 && !newSummary) {
    throw new Error("이관 기록과 연결된 현재 재고를 찾을 수 없습니다.");
  }
  const nextQuantity = item ? Number(item.quantity) + quantityDelta : 0;
  if (nextQuantity < -0.000001) {
    throw new Error(
      "이 기록을 변경하면 현재 재고가 음수가 됩니다. 이후 사용 기록을 먼저 수정해 주세요.",
    );
  }

  const statements = mutation.kind === "delete"
    ? [db.prepare("DELETE FROM entries WHERE id = ?").bind(id)]
    : [
        db
          .prepare(
            `UPDATE entries
             SET created_at = ?, amount_mkg = ?, process = ?, expiry_date = ?
             WHERE id = ?`,
          )
          .bind(
            mutation.entry.created_at,
            mutation.entry.amount_mkg,
            mutation.entry.process,
            mutation.entry.expiry_date,
            id,
          ),
      ];

  if (item) {
    statements.push(
      db
        .prepare(
          `UPDATE inventory_items
           SET quantity = ?, process = ?, expiry_date = ?,
               active = CASE WHEN ? > 0 THEN 1 ELSE active END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          Math.max(0, nextQuantity),
          newSummary?.process ?? target.process,
          newSummary?.expiryDate ?? null,
          Math.max(0, nextQuantity),
          item.id,
        ),
    );
  } else if (newSummary) {
    statements.push(
      db
        .prepare(
          `INSERT INTO inventory_items
            (category, name, lot, process, expiry_date, legacy_key,
             unit, quantity, reorder_level, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          newSummary.category,
          newSummary.name,
          newSummary.lot,
          newSummary.process,
          newSummary.expiryDate,
          newSummary.legacyKey,
          newSummary.unit,
          newSummary.quantity,
          newSummary.reorderLevel,
        ),
    );
  }
  await db.batch(statements);
  return target;
}
