import { normalizeDomainHostname } from "@/lib/live-site-url";

export function resolveLegacyProviderUrl(value: string | null | undefined): string | null {
  const host = normalizeDomainHostname(value);
  return host?.endsWith(".vercel.app") ? `https://${host}` : null;
}
