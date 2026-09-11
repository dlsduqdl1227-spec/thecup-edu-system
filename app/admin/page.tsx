import { EduSystemApp } from "../components/EduSystemApp";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "운영 관리 | 더컵에듀",
  description: "더컵에듀 운영자와 강사를 위한 교육·재고·예약 관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <EduSystemApp />;
}
