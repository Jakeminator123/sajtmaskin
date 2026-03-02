import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "@/styles/landing-v2.css";
import { AnalyticsTracker, BetaBanner, CookieBanner } from "@/components/layout";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/components/layout/json-ld";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
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
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <noscript>
          <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#e5e7eb" }}>
            <h1>Sajtmaskin</h1>
            <p>AI-driven webbplatsgenerering. Skapa professionella webbplatser på minuter med AI. En tjänst från Pretty Good AB.</p>
            <p>JavaScript krävs för att använda Sajtmaskin. Aktivera JavaScript i din webbläsare och ladda om sidan.</p>
          </div>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
          <AnalyticsTracker />
          <Analytics />
          <SpeedInsights />
          <BetaBanner />
          {children}
          <Toaster position="top-right" />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
