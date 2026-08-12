import { requirePermission, requireUser } from "../../../lib/auth";
import { audit, ensureDatabase, getD1 } from "../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../lib/http";
import { calculateRorMetrics, parseRoastProfile, type RoastPointInput } from "../../../lib/roasting";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requirePermission(request, "roasting");
    const db = getD1();
    const profiles = await db
      .prepare(
        `SELECT p.id, p.bean_name AS beanName, p.origin, p.process,
                p.batch_weight AS batchWeight, p.charge_temp AS chargeTemp,
                COALESCE(p.turning_point_seconds, p.yellowing_seconds) AS turningPointSeconds,
                p.first_crack_seconds AS firstCrackSeconds,
                p.drop_temp AS dropTemp, p.total_seconds AS totalSeconds,
                p.development_seconds AS developmentSeconds,
                p.development_ratio AS developmentRatio,
                p.gas_notes AS gasNotes, p.notes, p.created_at AS createdAt,
                s.name AS createdByName
         FROM roasting_profiles p
         JOIN staff s ON s.id = p.created_by
         ORDER BY COALESCE(p.sort_order, 2147483647), p.id DESC`,
      )
      .all<Record<string, unknown>>();
    const points = await db
      .prepare(
        `SELECT profile_id AS profileId, seconds, bean_temp AS beanTemp, gas_pressure AS gasPressure
         FROM roasting_points ORDER BY profile_id, seconds`,
      )
      .all<{ profileId: number; seconds: number; beanTemp: number; gasPressure: number }>();
    const grouped = new Map<number, RoastPointInput[]>();
    for (const point of points.results) {
      const list = grouped.get(point.profileId) ?? [];
      list.push(point);
      grouped.set(point.profileId, list);
    }
    const result = profiles.results.map((profile) => {
      const profilePoints = (grouped.get(Number(profile.id)) ?? []).map((point) => (
        point.seconds === 0 && point.beanTemp <= 0
          ? { ...point, beanTemp: Number(profile.chargeTemp) }
          : point
      ));
      return {
        ...profile,
        points: profilePoints,
        ror:
          profilePoints.length >= 2
            ? calculateRorMetrics(
                profilePoints,
                Number(profile.turningPointSeconds),
                Number(profile.firstCrackSeconds),
                Number(profile.totalSeconds),
              )
            : { turningToCrack: 0, development: 0 },
      };
    });
    return Response.json({ profiles: result });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const user = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const profile = parseRoastProfile(payload);
    const db = getD1();
    const insertProfile = db
      .prepare(
        `INSERT INTO roasting_profiles
          (bean_name, origin, process, batch_weight, charge_temp, yellowing_seconds, turning_point_seconds,
           first_crack_seconds, drop_temp, total_seconds, development_seconds,
           development_ratio, gas_notes, notes, created_by, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM roasting_profiles))`,
      )
      .bind(
        profile.beanName,
        profile.origin,
        profile.process,
        profile.batchWeight,
        profile.chargeTemp,
        profile.turningPointSeconds,
        profile.turningPointSeconds,
        profile.firstCrackSeconds,
        profile.dropTemp,
        profile.totalSeconds,
        profile.developmentSeconds,
        profile.developmentRatio,
        profile.gasNotes,
        profile.notes,
        user.id,
      );
    const results = await db.batch([
      insertProfile,
      ...profile.points.map((point) =>
        db
          .prepare(
            `INSERT INTO roasting_points (profile_id, seconds, bean_temp, gas_pressure)
             SELECT seq, ?, ?, ? FROM sqlite_sequence WHERE name = 'roasting_profiles'`,
          )
          .bind(point.seconds, point.beanTemp, point.gasPressure),
      ),
    ]);
    const id = Number(results[0].meta.last_row_id);
    await audit(user.id, "create_roast_profile", "roasting_profile", String(id), profile.beanName);
    return Response.json({ id }, { status: 201 });
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
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("수정할 로스팅 프로파일을 선택해 주세요.");
    const profile = parseRoastProfile(payload);
    const db = getD1();
    const existing = await db
      .prepare("SELECT id FROM roasting_profiles WHERE id = ?")
      .bind(id)
      .first<{ id: number }>();
    if (!existing) {
      return Response.json({ error: "수정할 로스팅 프로파일을 찾을 수 없습니다." }, { status: 404 });
    }
    await db.batch([
      db
        .prepare(
          `UPDATE roasting_profiles
           SET bean_name = ?, origin = ?, process = ?, batch_weight = ?, charge_temp = ?,
               yellowing_seconds = ?, turning_point_seconds = ?, first_crack_seconds = ?, drop_temp = ?, total_seconds = ?,
               development_seconds = ?, development_ratio = ?, gas_notes = ?, notes = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          profile.beanName,
          profile.origin,
          profile.process,
          profile.batchWeight,
          profile.chargeTemp,
          profile.turningPointSeconds,
          profile.turningPointSeconds,
          profile.firstCrackSeconds,
          profile.dropTemp,
          profile.totalSeconds,
          profile.developmentSeconds,
          profile.developmentRatio,
          profile.gasNotes,
          profile.notes,
          id,
        ),
      db.prepare("DELETE FROM roasting_points WHERE profile_id = ?").bind(id),
      ...profile.points.map((point) =>
        db
          .prepare(
            "INSERT INTO roasting_points (profile_id, seconds, bean_temp, gas_pressure) VALUES (?, ?, ?, ?)",
          )
          .bind(id, point.seconds, point.beanTemp, point.gasPressure),
      ),
    ]);
    await audit(user.id, "update_roast_profile", "roasting_profile", String(id), profile.beanName);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
