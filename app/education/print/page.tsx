import type { Metadata } from "next";
import { ScaPrint } from "../../components/ScaPrint";
import "./print.css";

export const metadata: Metadata = {
  title: "교육자료 PDF 저장·인쇄 | 더컵에듀",
  robots: { index: false, follow: false },
};

// Content is fetched only through the existing authenticated course/level API.
// The HTML shell never embeds private decks or presenter notes.
export default function EducationPrintPage() { return <ScaPrint />; }
