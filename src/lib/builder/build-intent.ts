export type BuildIntent = "template" | "website" | "app";

export type BuildMethod = "wizard" | "category" | "audit" | "freeform" | "kostnadsfri";

export const DEFAULT_BUILD_INTENT: BuildIntent = "website";

export function normalizeBuildIntent(raw?: string | null): BuildIntent {
  const value = String(raw || "").toLowerCase();
  if (value === "template" || value === "website" || value === "app") {
    return value;
  }
  return DEFAULT_BUILD_INTENT;
}

export function normalizeBuildMethod(raw?: string | null): BuildMethod | null {
  const value = String(raw || "").toLowerCase();
  if (value === "wizard" || value === "category" || value === "audit" || value === "freeform" || value === "kostnadsfri") {
    return value;
  }
  return null;
}

export function resolveBuildIntentForMethod(
  method: BuildMethod | null | undefined,
  selected: BuildIntent,
): BuildIntent {
  if (method === "category") return "template";
  if (method === "audit" || method === "kostnadsfri") return "website";
  return selected;
}

export function buildIntentNoun(intent: BuildIntent): string {
  if (intent === "template") return "template";
  if (intent === "app") return "app";
  return "website";
}
