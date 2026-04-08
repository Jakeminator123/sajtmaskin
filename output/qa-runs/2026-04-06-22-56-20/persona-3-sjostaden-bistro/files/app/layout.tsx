import React from "react";
import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { ReactNode } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sjöstaden Bistro — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Boka bord för lunch eller middag och fråga om catering för ditt event.",
  keywords: [
    "Sjöstaden Bistro",
    "restaurang Malmö",
    "modern skandinavisk mat",
    "lunch Malmö",
    "à la carte Malmö",
    "catering Malmö",
    "boka bord Malmö",
    "lokala råvaror",
  ],
  openGraph: {
    title:
      "Sjöstaden Bistro — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Välkommen till Sjöstaden Bistro i Malmö för lunch, middag och catering med säsongens råvaror i en mörk och elegant miljö.",
    type: "website",
    locale: "sv_SE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className="dark">
      <body
        className={`${manrope.variable} ${cormorant.variable} bg-background text-foreground antialiased`}
      >
        <div className="relative min-h-screen overflow-x-hidden">
          <SiteHeader />
          <main className="min-h-screen">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}