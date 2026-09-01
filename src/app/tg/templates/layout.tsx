import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "PeachBitch — Шаблоны",
  description: "Лента шаблонов PeachBitch",
};

export default function TgLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
