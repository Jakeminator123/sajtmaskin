import { createHash, type Hash } from "node:crypto";

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

function updateFramedText(hash: Hash, value: string): void {
  hash.update(String(Buffer.byteLength(value, "utf8")), "ascii");
  hash.update(":", "ascii");
  hash.update(value, "utf8");
}

function textOr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function hashText(domain: string, value: string): string {
  const hash = createHash("sha256");
  updateFramedText(hash, domain);
  updateFramedText(hash, value);
  return hash.digest("hex");
}

function hashScaffoldFiles(pkg: GenerationInputPackage): string {
  const hash = createHash("sha256");
  updateFramedText(hash, "openclaw-builder:scaffold-files:v1");
  const files = Array.isArray(pkg.resolvedScaffold?.files) ? pkg.resolvedScaffold.files : [];
  for (const file of files) {
    updateFramedText(hash, textOr(file.path));
    updateFramedText(hash, textOr(file.role));
    updateFramedText(hash, textOr(file.serialization));
    updateFramedText(hash, String(file.maxPromptChars ?? ""));
    updateFramedText(hash, textOr(file.content));
  }
  return hash.digest("hex");
}

function hashVariantReferenceAttachments(pkg: GenerationInputPackage): string {
  const hash = createHash("sha256");
  updateFramedText(hash, "openclaw-builder:variant-reference-attachments:v1");
  const attachments = Array.isArray(pkg.variantTemplateReferenceAttachments)
    ? pkg.variantTemplateReferenceAttachments
    : [];
  for (const attachment of attachments) {
    updateFramedText(hash, textOr(attachment.type));
    updateFramedText(hash, textOr(attachment.url));
    updateFramedText(hash, textOr(attachment.filename));
    updateFramedText(hash, textOr(attachment.mimeType));
    updateFramedText(hash, String(attachment.size ?? ""));
    updateFramedText(hash, textOr(attachment.purpose));
  }
  return hash.digest("hex");
}

/**
 * Hashes a bounded projection of the already-frozen package without
 * canonical-JSON materializing the full prompt/file payload. Large strings
 * and scaffold files are fed incrementally into SHA-256; only their digests,
 * existing lineage/source receipts and low-cardinality routing metadata enter
 * the fixed-size canonical projection that backs durable telemetry.
 */
export function createGenerationInputPackageReceipt(
  pkg: GenerationInputPackage,
): GenerationInputPackageReceipt {
  // Older eval/route fixtures predate the source receipt fields. Production
  // packages always provide them, but treating an absent fixture list as empty
  // keeps this additive telemetry seam from changing classic execution.
  const sources = Array.isArray(pkg.sources) ? pkg.sources : [];
  const userPrompt = textOr(pkg.userPrompt);
  const rawPrompt = textOr(pkg.rawPrompt, userPrompt);
  const engineSystemPrompt = textOr(pkg.engineSystemPrompt);
  const dynamicContext = textOr(pkg.dynamicContext);
  const sourceReceiptHash = hashCanonicalJson(
    sources.map((source) => ({
      kind: source.kind,
      id: source.id,
      origin: source.origin,
      reason: source.reason,
      authority: source.authority,
      reachedPrompt: source.reachedPrompt,
    })),
  );
  const buildIntent = pkg.buildSpec.buildIntent;
  const lifecycleStage =
    pkg.buildSpec.previewPolicy === "fidelity3" ? "integrations" : "design";
  const scaffoldId = pkg.resolvedScaffold?.id ?? null;
  const variantId = typeof pkg.variantId === "string" ? pkg.variantId : null;
  const generationInputPackageHash = hashCanonicalJson({
    schemaVersion: BUILDER_PACKAGE_RECEIPT_SCHEMA_VERSION,
    lineageHash: pkg.lineageHash,
    sourceReceiptHash,
    buildIntent,
    lifecycleStage,
    scaffoldId,
    variantId,
    variantTemplateId:
      typeof pkg.variantTemplateId === "string" ? pkg.variantTemplateId : null,
    importedRepoMode: pkg.importedRepoMode === true,
    importedRepoContractHashes: pkg.importedRepoContractHashes
      ? {
          baseline: pkg.importedRepoContractHashes.baseline,
          current: pkg.importedRepoContractHashes.current,
        }
      : null,
    userPromptHash: hashText("openclaw-builder:user-prompt:v1", userPrompt),
    rawPromptHash: hashText("openclaw-builder:raw-prompt:v1", rawPrompt),
    engineSystemPromptHash: hashText(
      "openclaw-builder:engine-system-prompt:v1",
      engineSystemPrompt,
    ),
    dynamicContextHash: hashText(
      "openclaw-builder:dynamic-context:v1",
      dynamicContext,
    ),
    scaffoldFilesHash: hashScaffoldFiles(pkg),
    variantReferenceAttachmentsHash: hashVariantReferenceAttachments(pkg),
  });
  return {
    schemaVersion: BUILDER_PACKAGE_RECEIPT_SCHEMA_VERSION,
    generationInputPackageHash,
    lineageHash: pkg.lineageHash,
    sourceReceiptHash,
    buildIntent,
    lifecycleStage,
    scaffoldId,
    variantId,
    sourceCount: sources.length,
    promptChars: userPrompt.length,
  };
}
