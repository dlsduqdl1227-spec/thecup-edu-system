import { planReceiptCleanup, type StoredReceipt } from "./receipt-retention";

const D1_PARAMETER_LIMIT = 100;

export type ReceiptCleanupResult = {
  deletedCount: number;
  bytesReclaimed: number;
  projectedBytes: number;
};

export async function makeRoomForReceipt(
  db: D1Database,
  incomingBytes: number,
): Promise<ReceiptCleanupResult> {
  const stored = await db
    .prepare(
      `SELECT movement_id AS movementId, size_bytes AS size, created_at AS createdAt
       FROM receipt_files
       ORDER BY created_at, movement_id`,
    )
    .all<StoredReceipt>();
  const plan = planReceiptCleanup(stored.results, incomingBytes);

  for (let index = 0; index < plan.movementIds.length; index += D1_PARAMETER_LIMIT) {
    const movementIds = plan.movementIds.slice(index, index + D1_PARAMETER_LIMIT);
    const placeholders = movementIds.map(() => "?").join(", ");
    await db.batch([
      db
        .prepare(
          `UPDATE inventory_movements
           SET receipt_key = NULL, receipt_deleted_at = CURRENT_TIMESTAMP
           WHERE id IN (${placeholders})`,
        )
        .bind(...movementIds),
      db
        .prepare(`DELETE FROM receipt_files WHERE movement_id IN (${placeholders})`)
        .bind(...movementIds),
    ]);
  }

  return {
    deletedCount: plan.movementIds.length,
    bytesReclaimed: plan.bytesReclaimed,
    projectedBytes: plan.projectedBytes,
  };
}
