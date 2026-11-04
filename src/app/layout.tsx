import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "@/styles/landing-v2.css";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { GoogleAdsTag } from "@/components/layout/google-ads-tag";
import { OpenAiAdsTag } from "@/components/layout/openai-ads-tag";
import { OrganizationJsonLd } from "@/components/layout/json-ld";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { OpenClawChatLazy } from "@/components/openclaw/OpenClawChatLazy";
import { OPENCLAW } from "@/lib/config";
import { PUBLIC_CANONICAL_ORIGIN, publicIndexRobots } from "@/lib/public-canonical-url";

const openclawSurfaceEnabled = OPENCLAW.surfaceEnabled;

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  preload: false,
  display: "optional",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
  display: "optional",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "optional",
  // Mobile LCP is the system-ui H1; don't let the heading font compete with CSS.
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Skapa hemsida med AI | Sajtmaskin",
    template: "%s | Sajtmaskin",
  },
  description:
    "Skapa en professionell hemsida med AI. Beskriv ditt företag, anpassa utkastet och publicera. Börja utan kreditkort.",
  metadataBase: new URL(PUBLIC_CANONICAL_ORIGIN),
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
  robots: publicIndexRobots(),
  // Do not set alternates.canonical here. Root metadata is inherited;
  // a canonical of "/" would make every child claim the homepage.
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // headers() for the CSP nonce makes this root layout dynamic, so marketing
  // pages cannot be ISR/static while nonce-based CSP remains. TTFB is already
  // ~0.2–0.5 s; caching HTML would require hash-CSP or PPR first.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-csp-nonce") ?? undefined;

  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      {/* `data-openclaw-surface`: builderns SajtagentProvider läser flaggan
          innan den gör något anrop (src/lib/openclaw/surface-flag.ts). */}
      <body
        className="font-sans antialiased"
        data-openclaw-surface={openclawSurfaceEnabled ? "1" : undefined}
      >
        <noscript>
          <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#e5e7eb" }}>
            <p>
              <strong>Sajtmaskin</strong>
            </p>
            <p>Skapa en professionell hemsida med AI. Beskriv ditt företag, anpassa utkastet och publicera. En tjänst från Pretty Good B.V.</p>
            <p>JavaScript krävs för att använda Sajtmaskin. Aktivera JavaScript i din webbläsare och ladda om sidan.</p>
          </div>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} nonce={nonce}>
          <OrganizationJsonLd />
          <AnalyticsTracker />
          <Suspense fallback={null}>
            <GoogleAdsTag nonce={nonce} />
          </Suspense>
          <OpenAiAdsTag nonce={nonce} />
          {children}
          <Toaster position="top-right" />
          {openclawSurfaceEnabled && <OpenClawChatLazy />}
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
