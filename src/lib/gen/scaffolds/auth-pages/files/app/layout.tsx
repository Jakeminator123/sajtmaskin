import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "[Produktnamn]",
  description: "Logga in eller skapa konto.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
