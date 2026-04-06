"use client";

import { collectOpenClawTextFieldContext } from "@/lib/openclaw/text-field-actions";

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

export function collectOpenClawClientContext(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const baseContext = window.__SITEMASKIN_CONTEXT ?? null;
  const textFields = collectOpenClawTextFieldContext();
  if (!baseContext && textFields.length === 0) return null;
  return {
    ...(baseContext ?? {}),
    ...(textFields.length > 0 ? { textFields } : {}),
  };
}
