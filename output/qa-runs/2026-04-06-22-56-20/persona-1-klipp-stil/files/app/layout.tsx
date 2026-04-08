import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteInfo } from "@/lib/site-data";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${siteInfo.name} — Frisörsalong i Göteborg med personlig klippning och färgning`,
  description:
    "Klipp & Stil i Göteborg erbjuder personlig klippning, färgning, styling och skäggvård. Boka tid online för ett lugnt salongsbesök mitt i stan.",
  keywords: [
    "frisör Göteborg",
    "klippning Göteborg",
    "färgning Göteborg",
    "styling Göteborg",
    "skäggvård Göteborg",
    "frisörsalong Göteborg",
    "boka frisör Göteborg",
  ],
  openGraph: {
    title: `${siteInfo.name} — Frisörsalong i Göteborg med personlig klippning och färgning`,
    description:
      "Klipp & Stil i Göteborg erbjuder personlig klippning, färgning, styling och skäggvård. Boka tid online för ett lugnt salongsbesök mitt i stan.",
    locale: "sv_SE",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body
        className={`${manrope.variable} ${cormorant.variable} bg-background text-foreground antialiased`}
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