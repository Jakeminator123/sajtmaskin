/**
 * Last-resort availability probe over public DNS.
 *
 * NXDOMAIN is a decent hint that a name is unregistered, but it is a hint and
 * nothing more: a registered domain with no A record answers the same way as a
 * free one on some resolvers, and a registry hold looks free here. Good enough
 * to grey out an obviously-taken name in search; never good enough to sell on,
 * which is why the purchase path requires a registrar's answer instead.
 */

const DNS_TIMEOUT_MS = 4000;

export async function checkAvailabilityViaDns(domain: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { signal: AbortSignal.timeout(DNS_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Status?: number; Answer?: unknown[] };
    // 3 = NXDOMAIN, 0 = NOERROR.
    if (data.Status === 3) return true;
    if (data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) return false;
    return null;
  } catch {
    return null;
  }
}
