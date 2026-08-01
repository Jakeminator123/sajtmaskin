const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

function normalizeFlag(value: string | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isGenerationLogEnabled(): boolean {
  const raw = normalizeFlag(process.env.GENERATIONSLOGG);
  if (!raw || FALSE_VALUES.has(raw)) return false;
  return process.env.NODE_ENV !== "production";
}
