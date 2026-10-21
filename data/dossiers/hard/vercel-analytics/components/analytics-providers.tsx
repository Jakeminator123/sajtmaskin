"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Temporary CI measurement: unchanged component behavior.
export function AnalyticsProviders() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
