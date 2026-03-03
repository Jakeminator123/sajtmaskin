"use client";

import dynamic from "next/dynamic";

const OpenClawChat = dynamic(
  () => import("./OpenClawChat").then((m) => m.OpenClawChat),
  { ssr: false },
);

export function OpenClawChatLazy() {
  return <OpenClawChat />;
}
