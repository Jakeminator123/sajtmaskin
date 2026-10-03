import type { Metadata } from "next";
import { publicPageAlternates } from "@/lib/public-canonical-url";
import { TeknikContent } from "./teknik-content";

export const metadata: Metadata = {
  title: "Teknik",
  description:
    "Tekniken bakom Sajtmaskin — React, Next.js, TypeScript, prestanda och en modern stack. Detaljerad teknisk grund för sajter byggda för svenska företag.",
  alternates: publicPageAlternates("/teknik"),
};

export default function TeknikPage() {
  return <TeknikContent />;
}
