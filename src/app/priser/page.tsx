import type { Metadata } from "next";
import { PriserContent } from "./priser-content";

export const metadata: Metadata = {
  title: "Priser",
  description:
    "Priser för Sajtmaskin — credit-paket utan bindningstid och SajtStudio när du vill ha ett team bredvid dig.",
};

export default function PriserPage() {
  return <PriserContent />;
}
