import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import "./release-quality.css";

const title = "더컵에듀 커피 스테이션";
const description = "상담 승인 회원을 위한 에스프레소·브루잉·로스팅 스테이션 예약과 실습 기록 서비스";
const shareTitle = "THE CUP EDU";
const shareDescription = "COFFEE STATION";

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = new URL("https://thecup-edu-system.dlsduqdl1227.workers.dev");
  const imageUrl = new URL("/brand/thecup-edu-share-v2.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/favicon.svg" },
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
      <body><a className="skip-link" href="#main-content">본문으로 이동</a>{children}</body>
    </html>
  );
}
