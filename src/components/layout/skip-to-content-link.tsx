"use client";

import type { MouseEvent } from "react";

/**
 * "Hoppa till innehåll" — första tabbstoppet på varje sida. Sidorna har
 * inget gemensamt id på sitt huvudinnehåll, så länken letar upp
 * `#main-content` eller första `<main>` och flyttar fokus dit.
 */
export function SkipToContentLink() {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target =
      document.getElementById("main-content") ?? document.querySelector<HTMLElement>("main");
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
    target.scrollIntoView?.({ block: "start" });
  };

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      className="focus:bg-background focus:text-foreground focus:ring-primary sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2"
    >
      Hoppa till innehåll
    </a>
  );
}
