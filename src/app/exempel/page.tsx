import type { Metadata } from "next";
import { ExempelContent } from "./exempel-content";
import { ExempelShell } from "./exempel-shell";
import { EXEMPEL_CANONICAL_URL, EXEMPEL_DISCLOSURE } from "@/lib/exempel/showcase-sites";

export const metadata: Metadata = {
  title: "Exempel på hemsidor",
  description:
    "Se fem Sajtmaskin-exempel: Byråflöde, Springa, Palma, Paddlelines och Glass. Rekonstruktioner som visar visuella riktningar — inte kundomdömen eller riktiga verksamheter.",
  alternates: { canonical: EXEMPEL_CANONICAL_URL },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Exempel på hemsidor",
    description:
      "Fem demonstrationsprojekt som visar visuella riktningar och användningsfall. Inte kundcase.",
    url: EXEMPEL_CANONICAL_URL,
    type: "website",
    locale: "sv_SE",
    siteName: "Sajtmaskin",
    images: [
      {
        url: "/exempel/og.webp",
        width: 1200,
        height: 630,
        alt: "Sajtmaskin-exempel: fem rekonstruktioner av hemsideidéer.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Exempel på hemsidor",
    description: EXEMPEL_DISCLOSURE,
    images: ["/exempel/og.webp"],
  },
};

export default function ExempelPage() {
  return (
    <ExempelShell>
      <ExempelContent />
    </ExempelShell>
  );
}
