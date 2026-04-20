const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL;
const MEDUSA_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;

if (!MEDUSA_BACKEND_URL) {
  throw new Error("Missing MEDUSA_BACKEND_URL");
}

if (!MEDUSA_PUBLISHABLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY");
}

type MedusaFetchOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

export async function medusaFetch<T>(path: string, options: MedusaFetchOptions = {}): Promise<T> {
  const url = new URL(path, MEDUSA_BACKEND_URL);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": MEDUSA_PUBLISHABLE_KEY,
      ...(options.headers || {}),
    },
    cache: options.cache ?? "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Medusa request failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}
