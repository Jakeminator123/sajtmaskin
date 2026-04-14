import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "@/styles/landing-v2.css";
import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { OrganizationJsonLd, SoftwareApplicationJsonLd } from "@/components/layout/json-ld";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/sonner";
import { URLS } from "@/lib/config";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
  metadataBase: new URL(URLS.baseUrl),
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-csp-nonce") ?? undefined;

  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';localStorage.setItem('theme','light')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <noscript>
          <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#1e293b" }}>
            <h1>Sajtmaskin</h1>
            <p>AI-driven webbplatsgenerering. Skapa professionella webbplatser på minuter med AI. En tjänst från Pretty Good AB.</p>
            <p>JavaScript krävs för att använda Sajtmaskin. Aktivera JavaScript i din webbläsare och ladda om sidan.</p>
          </div>
        </noscript>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} nonce={nonce}>
          <OrganizationJsonLd />
          <SoftwareApplicationJsonLd />
          <AnalyticsTracker />
          <Analytics />
          <SpeedInsights />
          {children}
          <Toaster position="top-right" />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
