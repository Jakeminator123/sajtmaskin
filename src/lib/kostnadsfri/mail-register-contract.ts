import { z } from "zod/v4";

export const KOSTNADSFRI_MAIL_SOURCE_TEXT = "render-mail-flow:text";
export const KOSTNADSFRI_MAIL_SOURCE_ANIMATED = "render-mail-flow:animated";

export type KostnadsfriMailType = "text" | "animated" | "unregistered";
export type KostnadsfriGenerationState =
  | "unknown"
  | "not-started"
  | "in-progress"
  | "succeeded"
  | "failed";

export type KostnadsfriGeneration = {
  state: KostnadsfriGenerationState;
  completedAt: string | null;
  siteId: string | null;
};

export const UNKNOWN_KOSTNADSFRI_GENERATION: KostnadsfriGeneration = {
  state: "unknown",
  completedAt: null,
  siteId: null,
};

export function mailTypeFromSource(source: unknown): KostnadsfriMailType {
  if (source === KOSTNADSFRI_MAIL_SOURCE_TEXT) return "text";
  if (source === KOSTNADSFRI_MAIL_SOURCE_ANIMATED) return "animated";
  return "unregistered";
}
const generationSchema = z
  .object({
    state: z.enum(["unknown", "not-started", "in-progress", "succeeded", "failed"]),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    siteId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/).nullable(),
  })
  .refine(
    (value) =>
      value.state === "succeeded" ? value.completedAt !== null : value.completedAt === null,
    { message: "completedAt is only valid for succeeded generation" },
  );

/**
 * External readers must degrade malformed or legacy generation data to
 * `unknown` without discarding an otherwise valid send-register row.
 */
export function normalizeKostnadsfriGeneration(value: unknown): KostnadsfriGeneration {
  const parsed = generationSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...UNKNOWN_KOSTNADSFRI_GENERATION };
}

export function resolveKostnadsfriGenerationProjection(input: {
  projectId: string;
  initialChatId: string | null;
  initialVersionId: string | null;
  completedAt: Date | string | null;
  latestGenerationSucceeded: boolean | null;
}): KostnadsfriGeneration {
  if (input.initialVersionId) {
    if (!input.completedAt) return { ...UNKNOWN_KOSTNADSFRI_GENERATION };
    const completedAt = new Date(input.completedAt);
    if (Number.isNaN(completedAt.getTime())) return { ...UNKNOWN_KOSTNADSFRI_GENERATION };
    return {
      state: "succeeded",
      completedAt: completedAt.toISOString(),
      siteId: /^[A-Za-z0-9_-]{1,120}$/.test(input.projectId) ? input.projectId : null,
    };
  }
  if (!input.initialChatId) {
    return { state: "not-started", completedAt: null, siteId: null };
  }
  return {
    state: input.latestGenerationSucceeded === false ? "failed" : "in-progress",
    completedAt: null,
    siteId: null,
  };
}

const registerPageSchema = z.object({
  slug: z.string(),
  companyName: z.string(),
  contactEmail: z.string().nullable(),
  contactName: z.string().nullable(),
  status: z.string().nullable(),
  sentAt: z.string().datetime({ offset: true }).nullable(),
  source: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }).nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  unsubscribedAt: z.string().datetime({ offset: true }).nullable(),
  visits: z.number().int().nonnegative().nullable(),
  verified: z.number().int().nonnegative().nullable(),
  started: z.number().int().nonnegative().nullable(),
  generation: z.unknown().optional(),
});

const isoDateTime = z.string().datetime({ offset: true });

/**
 * Pagination envelope. A consumer must be able to tell a capped partial read
 * from a complete export: `complete=false` always carries a `nextCursor`,
 * `complete=true` never does.
 */
const registryEnvelopeSchema = z
  .object({
    checkedAt: isoDateTime,
    returned: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    complete: z.boolean(),
    nextCursor: z.string().regex(/^\d+$/).nullable(),
    paginationMode: z.enum(["legacy-send-order", "complete-id-order"]).optional(),
  })
  .refine((value) => value.complete === (value.nextCursor === null), {
    message: "complete=false requires nextCursor; complete=true forbids it",
  });

/** Analytics availability. Unavailable analytics can never claim completeness. */
const analyticsEnvelopeSchema = z
  .object({
    available: z.boolean(),
    windowDays: z.number().int().positive(),
    checkedAt: isoDateTime,
    complete: z.boolean(),
  })
  .refine((value) => value.available || !value.complete, {
    message: "unavailable analytics cannot be complete",
  });

const generationEnvelopeSchema = z.object({
  available: z.boolean(),
  checkedAt: isoDateTime,
});

const registerResponseSchema = z.object({
  success: z.literal(true),
  pages: z.array(registerPageSchema),
  registry: registryEnvelopeSchema,
  analytics: analyticsEnvelopeSchema,
  generation: generationEnvelopeSchema,
});

export type KostnadsfriRegisterEnvelopes = Pick<
  z.infer<typeof registerResponseSchema>,
  "registry" | "analytics" | "generation"
>;

/** Validates the whole advertised GET contract, including its metadata envelopes. */
export function parseKostnadsfriRegisterEnvelopes(value: unknown): KostnadsfriRegisterEnvelopes {
  const { registry, analytics, generation } = registerResponseSchema.parse(value);
  return { registry, analytics, generation };
}

export type ParsedKostnadsfriRegisterPage = Omit<
  z.infer<typeof registerPageSchema>,
  "generation"
> & {
  generation: KostnadsfriGeneration;
  mailType: KostnadsfriMailType;
};

export function parseKostnadsfriRegisterResponse(value: unknown): ParsedKostnadsfriRegisterPage[] {
  const response = registerResponseSchema.parse(value);
  return response.pages.map((page) => ({
    ...page,
    generation: normalizeKostnadsfriGeneration(page.generation),
    mailType: mailTypeFromSource(page.source),
  }));
}
