import { requireUser } from "../../../../lib/auth";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    const { id } = await context.params;
    const movementId = Number(id);
    if (!Number.isInteger(movementId) || movementId <= 0) {
      throw new Error("영수증 번호가 올바르지 않습니다.");
    }

    const db = getD1();
    const movement = await db
      .prepare(
        `SELECT receipt_key AS receiptKey, receipt_deleted_at AS receiptDeletedAt,
                created_by AS createdBy
         FROM inventory_movements WHERE id = ?`,
      )
      .bind(movementId)
      .first<{ receiptKey: string | null; receiptDeletedAt: string | null; createdBy: number }>();
    if (movement?.receiptDeletedAt) {
      return Response.json(
        { error: "저장공간 보호 정책에 따라 영수증 이미지의 보관이 만료되었습니다." },
        { status: 410 },
      );
    }
    if (!movement?.receiptKey) {
      return Response.json({ error: "영수증을 찾을 수 없습니다." }, { status: 404 });
    }
    const canViewAnotherStaffReceipt = user.role === "admin"
      || (user.role !== "instructor" && user.canFinance);
    if (movement.createdBy !== user.id && !canViewAnotherStaffReceipt) {
      return Response.json({ error: "영수증을 볼 수 있는 권한이 없습니다." }, { status: 403 });
    }

    const receipt = await db
      .prepare(
        `SELECT content_type AS contentType, data
         FROM receipt_files WHERE movement_id = ?`,
      )
      .bind(movementId)
      .first<{ contentType: string; data: ArrayBuffer }>();
    if (!receipt) {
      return Response.json({ error: "영수증 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const headers = new Headers({
      "content-type": receipt.contentType,
      "content-disposition": `inline; filename="receipt-${movementId}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-length": String(receipt.data.byteLength),
    });
    return new Response(receipt.data, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
