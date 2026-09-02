import { requireUser } from "../../../lib/auth";
import { bookingMonthRange } from "../../../lib/booking";
import { buildCoursePublicId, parseCoursePayload } from "../../../lib/course-admin";
import { currentKoreanMonth, validateCourseMonth } from "../../../lib/course-openings";
import { audit, ensureDatabase, getD1 } from "../../../lib/db";
import { assertSameOrigin, jsonError } from "../../../lib/http";

type AdminCourseRow = {
  id: number;
  publicId: string;
  name: string;
  category: string;
  courseMonth: string;
  openingMinimum: number;
  capacity: number | null;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  isPublic: number;
  statusOverride: "AUTO" | "CLOSED";
  displayOrder: number;
  durationHours: number;
  tuition: number;
  feeNote: string;
  createdAt: string;
  updatedAt: string;
};

type ScheduleMonthRow = {
  month: string;
  totalSlots: number;
  operationDays: number;
  openSlots: number;
  blockedSlots: number;
};

type ScheduleDayRow = {
  date: string;
  totalSlots: number;
  openSlots: number;
  blockedSlots: number;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requireUser(request, ["admin"]);
    const url = new URL(request.url);
    const month = validateCourseMonth(url.searchParams.get("month") ?? currentKoreanMonth());
    const range = bookingMonthRange(month);
    const db = getD1();
    const [coursesResult, applicantsResult, visibilitySetting, scheduleMonthsResult, scheduleDaysResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, public_id AS publicId, name, category, course_month AS courseMonth,
                  opening_minimum AS openingMinimum, capacity,
                  recruitment_start_date AS recruitmentStartDate,
                  recruitment_end_date AS recruitmentEndDate,
                  is_public AS isPublic, status_override AS statusOverride,
                  display_order AS displayOrder, duration_hours AS durationHours,
                  tuition, fee_note AS feeNote, created_at AS createdAt, updated_at AS updatedAt
           FROM course_openings
           WHERE course_month = ?
           ORDER BY display_order, id`,
        )
        .bind(month)
        .all<AdminCourseRow>(),
      db
        .prepare(
          `SELECT a.id, a.course_id AS courseId, a.applicant_name AS applicantName,
                  a.phone_last4 AS phoneLast4, a.status, a.notes,
                  a.created_at AS createdAt, a.updated_at AS updatedAt,
                  m.id AS bookingMemberId,
                  m.approval_status AS memberApprovalStatus
           FROM course_applicants a
           JOIN course_openings c ON c.id = a.course_id
           LEFT JOIN booking_members m ON m.phone_hash = a.phone_hash AND m.deleted_at IS NULL
           WHERE c.course_month = ?
           ORDER BY a.id DESC`,
        )
        .bind(month)
        .all(),
      db
        .prepare("SELECT value FROM app_settings WHERE key = 'public_course_openings_visible'")
        .first<{ value: string }>(),
      db
        .prepare(
          `SELECT substr(start_at, 1, 7) AS month,
                  COUNT(*) AS totalSlots,
                  COUNT(DISTINCT substr(start_at, 1, 10)) AS operationDays,
                  SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS openSlots,
                  SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blockedSlots
           FROM booking_slots
           WHERE substr(start_at, 1, 7) >= ?
           GROUP BY substr(start_at, 1, 7)
           ORDER BY month
           LIMIT 18`,
        )
        .bind(currentKoreanMonth())
        .all<ScheduleMonthRow>(),
      db
        .prepare(
          `SELECT substr(start_at, 1, 10) AS date,
                  COUNT(*) AS totalSlots,
                  SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS openSlots,
                  SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blockedSlots
           FROM booking_slots
           WHERE start_at >= ? AND start_at < ?
           GROUP BY substr(start_at, 1, 10)
           ORDER BY date`,
        )
        .bind(range.start, range.end)
        .all<ScheduleDayRow>(),
    ]);

    const applicants = applicantsResult.results as Array<Record<string, unknown> & { courseId: number; status: string }>;
    const courses = coursesResult.results.map((course) => {
      const courseApplicants = applicants.filter((applicant) => Number(applicant.courseId) === course.id);
      const currentApplicants = courseApplicants.filter(
        (applicant) => applicant.status === "WAITING" || applicant.status === "CONFIRMED",
      ).length;
      return { ...course, currentApplicants, applicants: courseApplicants };
    });
    return Response.json(
      {
        month,
        publicPageVisible: visibilitySetting?.value === "1",
        courses,
        scheduleMonths: scheduleMonthsResult.results,
        scheduleDays: scheduleDaysResult.results,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.publicPageVisible !== "boolean") {
      throw new Error("공개 페이지 노출 상태가 올바르지 않습니다.");
    }
    const publicPageVisible = payload.publicPageVisible;
    await getD1()
      .prepare(
        `INSERT INTO app_settings (key, value, updated_by, updated_at)
         VALUES ('public_course_openings_visible', ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(publicPageVisible ? "1" : "0", actor.id)
      .run();
    await audit(
      actor.id,
      "update_public_course_openings_visibility",
      "app_setting",
      "public_course_openings_visible",
      publicPageVisible ? "외부 개강 현황 공개" : "외부 개강 현황 숨김",
    );
    return Response.json({ publicPageVisible });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();
    const actor = await requireUser(request, ["admin"]);
    const payload = parseCoursePayload((await request.json()) as Record<string, unknown>);
    const publicId = buildCoursePublicId(payload.category, payload.courseMonth);
    const result = await getD1()
      .prepare(
        `INSERT INTO course_openings
          (public_id, name, category, course_month, opening_minimum, capacity,
           recruitment_start_date, recruitment_end_date, is_public, status_override,
           display_order, duration_hours, tuition, fee_note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        publicId,
        payload.name,
        payload.category,
        payload.courseMonth,
        payload.openingMinimum,
        payload.capacity,
        payload.recruitmentStartDate,
        payload.recruitmentEndDate,
        payload.isPublic,
        payload.statusOverride,
        payload.displayOrder,
        payload.durationHours,
        payload.tuition,
        payload.feeNote,
        actor.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await audit(actor.id, "create_course_opening", "course_opening", String(id), `${payload.courseMonth} · ${payload.name}`);
    return Response.json({ id, publicId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
