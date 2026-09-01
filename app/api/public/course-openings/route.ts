import {
  courseStatusLabel,
  currentKoreanMonth,
  deriveCourseOpeningStatus,
  formatKoreanTimestamp,
  methodNotAllowed,
  openingProgress,
  validateCourseMonth,
  type CourseStatusOverride,
} from "../../../../lib/course-openings";
import { ensureDatabase, getD1 } from "../../../../lib/db";

type PublicCourseRow = {
  publicId: string;
  name: string;
  category: string;
  openingMinimum: number;
  capacity: number | null;
  statusOverride: CourseStatusOverride;
  durationHours: number;
  tuition: number;
  feeNote: string;
  recruitmentStartDate: string | null;
  recruitmentEndDate: string | null;
  currentApplicants: number;
};

const cacheHeaders = {
  "Cache-Control": "public, max-age=30",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const month = validateCourseMonth(url.searchParams.get("month") ?? currentKoreanMonth());
    const db = getD1();
    const visibilitySetting = await db
      .prepare(
        `SELECT value, updated_at AS updatedAt
         FROM app_settings
         WHERE key = 'public_course_openings_visible'`,
      )
      .first<{ value: string; updatedAt: string }>();
    if (visibilitySetting?.value !== "1") {
      return new Response(
        JSON.stringify({
          month,
          isVisible: false,
          updatedAt: formatKoreanTimestamp(visibilitySetting?.updatedAt),
          totalApplicants: 0,
          courses: [],
        }),
        { status: 200, headers: cacheHeaders },
      );
    }
    const [coursesResult, updatedResult] = await Promise.all([
      db
        .prepare(
          `SELECT c.public_id AS publicId, c.name, c.category,
                  c.opening_minimum AS openingMinimum, c.capacity,
                  c.status_override AS statusOverride,
                  c.duration_hours AS durationHours, c.tuition, c.fee_note AS feeNote,
                  c.recruitment_start_date AS recruitmentStartDate,
                  c.recruitment_end_date AS recruitmentEndDate,
                  COUNT(DISTINCT CASE
                    WHEN a.status IN ('WAITING', 'CONFIRMED') THEN a.phone_hash
                    ELSE NULL
                  END) AS currentApplicants
           FROM course_openings c
           LEFT JOIN course_applicants a ON a.course_id = c.id
           WHERE c.course_month = ? AND c.is_public = 1
           GROUP BY c.id
           ORDER BY c.display_order, c.id`,
        )
        .bind(month)
        .all<PublicCourseRow>(),
      db
        .prepare(
          `SELECT MAX(changed_at) AS updatedAt
           FROM (
             SELECT updated_at AS changed_at
             FROM course_openings
             WHERE course_month = ? AND is_public = 1
             UNION ALL
             SELECT a.updated_at AS changed_at
             FROM course_applicants a
             JOIN course_openings c ON c.id = a.course_id
             WHERE c.course_month = ? AND c.is_public = 1
           )`,
        )
        .bind(month, month)
        .first<{ updatedAt: string | null }>(),
    ]);

    const courses = coursesResult.results.map((course) => {
      const currentApplicants = Number(course.currentApplicants ?? 0);
      const openingMinimum = Number(course.openingMinimum);
      const capacity = course.capacity === null ? null : Number(course.capacity);
      const remainingToOpen = Math.max(0, openingMinimum - currentApplicants);
      const status = deriveCourseOpeningStatus({
        currentApplicants,
        openingMinimum,
        capacity,
        statusOverride: course.statusOverride,
      });
      return {
        id: course.publicId,
        name: course.name,
        category: course.category,
        currentApplicants,
        openingMinimum,
        capacity,
        remainingToOpen,
        progress: openingProgress(currentApplicants, openingMinimum),
        status,
        statusLabel: courseStatusLabel(status, remainingToOpen),
        durationHours: Number(course.durationHours),
        tuition: Number(course.tuition),
        feeNote: course.feeNote,
        recruitmentStartDate: course.recruitmentStartDate,
        recruitmentEndDate: course.recruitmentEndDate,
      };
    });

    const totalApplicants = courses.reduce(
      (total, course) => total + course.currentApplicants,
      0,
    );

    return new Response(
      JSON.stringify({
        month,
        isVisible: true,
        updatedAt: formatKoreanTimestamp(updatedResult?.updatedAt),
        totalApplicants,
        courses,
      }),
      { status: 200, headers: cacheHeaders },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const message = detail.includes("진행 월")
      ? detail
      : "공개 모집 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: cacheHeaders });
  }
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
