import { z } from "zod";

import type { GenerationInputPackageReceipt } from "./package-receipt";

const builderExecutionTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    lane: z.literal("classic"),
    executionEngine: z.literal("own-engine"),
    generationInputPackageHash: z.string().regex(/^[a-f0-9]{64}$/),
    lineageHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceReceiptHash: z.string().regex(/^[a-f0-9]{64}$/),
    checkpoints: z.tuple([
      z.literal("package_frozen"),
      z.literal("classic_codegen"),
      z.literal("finalize"),
    ]),
    qualityGateCorrelation: z
      .object({
        joinKey: z.literal("version_id"),
        verdictOwner: z.literal("engine_version_error_logs"),
        gates: z.tuple([z.literal("designPreview"), z.literal("integrationsBuild")]),
      })
      .strict(),
  })
  .strict();

export type BuilderExecutionTrace = z.infer<typeof builderExecutionTraceSchema>;

export function createClassicBuilderExecutionTrace(
  receipt: GenerationInputPackageReceipt,
): BuilderExecutionTrace {
  return {
    schemaVersion: 1,
    lane: "classic",
    executionEngine: "own-engine",
    generationInputPackageHash: receipt.generationInputPackageHash,
    lineageHash: receipt.lineageHash,
    sourceReceiptHash: receipt.sourceReceiptHash,
    checkpoints: ["package_frozen", "classic_codegen", "finalize"],
    qualityGateCorrelation: {
      joinKey: "version_id",
      verdictOwner: "engine_version_error_logs",
      gates: ["designPreview", "integrationsBuild"],
    },
  };
}

export function parseBuilderExecutionTrace(input: unknown): BuilderExecutionTrace | null {
  const parsed = builderExecutionTraceSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
