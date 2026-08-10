import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: new URL(baseUrl),
    title: "Herbert — PDF 阅读助手",
    description: "把长 PDF 变成有重点、有页码、可核对的结构化总结。",
    openGraph: {
      title: "Herbert — PDF 阅读助手",
      description: "读懂长文，从抓住重点开始。",
      type: "website",
      images: [{ url: socialImage, width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Herbert — PDF 阅读助手",
      description: "读懂长文，从抓住重点开始。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
