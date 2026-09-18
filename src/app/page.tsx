import type { Metadata } from "next";
import { publicPageAlternates } from "@/lib/public-canonical-url";
import HomePageClient from "./home-page-client";

export const metadata: Metadata = {
  alternates: publicPageAlternates("/"),
};

export default function HomePage() {
  return <HomePageClient />;
}
