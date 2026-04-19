import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Portfolio Starter",
  description: "A clean portfolio starter with selected work, writing, and contact sections.",
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
