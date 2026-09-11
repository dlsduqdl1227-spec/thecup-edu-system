import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import "./release-quality.css";

const title = "더컵에듀 커피 스테이션";
const description = "상담 승인 회원을 위한 에스프레소·브루잉·로스팅 스테이션 예약과 실습 기록 서비스";

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = new URL("https://thecup-edu-system.dlsduqdl1227.workers.dev");
  const imageUrl = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      title,
      description,
      locale: "ko_KR",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "더컵에듀 커피 스테이션" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
      <body><a className="skip-link" href="#main-content">본문으로 이동</a>{children}</body>
    </html>
  );
}
