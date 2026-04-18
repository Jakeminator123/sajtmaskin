"use client";

import { useEffect } from "react";

export function PageviewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;

    void fetch("/api/pageviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug }),
    });
  }, [slug]);

  return null;
}
