import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CubeLabDemo } from "@/components/builder/cube/CubeLabDemo";

export const metadata: Metadata = {
  title: "Kuben (labb)",
  robots: { index: false, follow: false },
};

/** Labbyta för byggkuben. Ingen env/databas; stängd i produktion. */
export default function CubeLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <CubeLabDemo />;
}
