/**
 * Canonical paid-audit tier semantics.
 *
 * `AuditMode` remains `"basic" | "advanced"` (Vanlig / Avancerad). Public
 * `/analys` is a separate lead magnet (`promptKind: "public"`) and is forced
 * to basic mode with its own scrape depth and full schema so the projection
 * can still read audience fields. Expert is PARK — do not add a third mode.
 */

import {
  AUDIT_AI_SCHEMA,
  AUDIT_AI_SCHEMA_BASIC,
  AUDIT_MODEL_CANDIDATES,
  PUBLIC_AUDIT_MODEL_CANDIDATES,
} from "@/app/api/audit/modules/schema";
import {
  AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
  AUDIT_STRUCTURED_DEFAULT_MODEL,
} from "@/lib/gen/defaults";
import type { AuditMode } from "@/types/audit";

export type AuditPromptKind = "product" | "public";

export const AUDIT_ADVANCED_ONLY_FIELDS = [
  "business_profile",
  "market_context",
  "customer_segments",
  "competitive_landscape",
  "competitor_insights",
] as const;

export type AuditAdvancedOnlyField = (typeof AUDIT_ADVANCED_ONLY_FIELDS)[number];

export type AuditSchemaKind = "core" | "full";

export type ResolvedAuditRun = {
  mode: AuditMode;
  promptKind: AuditPromptKind;
  maxPages: number;
  allowWebSearch: boolean;
  primaryModel: string;
  modelCandidates: readonly string[];
  schema: typeof AUDIT_AI_SCHEMA | typeof AUDIT_AI_SCHEMA_BASIC;
  schemaKind: AuditSchemaKind;
  improvementTarget: { min: number; max?: number };
};

export const AUDIT_TIER_COPY = {
  basic: {
    title: "Vanlig analys",
    summary:
      "Snabb genomgång av de viktigaste delarna av sajten med en prioriterad lista över vad som bör förbättras.",
    facts: [
      "Upp till 2 sidor",
      "6–8 prioriterade förbättringar",
      "Ingen web research",
      "Teknik, SEO, copy, UX och mobil",
    ],
  },
  advanced: {
    title: "Avancerad analys",
    summary:
      "Djupare genomgång av flera sidor, fler förbättringar och bredare bedömning av positionering/innehåll.",
    facts: [
      "Upp till 4 sidor",
      "Minst 12 prioriterade förbättringar",
      "Web research",
      "Positionering, marknad och affärslogik",
    ],
  },
} as const;

export function resolveAuditMode(
  promptKind: AuditPromptKind,
  auditMode: AuditMode | undefined,
): AuditMode {
  if (promptKind === "public") return "basic";
  return auditMode === "advanced" ? "advanced" : "basic";
}

export function resolveAuditRun(input: {
  promptKind: AuditPromptKind;
  auditMode: AuditMode | undefined;
}): ResolvedAuditRun {
  const mode = resolveAuditMode(input.promptKind, input.auditMode);

  if (input.promptKind === "public") {
    return {
      mode: "basic",
      promptKind: "public",
      maxPages: 4,
      allowWebSearch: false,
      primaryModel: AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
      modelCandidates: PUBLIC_AUDIT_MODEL_CANDIDATES,
      schema: AUDIT_AI_SCHEMA,
      schemaKind: "full",
      improvementTarget: { min: 6, max: 8 },
    };
  }

  if (mode === "advanced") {
    return {
      mode: "advanced",
      promptKind: "product",
      maxPages: 4,
      allowWebSearch: true,
      primaryModel: AUDIT_STRUCTURED_DEFAULT_MODEL,
      modelCandidates: AUDIT_MODEL_CANDIDATES,
      schema: AUDIT_AI_SCHEMA,
      schemaKind: "full",
      improvementTarget: { min: 12 },
    };
  }

  return {
    mode: "basic",
    promptKind: "product",
    maxPages: 2,
    allowWebSearch: false,
    primaryModel: AUDIT_PUBLIC_STRUCTURED_DEFAULT_MODEL,
    modelCandidates: PUBLIC_AUDIT_MODEL_CANDIDATES,
    schema: AUDIT_AI_SCHEMA_BASIC,
    schemaKind: "core",
    improvementTarget: { min: 6, max: 8 },
  };
}

export function omitAdvancedOnlyFields<T extends Record<string, unknown>>(result: T): T {
  const next = { ...result };
  for (const key of AUDIT_ADVANCED_ONLY_FIELDS) {
    delete next[key];
  }
  return next;
}

export function hasAdvancedOnlyFields(result: Record<string, unknown>): boolean {
  return AUDIT_ADVANCED_ONLY_FIELDS.some((key) => {
    const value = result[key];
    return value !== undefined && value !== null;
  });
}
