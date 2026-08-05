import { deflateSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "ai";
import { createFal } from "@ai-sdk/fal";
import type { GenerateImageRequest } from "@/lib/api-types";
import type { ProviderKey } from "@/lib/provider-config";

const TIMEOUT_MILLIS = 55_000;
const DEFAULT_IMAGE_SIZE = "1024x1024";

const withTimeout = <T,>(promise: Promise<T>, timeoutMillis: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), timeoutMillis);
    }),
  ]);
};

/**
 * Demo/mock detection (mock: canned). No real key → missing OR a preview stub
 * (`placeholder` / `not_real` / `dummy`). Mirrors the stub vocabulary so a
 * seeded preview value is treated as "not configured", never a real key.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

// Minimal, dependency-free PNG encoder for the demo placeholder image, so the
// mock returns a real base64 PNG (the client wraps it in
// `data:image/png;base64,...`) without shipping a large binary blob or pulling
// a native image library onto the preview VM.
const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Deterministic diagonal-gradient placeholder PNG as base64 (truecolor). */
function demoPlaceholderPngBase64(): string {
  const width = 512;
  const height = 288;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 3;
      const tx = x / width;
      const ty = y / height;
      raw[i] = Math.round(99 + tx * 40);
      raw[i + 1] = Math.round(102 + ty * 40);
      raw[i + 2] = Math.round(241 - ty * 30);
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  let prompt: string | undefined;
  let provider: ProviderKey | undefined;
  let modelId: string | undefined;
  try {
    ({ prompt, provider, modelId } = (await req.json()) as GenerateImageRequest);
  } catch {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }

  if (!prompt || !provider || !modelId) {
    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  }
  if (provider !== ("fal" satisfies ProviderKey)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  // Demo/mock mode: no real key → return a deterministic placeholder image +
  // `demo: true` so the gallery renders in an F2/preview without Fal. Real
  // generation runs only once a genuine FAL_API_KEY is configured.
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey || isPlaceholderValue(apiKey)) {
    return NextResponse.json({
      provider,
      image: demoPlaceholderPngBase64(),
      demo: true,
    });
  }

  // Construct the Fal provider INSIDE the handler — a module-level
  // `createFal()` would bake a missing key into the route at import time and
  // surface as an opaque provider exception instead of the calm demo path.
  const fal = createFal({ apiKey });

  try {
    const result = await withTimeout(
      generateImage({
        model: fal.image(modelId),
        prompt,
        size: DEFAULT_IMAGE_SIZE,
      }),
      TIMEOUT_MILLIS,
    );

    if (!result.image?.base64) {
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }

    return NextResponse.json({
      provider,
      image: result.image.base64,
    });
  } catch (error) {
    console.error(`Fal image generation failed [requestId=${requestId}]`, error);

    return NextResponse.json(
      { error: "Failed to generate image. Please try again later." },
      { status: 500 },
    );
  }
}
