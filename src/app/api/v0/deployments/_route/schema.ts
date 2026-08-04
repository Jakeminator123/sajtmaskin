import { z } from "zod/v4";
import { seoPreferencesSchema } from "@/lib/projects/preferences-schema";

export const createDeploymentSchema = z.object({
  chatId: z.string().min(1, "chatId is required"),
  versionId: z.string().min(1, "versionId is required"),
  projectName: z.string().optional(),
  target: z.enum(["production", "preview"]).optional(),
  imageStrategy: z.enum(["external", "blob"]).optional(),
  projectId: z.string().optional(),
  /** Kör samma preflight som deploy (fixar + env-krav) utan Vercel-anrop, credits eller deployment-rad. */
  precheckOnly: z.boolean().optional(),
  /** Felsökning: hoppa över applyPreDeployFixes; env-krav beräknas på rå snapshot. */
  skipAutoFix: z.boolean().optional(),
  /**
   * SEO opt-in for this deploy (PR-B / "Bygg-dialog → SEO-paket").
   * Body-override wins over `project_data.meta.seo`. Same validation as
   * `PATCH /api/projects/[id]/preferences` (https-URL, locale-format,
   * `optIn=true` requires siteUrl).
   *
   * Omitting `seo` falls back to persisted `meta.seo` from the project.
   * The site URL is resolved from the project's verified custom domain or
   * branded standard domain; no process-global SEO domain is used.
   */
  seo: seoPreferencesSchema.optional(),
});
