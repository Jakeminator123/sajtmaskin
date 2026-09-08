import { getAppBaseUrl } from "@/lib/app-url";
import { generatePassword, generateSlug } from "./index";
import { kostnadsfriVisitPath } from "./analytics-paths";

/**
 * Everything a company needs to enter the kostnadsfri flow: the slug, the
 * password and the full link. Shared by the API-key route (`POST /api/kostnadsfri`)
 * and the admin generator so the two can never disagree about slug or password.
 *
 * Server-only: `generatePassword` needs the HMAC seed from the environment.
 */
export interface KostnadsfriInvite {
  slug: string;
  companyName: string;
  password: string;
  url: string;
}

export class KostnadsfriInviteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503,
  ) {
    super(message);
    this.name = "KostnadsfriInviteError";
  }
}

export function buildKostnadsfriInvite(
  companyName: string,
  options: { password?: string; baseUrl?: string } = {},
): KostnadsfriInvite {
  const trimmedName = companyName.trim();
  const slug = generateSlug(trimmedName);
  if (!slug) {
    throw new KostnadsfriInviteError(
      "Kunde inte skapa en giltig länk av företagsnamnet.",
      400,
    );
  }

  let password: string;
  try {
    password = options.password || generatePassword(slug);
  } catch {
    throw new KostnadsfriInviteError(
      "KOSTNADSFRI_PASSWORD_SEED saknas — lösenord kan inte genereras.",
      503,
    );
  }

  const baseUrl = options.baseUrl ?? getAppBaseUrl();
  return {
    slug,
    companyName: trimmedName,
    password,
    url: `${baseUrl}${kostnadsfriVisitPath(slug)}`,
  };
}
