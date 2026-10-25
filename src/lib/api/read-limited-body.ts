export type LimitedTextBodyResult = { ok: true; text: string } | { ok: false; reason: "too_large" };

export async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedTextBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export type LimitedJsonBodyResult<T> =
  { ok: true; value: T } | { ok: false; reason: "too_large" | "invalid_json" };

export async function readRequestJsonWithLimit<T>(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonBodyResult<T>> {
  const body = await readRequestTextWithLimit(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) as T };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
