# When to use

Use this dossier when the user wants **text-to-image generation inside a Next.js app** and is comfortable calling AI providers from a server route. It is a good fit for:

- app features like “Generate cover image”, “Create marketing visual”, or “Concept art from prompt”
- dashboards or internal tools where users submit prompts and receive generated images
- multi-provider experiments where the app may switch between OpenAI, Replicate, Fireworks, or Vertex AI

Do **not** use this dossier for chat, text completion, image editing, or client-side direct calls to provider APIs.

# How to integrate

## 1) Install required packages

Use the AI SDK plus only the provider packages you actually plan to support.

```bash
npm install ai @ai-sdk/openai @ai-sdk/replicate @ai-sdk/fireworks @ai-sdk/google-vertex
```

## 2) Add environment variables

Only require env vars for the providers you expose.

```env
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
FIREWORKS_API_KEY=
GOOGLE_VERTEX_PROJECT=
GOOGLE_VERTEX_LOCATION=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

Notes:
- `GOOGLE_PRIVATE_KEY` often needs newline preservation when deployed.
- If only one provider is used, remove unused provider packages and env vars.

## 3) Add the shared provider type

Create `lib/provider-config.ts`:

```ts
export const providerKeys = ["openai", "replicate", "fireworks", "vertex"] as const;

export type ProviderKey = (typeof providerKeys)[number];

export function isProviderKey(value: string): value is ProviderKey {
  return providerKeys.includes(value as ProviderKey);
}
```

## 4) Keep request/response types shared

`lib/api-types.ts`:

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

## 5) Add a server route for generation

Use a server route under the App Router, for example `app/api/generate-images/route.ts`.

```ts
import { NextRequest, NextResponse } from "next/server";
import { ImageModel, experimental_generateImage as generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { fireworks } from "@ai-sdk/fireworks";
import { replicate } from "@ai-sdk/replicate";
import { vertex } from "@ai-sdk/google-vertex/edge";
import { ProviderKey } from "@/lib/provider-config";
import { GenerateImageRequest } from "@/lib/api-types";

const TIMEOUT_MILLIS = 55_000;
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_ASPECT_RATIO = "1:1";

interface ProviderConfig {
  createImageModel: (modelId: string) => ImageModel;
  dimensionFormat: "size" | "aspectRatio";
}

const providerConfig: Record<ProviderKey, ProviderConfig> = {
  openai: {
    createImageModel: openai.image,
    dimensionFormat: "size",
  },
  fireworks: {
    createImageModel: fireworks.image,
    dimensionFormat: "aspectRatio",
  },
  replicate: {
    createImageModel: replicate.image,
    dimensionFormat: "size",
  },
  vertex: {
    createImageModel: vertex.image,
    dimensionFormat: "aspectRatio",
  },
};

function withTimeout<T>(promise: Promise<T>, timeoutMillis: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMillis),
    ),
  ]);
}

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2);

  try {
    const { prompt, provider, modelId } = (await req.json()) as GenerateImageRequest;

    if (!prompt || !provider || !modelId || !providerConfig[provider]) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const config = providerConfig[provider];

    const result = await withTimeout(
      generateImage({
        model: config.createImageModel(modelId),
        prompt,
        ...(config.dimensionFormat === "size"
          ? { size: DEFAULT_IMAGE_SIZE }
          : { aspectRatio: DEFAULT_ASPECT_RATIO }),
        ...(provider !== "openai" ? { seed: Math.floor(Math.random() * 1_000_000) } : {}),
        providerOptions: {
          vertex: { addWatermark: false },
        },
      }).then(({ image, warnings }) => {
        if (warnings?.length) {
          console.warn("Image generation warnings", { requestId, provider, modelId, warnings });
        }

        return {
          provider,
          image: image.base64,
        };
      }),
      TIMEOUT_MILLIS,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Image generation failed", { requestId, error });
    return NextResponse.json(
      { error: "Failed to generate image. Please try again later." },
      { status: 500 },
    );
  }
}
```

Integration notes:
- Keep image generation on the server.
- This route returns a **base64 image string** that the client can render as a data URL.
- Provider APIs differ on dimensions: some use `size`, others `aspectRatio`.
- Add stricter validation if users can choose arbitrary models.

## 6) Call the route from a client component

```ts
import type { GenerateImageRequest, GenerateImageResponse } from "@/lib/api-types";

export async function generateImage(input: GenerateImageRequest) {
  const res = await fetch("/api/generate-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await res.json()) as GenerateImageResponse;

  if (!res.ok || !data.image) {
    throw new Error(data.error || "Image generation failed");
  }

  return data.image;
}
```

Example usage in UI:

```tsx
const base64 = await generateImage({
  prompt: "A minimal ceramic vase on a soft beige background, studio lighting",
  provider: "openai",
  modelId: "gpt-image-1",
});

const src = `data:image/png;base64,${base64}`;
```

## 7) Optional client helpers for download/share

`lib/image-helpers.ts` can be kept as-is for converting base64 to a downloadable PNG.

Typical usage:

```ts
import { imageHelpers } from "@/lib/image-helpers";

await imageHelpers.shareOrDownload(base64, "openai");
```

# UX rules

- Always show a loading state while generation is in progress.
- Disable duplicate submits until the current request finishes or is cancelled.
- Show the generated image inline immediately after success.
- Provide a clear error message and allow retry.
- If users can pick providers or models, label them clearly; model IDs are not user-friendly by default.
- Prefer one or two curated models instead of exposing every possible provider model.
- Tell users that generation can take several seconds.
- If the app stores generated images, persist the binary/object URL separately; do not rely on long-lived in-memory base64 strings.

# Avoid

- Do not call provider SDKs directly from the browser.
- Do not expose all env vars or provider details to the client.
- Do not assume every provider accepts the same dimension parameters.
- Do not keep template-specific layout code, fonts, analytics, or branded demo UI.
- Do not trust raw client input for `provider` and `modelId`; constrain them to an allowlist when building a production UI.
- Do not log full prompts or sensitive user data unless the product explicitly requires it.

# Verification

Verify the integration with at least one real provider.

## Manual API test

```bash
curl -X POST http://localhost:3000/api/generate-images \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A watercolor illustration of a small bookstore on a rainy street",
    "provider": "openai",
    "modelId": "gpt-image-1"
  }'
```

Expected result:
- HTTP 200
- JSON response containing `image` as a base64 string

## Browser test

- Submit a prompt from the UI.
- Confirm the image renders using `data:image/png;base64,...`.
- Confirm invalid input returns a friendly error.
- Confirm download/share works if you keep `image-helpers.ts`.

## Production checks

- Verify server runtime/env vars are present for the chosen provider.
- Verify timeouts are handled gracefully.
- Verify only supported providers/models are selectable.
- Verify no client bundle includes secret keys or direct provider calls.
