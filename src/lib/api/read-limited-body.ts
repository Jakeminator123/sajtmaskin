export type LimitedTextBodyResult = { ok: true; text: string } | { ok: false; reason: "too_large" };

type LimitedBytesBodyResult =
  { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; reason: "too_large" };

async function readRequestBytesWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedBytesBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };

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
  return { ok: true, bytes };
}

export async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedTextBodyResult> {
  const body = await readRequestBytesWithLimit(request, maxBytes);
  if (!body.ok) return body;
  return { ok: true, text: new TextDecoder().decode(body.bytes) };
}

export type LimitedFormDataBodyResult =
  { ok: true; formData: FormData } | { ok: false; reason: "too_large" };

/** Bound actual wire bytes before multipart parsing, independently of Content-Length. */
export async function readRequestFormDataWithLimit(
  request: Request,
  maxBytes: number,
): Promise<LimitedFormDataBodyResult> {
  const body = await readRequestBytesWithLimit(request, maxBytes);
  if (!body.ok) return body;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  // Preserve binary file bytes; never decode/re-encode a multipart body as text.
  const formData = await new Response(body.bytes, { headers }).formData();
  return { ok: true, formData };
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
