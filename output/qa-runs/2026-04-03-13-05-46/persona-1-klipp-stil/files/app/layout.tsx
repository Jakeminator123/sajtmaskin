import React from "react";
import type { Metadata } from "next";

import { Inter, Sora } from "next/font/google";

import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StructuredData } from "@/components/structured-data";
import { siteConfig } from "@/lib/site";
import type { ReactNode } from "react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: siteConfig.legalTitle,
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  openGraph: {
    title: siteConfig.legalTitle,
    description: siteConfig.description,
    siteName: siteConfig.name,
    locale: "sv_SE",
    type: "website",
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "Klipp & Stil i Göteborg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.legalTitle,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className={`${inter.variable} ${sora.variable} min-h-screen bg-background text-foreground`}>
        <div className="relative flex min-h-screen flex-col overflow-x-hidden">
          <SiteHeader />
          <StructuredData />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}