/**
 * The two invite-mail sorts. Compare rent vs animated — never template file vs
 * template file. Both plain templates (standardmail, rentmail-v2) are `rent`.
 */
export const KOSTNADSFRI_MAIL_KINDS = ["rent", "animated"] as const;

export type KostnadsfriMailKind = (typeof KOSTNADSFRI_MAIL_KINDS)[number];

export function isKostnadsfriMailKind(value: unknown): value is KostnadsfriMailKind {
  return value === "rent" || value === "animated";
}

export function parseKostnadsfriMailKind(value: unknown): KostnadsfriMailKind | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return isKostnadsfriMailKind(trimmed) ? trimmed : null;
}
