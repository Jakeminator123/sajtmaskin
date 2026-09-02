"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SESSION_FLAG = "visit-counted";

interface VisitBeaconProps {
  /**
   * Paths that must not be counted. The statistics page itself is excluded
   * by default so the owner checking the numbers does not inflate them.
   */
  excludePaths?: string[];
}

/**
 * Invisible page-view beacon. Mount ONCE in the root layout (inside <body>).
 * Posts one hit per navigation to `/api/visits`; the first hit of a browser
 * session is also counted as a visit. Renders nothing, never throws and never
 * blocks navigation (fire-and-forget with `keepalive`).
 */
export function VisitBeacon({ excludePaths = ["/statistik"] }: VisitBeaconProps) {
  const pathname = usePathname();
  const lastCounted = useRef<string | null>(null);
  const excludeKey = excludePaths.join("|");

  useEffect(() => {
    if (!pathname || pathname === lastCounted.current) return;
    const excluded = excludeKey
      .split("|")
      .filter(Boolean)
      .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (excluded) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    lastCounted.current = pathname;

    let newVisitor = false;
    try {
      if (!window.sessionStorage.getItem(SESSION_FLAG)) {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
        newVisitor = true;
      }
    } catch {
      // Storage blocked (private mode / cookie settings): count the view only.
    }

    fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newVisitor }),
      keepalive: true,
    }).catch(() => {
      // A failing counter must never surface to the visitor.
    });
  }, [pathname, excludeKey]);

  return null;
}
