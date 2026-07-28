import { normalizePhone, phoneHash, requireUser } from "../../../lib/auth";
import { audit, ensureDatabase, getD1, type StaffRole } from "../../../lib/db";
import { assertSameOrigin, jsonError, textValue } from "../../../lib/http";

const allowedRoles: StaffRole[] = ["admin", "employee", "instructor"];

function permissionFlag(value: unknown): number {
  return value === true || value === 1 || value === "1" || value === "on" ? 1 : 0;
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request, ["admin"]);
    const staff = await getD1()
      .prepare(
        `SELECT id, name, phone_last4 AS phoneLast4, role,
                CASE WHEN role = 'admin' THEN 1 ELSE can_finance END AS canFinance,
                CASE WHEN role = 'admin' THEN 1 ELSE can_inventory END AS canInventory,
                CASE WHEN role = 'admin' THEN 1 ELSE can_roasting END AS canRoasting,
                active, created_at AS createdAt
         FROM staff
         WHERE deleted_at IS NULL
         ORDER BY active DESC, role, name`,
      )
      .all();
    const audits = await getD1()
      .prepare(
        `SELECT a.id, a.action, a.entity_type AS entityType, a.detail,
                a.created_at AS createdAt, s.name AS actorName
         FROM audit_logs a LEFT JOIN staff s ON s.id = a.actor_id
         ORDER BY a.id DESC LIMIT 30`,
      )
      .all();
    return Response.json({ staff: staff.results, audits: audits.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const name = textValue(payload.name, "이름", 40).replace(/\s+/g, " ");
    const phone = normalizePhone(String(payload.phone ?? ""));
    const role = String(payload.role ?? "") as StaffRole;
    const canFinance = role === "admin" ? 1 : permissionFlag(payload.canFinance);
    const canInventory = role === "admin" ? 1 : permissionFlag(payload.canInventory);
    const canRoasting = role === "admin" ? 1 : permissionFlag(payload.canRoasting);
    if (!allowedRoles.includes(role)) throw new Error("권한을 선택해 주세요.");

    const result = await getD1()
      .prepare(
        `INSERT INTO staff
          (name, phone_hash, phone_last4, role, can_finance, can_inventory, can_roasting)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        await phoneHash(phone),
        phone.slice(-4),
        role,
        canFinance,
        canInventory,
        canRoasting,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(
      actor.id,
      "create_staff",
      "staff",
      String(id),
      `${name} · ${role} · 매출 ${canFinance} · 재고 ${canInventory} · 로스팅 ${canRoasting}`,
    );
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      return Response.json({ error: "이미 등록된 휴대폰 번호입니다." }, { status: 409 });
    }
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
    const role = String(payload.role ?? "") as StaffRole;
    const active = payload.active === true ? 1 : 0;
    const canFinance = role === "admin" ? 1 : permissionFlag(payload.canFinance);
    const canInventory = role === "admin" ? 1 : permissionFlag(payload.canInventory);
    const canRoasting = role === "admin" ? 1 : permissionFlag(payload.canRoasting);
    if (!Number.isInteger(id) || id <= 0) throw new Error("직원을 선택해 주세요.");
    if (!allowedRoles.includes(role)) throw new Error("권한을 선택해 주세요.");
    if (id === actor.id && (!active || role !== "admin")) {
      throw new Error("현재 로그인한 관리자 본인의 권한은 낮추거나 비활성화할 수 없습니다.");
    }

    const db = getD1();
    const target = await db
      .prepare("SELECT role, active FROM staff WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first<{ role: StaffRole; active: number }>();
    if (!target) {
      return Response.json({ error: "변경할 직원을 찾을 수 없습니다." }, { status: 404 });
    }
    if (target.role === "admin" && Boolean(target.active) && (!active || role !== "admin")) {
      const administrators = await db
        .prepare("SELECT COUNT(*) AS count FROM staff WHERE role = 'admin' AND active = 1 AND deleted_at IS NULL")
        .first<{ count: number }>();
      if (Number(administrators?.count ?? 0) <= 1) {
        throw new Error("마지막 활성 관리자의 권한은 낮추거나 비활성화할 수 없습니다.");
      }
    }

    await db
      .prepare(
        `UPDATE staff
         SET role = ?, can_finance = ?, can_inventory = ?, can_roasting = ?,
             active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(role, canFinance, canInventory, canRoasting, active, id)
      .run();
    await audit(
      actor.id,
      "update_staff",
      "staff",
      String(id),
      `${role} · 매출 ${canFinance} · 재고 ${canInventory} · 로스팅 ${canRoasting} · active=${active}`,
    );
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
    if (!Number.isInteger(id) || id <= 0) throw new Error("삭제할 직원을 선택해 주세요.");
    if (id === actor.id) throw new Error("현재 로그인한 관리자 본인의 계정은 삭제할 수 없습니다.");

    const db = getD1();
    const target = await db
      .prepare("SELECT name, role, active FROM staff WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first<{ name: string; role: StaffRole; active: number }>();
    if (!target) {
      return Response.json({ error: "삭제할 직원을 찾을 수 없습니다." }, { status: 404 });
    }
    if (target.role === "admin" && Boolean(target.active)) {
      const administrators = await db
        .prepare("SELECT COUNT(*) AS count FROM staff WHERE role = 'admin' AND active = 1 AND deleted_at IS NULL")
        .first<{ count: number }>();
      if (Number(administrators?.count ?? 0) <= 1) {
        throw new Error("마지막 활성 관리자 계정은 삭제할 수 없습니다.");
      }
    }

    await db.batch([
      db.prepare("DELETE FROM sessions WHERE staff_id = ?").bind(id),
      db
        .prepare(
          `UPDATE staff
           SET active = 0,
               phone_hash = 'deleted:' || id || ':' || phone_hash,
               phone_last4 = '',
               deleted_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(id),
    ]);
    await audit(actor.id, "delete_staff", "staff", String(id), `${target.name} · 계정 삭제`);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
