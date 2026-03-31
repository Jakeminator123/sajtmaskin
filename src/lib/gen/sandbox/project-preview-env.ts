import { createHash } from "node:crypto";

const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function derivePreviewToken(projectId: string, salt: string, len: number): string {
  const h = createHash("sha256").update(salt).update(projectId).digest();
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALNUM[h[i]! % ALNUM.length]!;
  }
  return out;
}

/**
 * Deterministic, non-secret-looking placeholders tied to the Sajtmaskin app project id.
 * Merged into sandbox `.env.local` so generated sites can read stable preview ids/secrets
 * until the user sets real integration keys (user/project env wins on collision).
 */
export function buildProjectPreviewPlaceholderRecord(
  appProjectId: string | null | undefined,
): Record<string, string> {
  const id = typeof appProjectId === "string" ? appProjectId.trim() : "";
  if (!id) return {};

  const secret = derivePreviewToken(id, "sajtmaskin:pv-secret", 16);
  const api = derivePreviewToken(id, "sajtmaskin:pv-api", 12);
  const longTok = derivePreviewToken(id, "sajtmaskin:pv-long", 24);

  return {
    NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID: id,
    SAJTMASKIN_APP_PROJECT_ID: id,
    /** Generic secret-shaped value for preview-only code paths */
    PREVIEW_PROJECT_SECRET: secret,
    /** Public-ish key token (still fake) */
    NEXT_PUBLIC_PREVIEW_KEY: `pub_${api}`,
    PREVIEW_API_KEY: `pk_${api}`,
    /** Long opaque token for integration-shaped env vars (not a real JWT) */
    PREVIEW_INTEGRATION_TOKEN: `preview_${longTok}`,
  };
}
