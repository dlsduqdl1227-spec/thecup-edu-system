import { requireUser } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import {
  assertSameOrigin,
  integerAmount,
  isoDate,
  jsonError,
  optionalText,
  positiveNumber,
} from "../../../../lib/http";
import { makeRoomForReceipt } from "../../../../lib/receipt-storage";
import { hasValidImageSignature } from "../../../../lib/image-signature";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RECEIPT_BYTES = 400_000;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request);
    const form = await request.formData();
    const quantity = positiveNumber(form.get("quantity"), "우유 수량");
    const amount = integerAmount(form.get("amount"));
    const movementDate = isoDate(form.get("movementDate"));
    const note = optionalText(form.get("note"), 300);
    const receipt = form.get("receipt");
    if (!(receipt instanceof File) || receipt.size === 0) {
      throw new Error("우유 구매 영수증 사진을 첨부해 주세요.");
    }
    if (!allowedTypes.has(receipt.type)) {
      throw new Error("JPG, PNG, WebP 영수증만 등록할 수 있습니다.");
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      throw new Error("최적화된 영수증 파일은 400KB 이하여야 합니다.");
    }

    const db = getD1();
    const milk = await db
      .prepare("SELECT id, name FROM inventory_items WHERE category = 'milk' AND active = 1 LIMIT 1")
      .first<{ id: number; name: string }>();
    if (!milk) throw new Error("우유 재고 품목을 찾을 수 없습니다.");

    const receiptData = await receipt.arrayBuffer();
    if (!hasValidImageSignature(receiptData, receipt.type)) {
      throw new Error("선택한 파일이 올바른 영수증 이미지가 아닙니다.");
    }
    const receiptToken = crypto.randomUUID();
    const cleanup = await makeRoomForReceipt(db, receiptData.byteLength);
    const [movementResult] = await db.batch([
      db
        .prepare(
          `INSERT INTO inventory_movements
            (item_id, movement_type, quantity, movement_date, note, cost_amount, receipt_key, created_by)
           VALUES (?, 'in', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(milk.id, quantity, movementDate, note, amount, receiptToken, user.id),
      db
        .prepare(
          `INSERT INTO receipt_files (movement_id, content_type, size_bytes, data)
           SELECT id, ?, ?, ? FROM inventory_movements WHERE receipt_key = ?`,
        )
        .bind(receipt.type, receiptData.byteLength, receiptData, receiptToken),
      db
        .prepare("UPDATE inventory_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(quantity, milk.id),
      db
        .prepare(
          `INSERT INTO finance_transactions
            (kind, category, amount, transaction_date, description, inventory_movement_id, created_by)
           VALUES ('expense', '우유', ?, ?, ?,
                   (SELECT id FROM inventory_movements WHERE receipt_key = ?), ?)`,
        )
        .bind(amount, movementDate, note || `${quantity}팩 구매`, receiptToken, user.id),
    ]);

    const movementId = Number(movementResult.meta.last_row_id);
    const cleanupDetail = cleanup.deletedCount
      ? ` · 오래된 영수증 ${cleanup.deletedCount}건 자동 정리`
      : "";
    await audit(
      user.id,
      "milk_purchase",
      "inventory_movement",
      String(movementId),
      `${quantity}팩 · ${amount}원${cleanupDetail}`,
    );
    return Response.json(
      { id: movementId, archivedReceipts: cleanup.deletedCount, receiptBytes: receiptData.byteLength },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
