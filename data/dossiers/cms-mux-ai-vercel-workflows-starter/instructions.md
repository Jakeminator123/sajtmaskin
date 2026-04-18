# When to use

Use this dossier when the site needs **server-side video AI workflows on top of Mux assets** in a Next.js app.

Typical use cases:

- analyze uploaded videos or audio-only assets
- generate captions, metadata, summaries, moderation results, or search indexes
- translate captions or audio into other languages
- build durable background jobs with Vercel Workflows or similar orchestration
- call multiple model providers through `@mux/ai` while keeping Mux credentials server-only

This dossier is **not** a complete CMS or UI kit. It is the backend utility layer for Mux asset access, language normalization, image ingestion, and safe error handling.

# How to integrate

## 1) Install and configure credentials

Required env vars:

```bash
MUX_TOKEN_ID=...
MUX_TOKEN_SECRET=...
```

Optional depending on workflow:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
ELEVENLABS_API_KEY=...
HIVE_API_KEY=...
MUX_SIGNING_KEY=...
MUX_PRIVATE_KEY=...
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
EVALITE_INGEST_SECRET=...
EVALITE_RESULTS_ENDPOINT=...
```

Add a typed env loader and import it from server-only code:

```ts
import { env } from "@/src/lib/env";

void env.MUX_TOKEN_ID;
void env.MUX_TOKEN_SECRET;
```

## 2) Resolve Mux client and provider config in server code

Use `createWorkflowConfig()` when a workflow needs both Mux access and a resolved model/provider.

```ts
import { createWorkflowConfig } from "@/src/lib/client-factory";

export async function getWorkflowContext() {
  const config = await createWorkflowConfig({
    provider: "openai",
    modelId: "gpt-4.1-mini",
  });

  return config;
}
```

If you only need the Mux client:

```ts
import { getMuxClientFromEnv } from "@/src/lib/client-factory";

const muxClient = await getMuxClientFromEnv();
const mux = await muxClient.createClient();
```

## 3) Read Mux asset metadata before running AI steps

Use the asset helpers instead of duplicating Video API calls.

```ts
import {
  getMuxAsset,
  getPlaybackIdForAsset,
  getAssetDurationSecondsFromAsset,
  getVideoTrackMaxFrameRateFromAsset,
  isAudioOnlyAsset,
} from "@/src/lib/mux-assets";

export async function loadAssetContext(assetId: string) {
  const asset = await getMuxAsset(assetId);
  const playback = await getPlaybackIdForAsset(assetId);

  return {
    assetId: asset.id,
    playbackId: playback.playbackId,
    playbackPolicy: playback.policy,
    durationSeconds: getAssetDurationSecondsFromAsset(asset),
    maxFrameRate: getVideoTrackMaxFrameRateFromAsset(asset),
    audioOnly: isAudioOnlyAsset(asset),
  };
}
```

Prefer the `...FromAsset()` helpers when you already fetched the asset, so you do not issue duplicate Mux API requests.

## 4) Normalize language codes for captions and translation

Mux, browser players, and model/tool APIs may expect different language formats.

Use the conversion helpers whenever a workflow accepts a user language choice or reads language metadata from Mux.

```ts
import {
  getLanguageCodePair,
  getLanguageName,
  isUndeterminedLanguageCode,
} from "@/src/lib/language-codes";

export function normalizeTargetLanguage(input: string) {
  if (isUndeterminedLanguageCode(input)) {
    throw new Error("A specific target language is required.");
  }

  const pair = getLanguageCodePair(input);

  return {
    muxTrackLanguage: pair.iso639_1,
    providerLanguageCode: pair.iso639_3,
    languageLabel: getLanguageName(input) ?? input,
  };
}
```

Rules of thumb:

- use ISO 639-1 / BCP-47 style codes for browser-facing playback tracks
- use ISO 639-3 when an AI/provider API expects 3-letter codes
- reject `und`, `mul`, `mis`, and `zxx` as explicit translation targets

## 5) Download remote images for multimodal prompts

Some workflows need to fetch thumbnails, posters, or external image references and pass them to model providers.

```ts
import { downloadImageAsBase64, uploadImageToAnthropicFiles } from "@/src/lib/image-download";
import { getApiKeyFromEnv } from "@/src/lib/client-factory";

export async function prepareImageInputs(imageUrl: string) {
  const image = await downloadImageAsBase64(imageUrl, {
    timeout: 10000,
    retries: 3,
  });

  return {
    inlineDataUrl: image.base64Data,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
  };
}

export async function prepareAnthropicImage(imageUrl: string) {
  const apiKey = await getApiKeyFromEnv("anthropic");
  return uploadImageToAnthropicFiles(imageUrl, apiKey);
}
```

The helper already:

- validates `content-type` is `image/*`
- aborts hung requests
- retries transient failures
- avoids retrying non-rate-limited 4xx responses

## 6) Return safe customer-facing errors from routes or workflows

`MuxAiError` is the public error contract. Use it for validation or expected processing failures that can be shown directly to the user.

```ts
import { MuxAiError, wrapError } from "@/src/lib/mux-ai-error";

export async function runWorkflow(assetId: string) {
  try {
    if (!assetId) {
      throw new MuxAiError("Asset ID is required.", {
        type: "validation_error",
        retryable: false,
      });
    }

    // workflow logic
  } catch (error) {
    wrapError(error, "Failed to run video AI workflow");
  }
}
```

In a route handler:

```ts
import { NextResponse } from "next/server";
import { toPublicErrorResponse } from "@/src/lib/mux-ai-handler";
import { MuxAiError } from "@/src/lib/mux-ai-error";
import { getMuxAsset } from "@/src/lib/mux-assets";

export async function POST(req: Request) {
  try {
    const { assetId } = await req.json();

    if (!assetId) {
      throw new MuxAiError("assetId is required", {
        type: "validation_error",
      });
    }

    const asset = await getMuxAsset(assetId);

    return NextResponse.json({
      assetId: asset.id,
      status: asset.status,
    });
  } catch (error) {
    const { status, body } = toPublicErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
```

## 7) Keep all Mux and AI credentials on the server

Do not expose:

- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- model provider API keys
- signing keys
- storage credentials

These utilities are for server code, route handlers, background jobs, and workflow steps only.

# UX rules

- Treat long-running video AI work as asynchronous. Show job states like `queued`, `processing`, `completed`, and `failed`.
- Surface `MuxAiError.publicMessage` directly to users only for known safe failures.
- For unknown failures, show a generic message like: `We couldn't process this video right now.`
- If a workflow depends on captions/translation, ask for an explicit target language rather than assuming from browser locale.
- If an asset has only signed playback IDs, ensure the rest of the app supports signed playback before presenting previews.
- Distinguish audio-only assets from video assets in the UI; do not promise thumbnails or frame-based analysis for audio-only inputs.
- Show retry actions only when the backend marks an error as retryable.

# Avoid

- Do not call these helpers from client components.
- Do not pass raw credentials through workflow step inputs if `@mux/ai` can resolve them from env or workflow credentials.
- Do not make duplicate `assets.retrieve()` calls when you already have the asset object.
- Do not treat undetermined language codes (`und`, `mul`, `mis`, `zxx`) as valid user-selected target languages.
- Do not expose raw upstream provider errors or stack traces to end users.
- Do not assume public playback IDs always exist; signed-only assets are possible.
- Do not use this dossier as a drop-in frontend video player solution; pair it with your own Mux playback UI if needed.

# Verification

1. Confirm env validation passes at startup with valid `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
2. Fetch a known Mux asset with `getMuxAsset(assetId)` and verify the returned asset matches the dashboard.
3. Run `getPlaybackIdForAsset(assetId)` against:
   - an asset with a public playback ID
   - an asset with only a signed playback ID
4. Test `isAudioOnlyAsset()` with one audio asset and one video asset.
5. Verify language helpers:

```ts
getLanguageCodePair("en") // { iso639_1: "en", iso639_3: "eng" }
getLanguageCodePair("fra") // { iso639_1: "fr", iso639_3: "fra" }
isUndeterminedLanguageCode("und") // true
```

6. Test image downloading with:
   - a valid image URL
   - a non-image URL
   - a dead URL / timeout case
7. Throw a `MuxAiError` from a route and confirm the response contains only the safe public message.
8. Throw an unexpected error and confirm the route returns a generic internal error response instead of leaking provider details.
