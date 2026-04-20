# When to use

Use this dossier for a marketing or SaaS landing page built with Next.js App Router when you want:

- a shared top-level layout
- SEO metadata at the app level
- site-wide header and footer framing
- Google Fonts loaded via `next/font`
- optional Google Analytics via `@next/third-parties/google`

This is a layout-level dossier, not a complete page kit. Pair it with actual landing-page sections such as hero, features, pricing, testimonials, FAQ, and CTA.

# How to integrate

## 1. Place the layout at the app root

Use an App Router root layout similar to this:

```tsx
import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Source_Sans_3, Manrope } from "next/font/google";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { siteDetails } from "@/data/siteDetails";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: siteDetails.metadata.title,
  description: siteDetails.metadata.description,
  openGraph: {
    title: siteDetails.metadata.title,
    description: siteDetails.metadata.description,
    url: siteDetails.siteUrl,
    type: "website",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 675,
        alt: siteDetails.siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteDetails.metadata.title,
    description: siteDetails.metadata.description,
    images: ["/images/twitter-image.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.className} ${sourceSans.className} antialiased`}>
        {siteDetails.googleAnalyticsId ? (
          <GoogleAnalytics gaId={siteDetails.googleAnalyticsId} />
        ) : null}
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

## 2. Centralize site metadata

Back the layout with a single shared config object. The exact file can vary, but keep these fields centralized:

```ts
export const siteDetails = {
  siteName: "Your Product",
  siteUrl: "https://example.com",
  googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID,
  metadata: {
    title: "Your Product — Short value proposition",
    description: "One clear sentence describing who it is for and what problem it solves.",
  },
};
```

This keeps SEO, analytics, and social previews consistent.

## 3. Keep analytics optional

Only render Google Analytics when the env var is present:

```tsx
{siteDetails.googleAnalyticsId ? (
  <GoogleAnalytics gaId={siteDetails.googleAnalyticsId} />
) : null}
```

Do not hard-fail local or preview builds if analytics is missing.

## 4. Provide required supporting components

This layout assumes:

- `@/components/Header`
- `@/components/Footer`
- `@/data/siteDetails`
- `app/globals.css`

The header/footer should stay lightweight and marketing-oriented: logo, primary nav, CTA, legal/footer links.

## 5. Add page-level sections separately

Use this layout with route content such as:

```tsx
export default function Page() {
  return (
    <>
      <section>{/* Hero */}</section>
      <section>{/* Social proof */}</section>
      <section>{/* Features */}</section>
      <section>{/* Pricing */}</section>
      <section>{/* FAQ */}</section>
      <section>{/* Final CTA */}</section>
    </>
  );
}
```

# UX rules

- Keep the header persistent and simple; avoid app-style navigation overload.
- The main CTA in the header should match the hero CTA.
- Metadata title and description must reflect the actual offer, not generic template text.
- Social preview images should exist at the referenced paths or be updated.
- Use one primary font pairing at the layout level; avoid per-section font churn.
- Analytics must not block rendering or require client-side setup beyond the standard script injection.
- For landing pages, `<main>` should contain marketing sections only; avoid dashboard chrome patterns.

# Avoid

- Do not ship placeholder metadata, URLs, image paths, or product names.
- Do not assume `siteDetails.googleAnalyticsId` exists in all environments.
- Do not add heavy interactive logic to the root layout.
- Do not couple the layout to one specific brand palette or demo copy if reusing across projects.
- Do not use this dossier as the only content source for a landing page; it is the shell, not the full page implementation.

# Verification

- Confirm the app renders with a header, main content area, and footer.
- Confirm fonts load correctly via `next/font` with no CLS-inducing manual font setup.
- Confirm metadata is visible in page source and social tags are populated.
- If `GOOGLE_ANALYTICS_ID` is set, confirm the GA script is present in the rendered HTML.
- If `GOOGLE_ANALYTICS_ID` is absent, confirm the page still builds and renders without errors.
- Confirm `/images/og-image.jpg` and `/images/twitter-image.jpg` exist, or update the metadata paths.
- Confirm the layout works across all landing-page routes in the App Router.
