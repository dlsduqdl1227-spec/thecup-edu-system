import { requirePermission, requireUser } from "../../../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../../../lib/db";
import { blobResponseBody } from "../../../../../../lib/blob-response";
import { assertSameOrigin, jsonError } from "../../../../../../lib/http";

function documentId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("자료 번호가 올바르지 않습니다.");
  return id;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabase();
    await requirePermission(request, "roasting");
    const { id: rawId } = await context.params;
    const id = documentId(rawId);
    const document = await getD1()
      .prepare("SELECT content_type AS contentType, size_bytes AS sizeBytes, data FROM manual_documents WHERE id = ?")
      .bind(id)
      .first<{ contentType: string; data: unknown }>();
    if (!document) {
      return Response.json({ error: "자료 이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    const body = blobResponseBody(document.data);
    return new Response(body, {
      headers: {
        "content-type": document.contentType,
        "content-disposition": `inline; filename="manual-document-${id}"`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "content-length": String(body.byteLength),
      },
    });
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
    const user = await requireUser(request, ["admin"]);
    const { id: rawId } = await context.params;
    const id = documentId(rawId);
    const document = await getD1()
      .prepare("SELECT title, document_date AS documentDate FROM manual_documents WHERE id = ?")
      .bind(id)
      .first<{ title: string; documentDate: string }>();
    if (!document) {
      return Response.json({ error: "삭제할 자료를 찾을 수 없습니다." }, { status: 404 });
    }
    await getD1().prepare("DELETE FROM manual_documents WHERE id = ?").bind(id).run();
    await audit(user.id, "delete_manual_document", "manual_document", String(id), `${document.title} · ${document.documentDate}`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
