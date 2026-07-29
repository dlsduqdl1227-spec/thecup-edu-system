import { requirePermission, requireUser } from "../../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../../lib/db";
import {
  isComplianceKey,
  isManualDocumentCategory,
} from "../../../../lib/compliance";
import { hasValidImageSignature } from "../../../../lib/image-signature";
import {
  assertSameOrigin,
  isoDate,
  jsonError,
  textValue,
} from "../../../../lib/http";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DOCUMENT_BYTES = 400_000;
const MAX_DOCUMENT_COUNT = 50;
const MAX_DOCUMENT_STORAGE_BYTES = 20_000_000;

type PreparedDocument = {
  data: ArrayBuffer;
  fileName: string;
  contentType: string;
};

async function prepareDocument(value: FormDataEntryValue | null): Promise<PreparedDocument> {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error("확인할 자료 이미지를 첨부해 주세요.");
  }
  if (!allowedTypes.has(value.type)) {
    throw new Error("JPG, PNG, WebP 이미지만 등록할 수 있습니다.");
  }
  if (value.size > MAX_DOCUMENT_BYTES) {
    throw new Error("최적화된 자료 이미지는 400KB 이하여야 합니다.");
  }
  const data = await value.arrayBuffer();
  if (!hasValidImageSignature(data, value.type)) {
    throw new Error("선택한 파일이 올바른 이미지가 아닙니다.");
  }
  return {
    data,
    fileName: value.name.slice(0, 120),
    contentType: value.type,
  };
}

async function ensureDocumentCapacity(db: D1Database, additionalBytes: number): Promise<void> {
  const storage = await db
    .prepare(
      `SELECT COUNT(*) AS documentCount, COALESCE(SUM(size_bytes), 0) AS totalBytes
       FROM manual_documents`,
    )
    .first<{ documentCount: number; totalBytes: number }>();
  if (Number(storage?.documentCount ?? 0) >= MAX_DOCUMENT_COUNT) {
    throw new Error("자료는 최대 50개까지 보관할 수 있습니다. 오래된 자료를 정리해 주세요.");
  }
  if (Number(storage?.totalBytes ?? 0) + additionalBytes > MAX_DOCUMENT_STORAGE_BYTES) {
    throw new Error("자료 보관 용량이 20MB에 도달했습니다. 오래된 자료를 정리해 주세요.");
  }
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requirePermission(request, "roasting");
    const db = getD1();
    const [compliance, documents] = await Promise.all([
      db
        .prepare(
          `SELECT c.key, c.title, c.frequency_months AS frequencyMonths,
                  c.completed_date AS completedDate, c.updated_at AS updatedAt,
                  s.name AS updatedByName
           FROM manual_compliance c
           LEFT JOIN staff s ON s.id = c.updated_by
           ORDER BY CASE c.key
             WHEN 'self_quality' THEN 1
             WHEN 'hygiene_education' THEN 2
             WHEN 'health_certificate' THEN 3
             ELSE 4
           END`,
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT d.id, d.category, d.title, d.document_date AS documentDate,
                  d.file_name AS fileName, d.content_type AS contentType,
                  d.size_bytes AS sizeBytes, d.created_at AS createdAt,
                  s.name AS createdByName
           FROM manual_documents d
           JOIN staff s ON s.id = d.created_by
           ORDER BY d.document_date DESC, d.id DESC`,
        )
        .all<Record<string, unknown>>(),
    ]);
    return Response.json({ compliance: compliance.results, documents: documents.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const key = payload.key;
    if (!isComplianceKey(key)) throw new Error("수정할 정기 의무 항목이 올바르지 않습니다.");
    const completedDate = isoDate(payload.completedDate);
    const db = getD1();
    const result = await db
      .prepare(
        `UPDATE manual_compliance
         SET completed_date = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE key = ?`,
      )
      .bind(completedDate, user.id, key)
      .run();
    if (!result.meta.changes) {
      return Response.json({ error: "정기 의무 항목을 찾을 수 없습니다." }, { status: 404 });
    }
    await audit(user.id, "update_compliance", "manual_compliance", key, completedDate);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const form = await request.formData();
    const key = form.get("key");
    if (!isComplianceKey(key)) throw new Error("수정할 정기 의무 항목이 올바르지 않습니다.");
    const completedDate = isoDate(form.get("completedDate"));
    const documentValue = form.get("document");
    const hasDocument = documentValue instanceof File && documentValue.size > 0;
    const document = hasDocument ? await prepareDocument(documentValue) : null;
    const db = getD1();
    const compliance = await db
      .prepare("SELECT title FROM manual_compliance WHERE key = ?")
      .bind(key)
      .first<{ title: string }>();
    if (!compliance) {
      return Response.json({ error: "정기 의무 항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (document) await ensureDocumentCapacity(db, document.data.byteLength);

    const statements = [
      db
        .prepare(
          `UPDATE manual_compliance
           SET completed_date = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE key = ?`,
        )
        .bind(completedDate, user.id, key),
    ];
    if (document) {
      statements.push(
        db
          .prepare(
            `INSERT INTO manual_documents
              (category, title, document_date, file_name, content_type, size_bytes, data, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            key,
            `${compliance.title} · ${completedDate}`,
            completedDate,
            document.fileName,
            document.contentType,
            document.data.byteLength,
            document.data,
            user.id,
          ),
      );
    }
    await db.batch(statements);
    await audit(
      user.id,
      document ? "update_compliance_document" : "update_compliance",
      "manual_compliance",
      key,
      document ? `${completedDate} · 증빙 이미지 등록` : completedDate,
    );
    return Response.json({ ok: true, hasDocument, sizeBytes: document?.data.byteLength ?? 0 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const form = await request.formData();
    const category = form.get("category");
    if (!isManualDocumentCategory(category)) throw new Error("자료 분류가 올바르지 않습니다.");
    if (category !== "roasting" && category !== "packing") {
      throw new Error("검사·교육·보건증 자료는 해당 D-day 카드에서 등록해 주세요.");
    }
    const title = textValue(form.get("title"), "자료명", 80);
    const documentDate = isoDate(form.get("documentDate"));
    const document = await prepareDocument(form.get("document"));

    const db = getD1();
    await ensureDocumentCapacity(db, document.data.byteLength);

    const result = await db
      .prepare(
        `INSERT INTO manual_documents
          (category, title, document_date, file_name, content_type, size_bytes, data, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        category,
        title,
        documentDate,
        document.fileName,
        document.contentType,
        document.data.byteLength,
        document.data,
        user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(user.id, "upload_manual_document", "manual_document", String(id), `${title} · ${documentDate}`);
    return Response.json({ id, sizeBytes: document.data.byteLength }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
