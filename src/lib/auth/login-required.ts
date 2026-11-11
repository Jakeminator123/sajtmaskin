/**
 * Inloggningskrav för kundsidor (`/projects`, `/buy-credits`, `/konto`).
 *
 * Proxyn skickar en utloggad besökare till startsidan med
 * `?login=required&returnTo=<sökväg>`. Startsidan öppnar inloggningen och
 * skickar tillbaka besökaren efteråt, i stället för att tyst kasta hen till
 * startsidan. Ren modul utan Node-beroenden: proxyn (edge) och klienten
 * använder samma regler.
 */

export const LOGIN_REQUIRED_VALUE = "required";
export const LOGIN_RETURN_TO_PARAM = "returnTo";

const MAX_RETURN_TO_LENGTH = 512;

export function buildLoginRequiredUrl(requestUrl: string | URL, pathWithSearch: string): URL {
  const url = new URL("/", requestUrl);
  url.searchParams.set("login", LOGIN_REQUIRED_VALUE);
  const returnTo = sanitizeLoginReturnTo(pathWithSearch, url.origin);
  if (returnTo) url.searchParams.set(LOGIN_RETURN_TO_PARAM, returnTo);
  return url;
}

/**
 * Släpper bara igenom en egen sökväg (`/x?y`), aldrig `//värd`, `/\värd`,
 * annan origin, hash eller startsidan själv.
 */
export function sanitizeLoginReturnTo(
  raw: string | null | undefined,
  origin: string,
): string | null {
  if (!raw || raw.length > MAX_RETURN_TO_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  let candidate: URL;
  try {
    candidate = new URL(raw, origin);
  } catch {
    return null;
  }
  if (candidate.origin !== origin) return null;
  const path = `${candidate.pathname}${candidate.search}`;
  return path === "/" ? null : path;
}
