import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Portfoliostart",
  description: "En ren portfoliostart med utvalt arbete, text och kontaktsektioner.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={inter.variable}>
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
