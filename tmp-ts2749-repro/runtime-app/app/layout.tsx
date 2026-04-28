import { Metadata } from "next";
import type { ReactNode } from "react";
import { Bungee, Inter } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const bungee = Bungee({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://glodburgerclub.se"),
  title: {
    default: "Hamburgerrestaurang",
    template: "%s | Hamburgerrestaurang",
  },
  description:
    "Modern och responsiv hemsida för en hamburgerrestaurang med om oss-sida och ett roligt hamburgerspel.",
  keywords: [
    "hamburgerrestaurang",
    "burgare",
    "hamburgerspel",
    "restaurang hemsida",
    "street food",
    "responsiv webbdesign",
    "parallax",
  ],
  openGraph: {
    title: "Glöd Burger Club",
    description:
      "Saftiga burgare, skön vibe och ett lekfullt hamburgerspel i en responsiv restaurangupplevelse.",
    url: "https://glodburgerclub.se",
    siteName: "Glöd Burger Club",
    locale: "sv_SE",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
        width: 1200,
        height: 630,
        alt: "Närbild på saftig hamburgare med smält ost",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Glöd Burger Club",
    description:
      "Cool, lekfull och aptitlig hemsida för burgerälskare — med ett eget hamburgerspel.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Glöd Burger Club",
  description:
    "Modern hamburgerrestaurang i Stockholm med smashburgare, vegetariska alternativ, takeaway och ett lekfullt hamburgerspel.",
  url: "https://glodburgerclub.se",
  image:
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  telephone: "+46 8 123 45 678",
  servesCuisine: ["Hamburgare", "Street food"],
  priceRange: "$",
  address: {
    "@type": "PostalAddress",
    streetAddress: "S:t Eriksgatan 45",
    addressLocality: "Stockholm",
    postalCode: "112 34",
    addressCountry: "SE",
  },
  sameAs: [
    "https://www.instagram.com/glodburgerclub",
    "https://www.tiktok.com/@glodburgerclub",
  ],
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"],
      opens: "11:00",
      closes: "21:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Friday", "Saturday"],
      opens: "11:00",
      closes: "23:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "12:00",
      closes: "20:00",
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${bungee.variable} flex min-h-screen flex-col bg-background text-foreground`}
      >
        <noscript>
          <style>{`[data-animate]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          Hoppa till innehåll
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
        <SiteHeader />
        <main id="main-content" className="flex-1 overflow-x-clip">
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}