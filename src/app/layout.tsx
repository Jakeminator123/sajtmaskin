import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AnalyticsTracker, BetaBanner, CookieBanner } from "@/components/layout";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/components/layout/json-ld";
import { ThemeProvider } from "next-themes";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Sajtmaskin – AI-driven webbplatsgenerering",
    template: "%s | Sajtmaskin",
  },
  description:
    "Skapa professionella webbplatser på minuter med AI. En tjänst från Pretty Good AB.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://sajtmaskin.se",
  ),
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Sajtmaskin",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const enableSpeedInsights = process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
          <AnalyticsTracker />
          {enableSpeedInsights ? <SpeedInsights /> : null}
          <BetaBanner />
          {children}
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
