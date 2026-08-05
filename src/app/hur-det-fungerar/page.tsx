import type { Metadata } from "next";
import { HurDetFungerarContent } from "./hur-content";

export const metadata: Metadata = {
  title: "Hur det fungerar",
  description:
    "Så fungerar Sajtmaskin — från första idé till publicerad sajt, med kvalitet, steg och integrationer för svenska företag.",
};

export default function HurDetFungerarPage() {
  return <HurDetFungerarContent />;
}
