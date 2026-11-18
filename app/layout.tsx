import type { Metadata } from "next";
import {PwaRegistration} from "./components/PwaRegistration";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import "./release-quality.css";
import "./interface.css";
import "./learning.css";
import "./course-landing.css";
import "./push.css";

const title = "더컵에듀 | 커피 교육과 수강 상담";
const description = "SCA 바리스타·브루잉·로스팅·센서리·그린커피, 디플로마와 기업교육. 교육 상담부터 수강 등록, 시간대 예약까지 더컵에듀에서 함께하세요.";
const shareTitle = "THE CUP EDU";
const shareDescription = "COFFEE STATION";

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = new URL("https://thecup-edu.pages.dev");
  const imageUrl = new URL("/brand/thecup-edu-share-v2.png", metadataBase).toString();

  return {
    metadataBase,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "더컵에듀", statusBarStyle: "default" },
    title,
    description,
    icons: { icon: "/favicon.svg", apple: [{ url: "/icons/apple-touch-180.png", sizes: "180x180", type: "image/png" }] },
    openGraph: {
      type: "website",
      title: shareTitle,
      description: shareDescription,
      siteName: shareTitle,
      locale: "ko_KR",
      images: [{ url: imageUrl, width: 1200, height: 630, type: "image/png", alt: "THE CUP EDU · COFFEE STATION" }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body><PwaRegistration /><a className="skip-link" href="#main-content">본문으로 이동</a>{children}</body>
    </html>
  );
}
