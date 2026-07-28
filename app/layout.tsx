import type { Metadata } from "next";
import { headers } from "next/headers";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const title = "더컵에듀 시스템";
const description = "더컵에듀의 재고, 매출, 영수증, 로스팅 프로파일을 연결한 통합 운영 시스템";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      locale: "ko_KR",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "더컵에듀 시스템 — 재고 · 매출 · 로스팅" }],
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
      <body>{children}</body>
    </html>
  );
}
