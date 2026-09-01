import type { Metadata } from "next";
import { PublicCourseOpenings } from "../../components/PublicCourseOpenings";
import { currentKoreanMonth } from "../../../lib/course-openings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "실시간 개강 현황 | 더컵에듀",
  description: "더컵에듀 과정별 수강 희망 인원과 실시간 개강 현황",
  robots: { index: true, follow: true },
};

export default async function PublicCourseOpeningsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const requested = (await searchParams).month;
  const month = requested && requested !== "current" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
    ? requested
    : currentKoreanMonth();
  return <PublicCourseOpenings initialMonth={month} />;
}
