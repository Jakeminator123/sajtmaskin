# When to use

Use this dossier when the site needs **text-to-image generation** in a Next.js App Router app and you want a simple server endpoint backed by **Fal** via the **AI SDK**.

Typical fits:
- prompt-to-image tools
- marketing sites with an image generation demo
- dashboards or internal tools that create visual assets
- MVPs that need one provider (`fal`) without building a multi-provider abstraction first

This dossier is best when you want:
- server-side API key handling
- a single POST route for image generation
- base64 image results that can be previewed, downloaded, or uploaded elsewhere

# How to integrate

## 1) Install required packages

```bash
npm install ai @ai-sdk/fal
```

If the project uses path aliases like `@/lib/...`, keep them consistent with the app's tsconfig.

## 2) Add environment variables

```env
FAL_API_KEY=your_fal_api_key
```

Use `FAL_API_KEY` consistently. Do **not** rename it to `FAL_KEY` in code unless you also change the env contract everywhere.

## 3) Add a minimal provider config

Create `lib/provider-config.ts`:

```ts
export type ProviderKey = "fal";

export const providerConfig = {
  fal: {
    label: "Fal",
  },
} as const;
```

This dossier only needs one provider key. Avoid introducing a larger provider registry unless the app truly supports multiple image backends.

## 4) Add shared request/response types

Create `lib/api-types.ts`:

```ts
import { ProviderKey } from "./provider-config";

export interface GenerateImageRequest {
  prompt: string;
  provider: ProviderKey;
  modelId: string;
}

export interface GenerateImageResponse {
  image?: string;
  error?: string;
}
```

## 5) Add the API route

Create `app/api/generate-images/route.ts`:

```ts
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
```

Notes:
- Keep the API key on the server only.
- Add a timeout so requests fail predictably instead of hanging until platform limits are hit.
- Return a generic error message to the client; log details server-side.

## 6) Call the route from the client

Example client request:

```ts
const res = await fetch("/api/generate-images", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    prompt: "A cinematic product photo of a matte black coffee grinder on stone",
    provider: "fal",
    modelId: "fal-ai/flux/schnell",
  }),
});

const data = await res.json();

if (!res.ok || data.error) {
  throw new Error(data.error ?? "Image generation failed");
}

const imageSrc = `data:image/png;base64,${data.image}`;
```

## 7) Use the helper utilities for download/share

Create `lib/image-helpers.ts`:

```ts
export const imageHelpers = {
  base64ToBlob: (base64Data: string, type = "image/png"): Blob => {
    const byteString = atob(base64Data);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    return new Blob([uint8Array], { type });
  },

  generateImageFileName: (provider: string): string => {
    const uniqueId = Math.random().toString(36).substring(2, 8);
    return `${provider}-${uniqueId}`.replace(/[^a-z0-9-]/gi, "");
  },

  shareOrDownload: async (imageData: string, provider: string): Promise<void> => {
    const fileName = imageHelpers.generateImageFileName(provider);
    const blob = imageHelpers.base64ToBlob(imageData);
    const file = new File([blob], `${fileName}.png`, { type: "image/png" });

    try {
      if (navigator.share) {
        await navigator.share({
          files: [file],
          title: `Image generated by ${provider}`,
        });
      } else {
        throw new Error("Share API not available");
      }
    } catch {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${fileName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }
  },
};
```

Example usage:

```ts
await imageHelpers.shareOrDownload(data.image, "fal");
```

# UX rules

- Always show generation as an explicit pending state; image requests can take several seconds.
- Disable duplicate submits while a request is in flight.
- Let users edit the prompt and retry quickly after errors.
- Render the returned base64 image immediately with a `data:` URL for fastest preview.
- Provide a clear download action after success.
- If the app is consumer-facing, label generated media as AI-generated.
- If model choice is exposed, provide a sensible default instead of forcing users to pick from raw provider IDs.

Recommended preview pattern:

```tsx
{imageBase64 ? (
  <img
    src={`data:image/png;base64,${imageBase64}`}
    alt={prompt || "Generated image"}
    className="h-auto w-full rounded-md"
  />
) : null}
```

# Avoid

- Do not expose `FAL_API_KEY` in client components or browser fetches to Fal directly.
- Do not keep template-specific app layout code, analytics, fonts, or branding as part of the integration dossier.
- Do not reference missing files like `provider-config` without creating them.
- Do not mix env var names (`FAL_KEY` vs `FAL_API_KEY`). Use one contract.
- Do not assume every model returns identical dimensions or formats; if the product allows model switching, keep size handling configurable later.
- Do not return raw provider errors directly to end users.
- Do not build a fake multi-provider abstraction unless the app truly supports more than Fal.

# Verification

## Manual checks

1. Add a valid `FAL_API_KEY`.
2. Start the app.
3. Send a POST request to `/api/generate-images` with a real Fal model ID.
4. Confirm the response includes a base64 `image` string.
5. Confirm invalid payloads return `400`.
6. Confirm server failures return a generic `500` response body with `error`.

## Example curl

```bash
curl -X POST http://localhost:3000/api/generate-images \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "A minimal ceramic vase on a white pedestal, studio lighting",
    "provider": "fal",
    "modelId": "fal-ai/flux/schnell"
  }'
```

Expected shape:

```json
{
  "provider": "fal",
  "image": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

## Failure checks

- Missing `prompt` => `400`
- Unsupported `provider` => `400`
- Missing or invalid API key => `500`
- Long-running request beyond timeout => `500`

If all of the above work, the dossier is integrated correctly.
