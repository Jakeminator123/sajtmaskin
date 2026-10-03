import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicPageAlternates } from "@/lib/public-canonical-url";

export const metadata: Metadata = {
  title: "Vanliga frågor",
  description:
    "Här samlar vi de vanligaste frågorna om hur plattformen fungerar, vilken teknik som används och hur snabbt du kan gå från idé till publicerad sajt.",
  alternates: publicPageAlternates("/faq"),
};

export default function FaqLayout({ children }: { children: ReactNode }) {
  return children;
}
