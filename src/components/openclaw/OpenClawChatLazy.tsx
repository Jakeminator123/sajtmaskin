"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const OpenClawChat = dynamic(
  () => import("./OpenClawChat").then((m) => m.OpenClawChat),
  { ssr: false },
);

export function OpenClawChatLazy() {
  const pathname = usePathname();
  if (pathname === "/alina" || pathname === "/alina/chatt") return null;
  return <OpenClawChat />;
}
