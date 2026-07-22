import type { Metadata } from "next";
import { TeknikContent } from "./teknik-content";

export const metadata: Metadata = {
  title: "Teknik",
  description:
    "Tekniken bakom Sajtmaskin — React, Next.js, TypeScript, prestanda och en modern stack. Detaljerad teknisk grund för sajter byggda för svenska företag.",
};

export default function TeknikPage() {
  return <TeknikContent />;
}
