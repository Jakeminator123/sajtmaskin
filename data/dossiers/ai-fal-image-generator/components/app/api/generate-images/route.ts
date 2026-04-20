import { NextRequest, NextResponse } from "next/server";
import { experimental_generateImage as generateImage } from "ai";
import { createFal } from "@ai-sdk/fal";
import type { GenerateImageRequest } from "@/lib/api-types";
import type { ProviderKey } from "@/lib/provider-config";

const TIMEOUT_MILLIS = 55_000;
const DEFAULT_IMAGE_SIZE = "1024x1024";

const fal = createFal({
  apiKey: process.env.FAL_API_KEY,
});

const withTimeout = <T,>(promise: Promise<T>, timeoutMillis: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out")), timeoutMillis);
    }),
  ]);
};

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const { prompt, provider, modelId } = (await req.json()) as GenerateImageRequest;

    if (!prompt || !provider || !modelId) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    if (provider !== ("fal" satisfies ProviderKey)) {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }

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
