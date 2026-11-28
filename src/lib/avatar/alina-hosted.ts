import { getServerEnv } from "@/lib/env";

export function hostedAlina() {
  const { ALINA_STUDIO_URL: url, ALINA_BRIDGE_TOKEN: token } = getServerEnv();
  if (!url || !token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  try {
    const upstream = new URL(url);
    if (upstream.protocol === "https:" && !upstream.username && !upstream.password &&
      upstream.href === upstream.origin + "/") return { origin: upstream.origin, token };
  } catch {
    // Incomplete runtime configuration keeps the hosted lab closed.
  }
  return null;
}
