import { z } from "zod";

import { OPENCLAW_BUILDER_LANES } from "./lane-policy";
import { OPENCLAW_BUILDER_BUDGETS } from "./budget-policy";

export const BUILDER_JOB_SCHEMA_VERSION = 1 as const;
export const BUILDER_JOB_TOOL_SCOPES = [
  "job:read",
  "project:read",
  "orchestration:read",
  "preview:read",
  "candidate:write",
  "candidate:check",
  "candidate:submit",
] as const;
export const BUILDER_JOB_ALLOWED_TOOLS = [
  "job.get",
  "job.heartbeat",
  "job.cancel",
  "project.snapshot",
  "project.list_files",
  "project.read_file",
  "project.search",
  "project.diff",
  "orchestration.explain",
  "preview.status",
  "preview.logs",
  "preview.screenshot",
  "candidate.apply_patch",
  "candidate.replace_files",
  "candidate.run_checks",
  "candidate.preview",
  "candidate.evidence",
  "candidate.submit",
] as const;

const BUILDER_LANE_GRANTS = {
  classic: {
    toolScopes: ["job:read"],
    allowedTools: ["job.get"],
  },
  openclaw_shadow: {
    toolScopes: ["job:read", "project:read", "orchestration:read", "preview:read"],
    allowedTools: [
      "job.get",
      "job.heartbeat",
      "job.cancel",
      "project.snapshot",
      "project.list_files",
      "project.read_file",
      "project.search",
      "project.diff",
      "orchestration.explain",
      "preview.status",
      "preview.logs",
      "preview.screenshot",
    ],
  },
  openclaw_candidate: {
    toolScopes: BUILDER_JOB_TOOL_SCOPES,
    allowedTools: BUILDER_JOB_ALLOWED_TOOLS,
  },
} as const;

const BUILDER_TOOL_REQUIRED_SCOPE: Record<
  (typeof BUILDER_JOB_ALLOWED_TOOLS)[number],
  (typeof BUILDER_JOB_TOOL_SCOPES)[number]
> = {
  "job.get": "job:read",
  "job.heartbeat": "job:read",
  "job.cancel": "job:read",
  "project.snapshot": "project:read",
  "project.list_files": "project:read",
  "project.read_file": "project:read",
  "project.search": "project:read",
  "project.diff": "project:read",
  "orchestration.explain": "orchestration:read",
  "preview.status": "preview:read",
  "preview.logs": "preview:read",
  "preview.screenshot": "preview:read",
  "candidate.apply_patch": "candidate:write",
  "candidate.replace_files": "candidate:write",
  "candidate.run_checks": "candidate:check",
  "candidate.preview": "candidate:check",
  "candidate.evidence": "candidate:check",
  "candidate.submit": "candidate:submit",
};

const opaqueId = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{32,64}$/);
const isoInstant = z.string().datetime({ offset: true });

export const builderBudgetSchema = z
  .object({
    maxModelTurns: z.number().int().min(0).max(32),
    maxToolCalls: z.number().int().min(0).max(500),
    maxWallTimeMs: z.number().int().min(0).max(3_600_000),
    maxPreviewLoops: z.number().int().min(0).max(10),
    maxChangedFiles: z.number().int().min(0).max(500),
    maxCandidateBytes: z.number().int().min(0).max(20_000_000),
    maxReadBytes: z.number().int().min(0).max(20_000_000),
  })
  .strict();

export const builderJobSpecSchema = z
  .object({
    schemaVersion: z.literal(BUILDER_JOB_SCHEMA_VERSION),
    jobId: opaqueId,
    lane: z.enum(OPENCLAW_BUILDER_LANES),
    tenantId: opaqueId,
    projectId: opaqueId,
    chatId: opaqueId,
    baseVersionId: opaqueId,
    baseFilesRevision: revision,
    generationInputPackageHash: sha256,
    lineageHash: sha256,
    sourceReceiptHash: sha256,
    toolScopes: z.array(z.enum(BUILDER_JOB_TOOL_SCOPES)).max(16),
    allowedTools: z.array(z.enum(BUILDER_JOB_ALLOWED_TOOLS)).max(32),
    budgets: builderBudgetSchema,
    lease: z
      .object({
        issuedAt: isoInstant,
        expiresAt: isoInstant,
        absoluteExpiresAt: isoInstant,
        heartbeatIntervalMs: z.number().int().positive().max(300_000),
      })
      .strict(),
    idempotencyKey: opaqueId,
    attempt: z.number().int().positive().max(10),
    maxAttempts: z.number().int().positive().max(10),
    createdAt: isoInstant,
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (new Set(spec.toolScopes).size !== spec.toolScopes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["toolScopes"],
        message: "toolScopes must not contain duplicates",
      });
    }
    if (new Set(spec.allowedTools).size !== spec.allowedTools.length) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedTools"],
        message: "allowedTools must not contain duplicates",
      });
    }
    const issued = Date.parse(spec.lease.issuedAt);
    const expires = Date.parse(spec.lease.expiresAt);
    const absolute = Date.parse(spec.lease.absoluteExpiresAt);
    if (!(issued < expires && expires <= absolute)) {
      ctx.addIssue({
        code: "custom",
        path: ["lease"],
        message: "Lease timestamps must satisfy issuedAt < expiresAt <= absoluteExpiresAt",
      });
    }
    if (spec.attempt > spec.maxAttempts) {
      ctx.addIssue({
        code: "custom",
        path: ["attempt"],
        message: "attempt cannot exceed maxAttempts",
      });
    }
    const grants = BUILDER_LANE_GRANTS[spec.lane];
    const permittedScopes = new Set<string>(grants.toolScopes);
    const permittedTools = new Set<string>(grants.allowedTools);
    if (spec.toolScopes.some((scope) => !permittedScopes.has(scope))) {
      ctx.addIssue({
        code: "custom",
        path: ["toolScopes"],
        message: `toolScopes exceed the ${spec.lane} lane policy`,
      });
    }
    if (spec.allowedTools.some((tool) => !permittedTools.has(tool))) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedTools"],
        message: `allowedTools exceed the ${spec.lane} lane policy`,
      });
    }
    const grantedScopes = new Set(spec.toolScopes);
    for (const tool of spec.allowedTools) {
      const requiredScope = BUILDER_TOOL_REQUIRED_SCOPE[tool];
      if (!grantedScopes.has(requiredScope)) {
        ctx.addIssue({
          code: "custom",
          path: ["allowedTools"],
          message: `${tool} requires scope ${requiredScope}`,
        });
      }
    }
    const laneBudgets = OPENCLAW_BUILDER_BUDGETS[spec.lane];
    for (const key of Object.keys(laneBudgets) as Array<keyof typeof laneBudgets>) {
      if (spec.budgets[key] !== laneBudgets[key]) {
        ctx.addIssue({
          code: "custom",
          path: ["budgets", key],
          message: `budget must match the server-owned ${spec.lane} lane policy`,
        });
      }
    }
  });

export type BuilderJobSpec = z.infer<typeof builderJobSpecSchema>;

/** P0 has no public create-job API. An untrusted client may supply no grants. */
const builderJobClientIntentSchema = z.object({}).strict();
export type BuilderJobClientIntent = z.infer<typeof builderJobClientIntentSchema>;

export function parseBuilderJobClientIntent(input: unknown): BuilderJobClientIntent {
  return builderJobClientIntentSchema.parse(input);
}

export function parseBuilderJobSpec(input: unknown): BuilderJobSpec {
  return builderJobSpecSchema.parse(input);
}
