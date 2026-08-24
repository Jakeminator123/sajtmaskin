import type { GenerationInputPackage } from "@/lib/gen/generation-input-package";

import { hashCanonicalJson } from "./canonical-json";

export const BUILDER_PACKAGE_RECEIPT_SCHEMA_VERSION = 1 as const;

export interface GenerationInputPackageReceipt {
  schemaVersion: typeof BUILDER_PACKAGE_RECEIPT_SCHEMA_VERSION;
  generationInputPackageHash: string;
  lineageHash: string;
  sourceReceiptHash: string;
  buildIntent: string;
  lifecycleStage: string;
  scaffoldId: string | null;
  variantId: string | null;
  sourceCount: number;
  promptChars: number;
}

/**
 * Hashes the already-frozen package without persisting its prompt, files or
 * attachments. Object keys are canonicalized; array order remains meaningful.
 */
export function createGenerationInputPackageReceipt(
  pkg: GenerationInputPackage,
): GenerationInputPackageReceipt {
  // Older eval/route fixtures predate the source receipt fields. Production
  // packages always provide them, but treating an absent fixture list as empty
  // keeps this additive telemetry seam from changing classic execution.
  const sources = Array.isArray(pkg.sources) ? pkg.sources : [];
  return {
    schemaVersion: BUILDER_PACKAGE_RECEIPT_SCHEMA_VERSION,
    generationInputPackageHash: hashCanonicalJson(pkg),
    lineageHash: pkg.lineageHash,
    sourceReceiptHash: hashCanonicalJson(sources),
    buildIntent: pkg.buildSpec.buildIntent,
    lifecycleStage: pkg.buildSpec.previewPolicy === "fidelity3" ? "integrations" : "design",
    scaffoldId: pkg.resolvedScaffold?.id ?? null,
    variantId: typeof pkg.variantId === "string" ? pkg.variantId : null,
    sourceCount: sources.length,
    promptChars: pkg.userPrompt.length,
  };
}
