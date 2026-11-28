import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuilderLab } from "./_components/builder-lab";
import "./builder-lab.css";

export const metadata: Metadata = {
  title: "Builder-labb",
  robots: { index: false, follow: false },
};

/**
 * Fristående UI/UX-koncept för buildern (mockdata, inga API-anrop).
 * Stängd i produktion så att den aldrig syns för kunder om grenen mergas.
 */
export default function BuilderLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <BuilderLab />;
}
