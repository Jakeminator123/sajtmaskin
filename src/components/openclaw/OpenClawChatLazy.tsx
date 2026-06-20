"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const OpenClawChat = dynamic(
  () => import("./OpenClawChat").then((m) => m.OpenClawChat),
  { ssr: false },
);

export function OpenClawChatLazy() {
  const pathname = usePathname();
  // På /studio bor OpenClaw (Sajtagenten) i builderns FloatingChat-fönster
  // i stället för den globala FAB:en — dölj FAB:en där så det inte blir två
  // separata chattfönster. Övriga rutter behåller den globala FAB:en.
  if (pathname?.startsWith("/studio")) return null;
  return <OpenClawChat />;
}
