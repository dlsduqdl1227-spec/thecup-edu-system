export type InventoryMovementRecord = {
  id: number;
  itemId: number;
  itemName: string;
  itemCategory: string;
  itemQuantity: number;
  unit: string;
  movementType: string;
  quantity: number;
  movementDate: string;
  note: string;
  className: string;
  costAmount: number;
  hasReceipt: number;
};

export async function readInventoryMovementRecord(
  db: D1Database,
  id: number,
): Promise<InventoryMovementRecord | null> {
  return db
    .prepare(
      `SELECT m.id, m.item_id AS itemId, i.name AS itemName, i.category AS itemCategory,
              i.quantity AS itemQuantity, i.unit,
              m.movement_type AS movementType, m.quantity,
              m.movement_date AS movementDate, m.note,
              m.class_name AS className, m.cost_amount AS costAmount,
              m.receipt_key IS NOT NULL AS hasReceipt
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.item_id
       WHERE m.id = ?`,
    )
    .bind(id)
    .first<InventoryMovementRecord>();
}

export async function deleteInventoryMovementRecord(
  db: D1Database,
  id: number,
): Promise<InventoryMovementRecord | null> {
  const record = await readInventoryMovementRecord(db, id);
  if (!record) return null;

  const nextQuantity = Number(record.itemQuantity) - Number(record.quantity);
  if (nextQuantity < -0.000001) {
    throw new Error(
      "이 기록을 삭제하면 현재 재고가 음수가 됩니다. 이후 사용 기록을 먼저 수정하거나 삭제해 주세요.",
    );
  }

  await db.batch([
    db.prepare("DELETE FROM receipt_files WHERE movement_id = ?").bind(id),
    db.prepare("DELETE FROM finance_transactions WHERE inventory_movement_id = ?").bind(id),
    db.prepare("DELETE FROM inventory_movements WHERE id = ?").bind(id),
    db
      .prepare(
        "UPDATE inventory_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .bind(Math.max(0, nextQuantity), record.itemId),
  ]);
  return record;
}
