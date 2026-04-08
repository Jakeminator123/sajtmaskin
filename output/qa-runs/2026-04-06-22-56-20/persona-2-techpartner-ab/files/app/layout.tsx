import React from "react";
import type { Metadata } from "next";

import { Manrope } from "next/font/google";

import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createMetadata } from "@/lib/metadata";
import type { ReactNode } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = createMetadata({
  title:
    "TechPartner AB — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "TechPartner AB hjälper företag i Stockholm med systemutveckling, moln och IT-säkerhet. Vi skapar trygga plattformar med tydlig affärsnytta och långsiktigt ansvar.",
  keywords: [
    "systemutveckling Stockholm",
    "molnlösningar företag",
    "IT-säkerhet företag",
    "teknikpartner B2B",
    "TechPartner AB",
  ],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="sv" className="">
      <body
        className={`${manrope.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}