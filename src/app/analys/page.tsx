import type { Metadata } from "next";
import { publicPageAlternates } from "@/lib/public-canonical-url";
import { AnalysContent } from "./analys-content";

export const metadata: Metadata = {
  title: "Webbplatsanalys",
  description:
    "Klistra in er webbadress och få en genomgång av målgrupp, synlighet, innehåll och konvertering — med ett konkret nästa steg.",
  robots: { index: false, follow: false },
  alternates: publicPageAlternates("/analys"),
};

export default function AnalysPage() {
  return <AnalysContent />;
}
