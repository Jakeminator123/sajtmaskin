import type { Metadata } from "next";
import { publicCanonicalPath, publicPageAlternates } from "@/lib/public-canonical-url";
import HomePageClient from "./home-page-client";

const title = "Skapa hemsida med AI för företag | Sajtmaskin";
const description =
  "Skapa en professionell hemsida med AI. Beskriv ditt företag, anpassa utkastet och publicera med egen domän. Börja utan kreditkort.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: publicPageAlternates("/"),
  // Keep the production/preview robots policy inherited from the root layout.
  openGraph: {
    title,
    description,
    url: publicCanonicalPath("/"),
    type: "website",
    locale: "sv_SE",
    siteName: "Sajtmaskin",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
