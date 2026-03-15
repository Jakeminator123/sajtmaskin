const V0_FALLBACK_TRUTHY = new Set(["y", "yes", "true", "1"]);

export function isV0FallbackEnabledValue(raw?: string | null): boolean {
  return V0_FALLBACK_TRUTHY.has((raw ?? "").trim().toLowerCase());
}

export function isV0FallbackBuilderEnabled(): boolean {
  return isV0FallbackEnabledValue(process.env.V0_FALLBACK_BUILDER);
}
