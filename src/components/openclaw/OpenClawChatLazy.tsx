"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const OpenClawChat = dynamic(
  () => import("./OpenClawChat").then((m) => m.OpenClawChat),
  { ssr: false },
);

// Viewser-ytorna (publik marknadssajt + studio) har sin egen OpenClaw i
// builderns FloatingChat. Den globala "Sajtagenten"-FAB:en ska därför INTE
// visas på dessa rutter (redundant + två chattfönster). Native-ytor (t.ex.
// /builder) behåller den globala FAB:en.
const VIEWSER_SURFACE_PREFIXES = [
  "/studio",
  "/om-oss",
  "/produkt",
  "/kontakt",
  "/cookies",
  "/integritetspolicy",
  "/anvandarvillkor",
  "/for",
];

export function OpenClawChatLazy() {
  const pathname = usePathname() ?? "";
  const onViewserSurface =
    pathname === "/" ||
    VIEWSER_SURFACE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (onViewserSurface) return null;
  return <OpenClawChat />;
}
