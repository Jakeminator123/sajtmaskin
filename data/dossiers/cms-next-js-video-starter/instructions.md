# When to use

Use this dossier when the site needs first-class video in a Next.js app and should offload upload, encoding, and playback delivery to Mux through `next-video`.

Typical fits:
- blog or content site with embedded videos
- portfolio with case-study or reel playback
- app/dashboard surfaces with uploaded training or product videos
- CMS-backed sites where editors attach videos to entries

Do **not** use this dossier if the site only embeds YouTube/Vimeo iframes and does not need managed uploads or Mux-hosted playback.

# How to integrate

## 1) Install and wrap Next.js config

`next-video` must wrap the app's Next.js config.

```ts
// next.config.mjs
import { withNextVideo } from 'next-video/process'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

export default withNextVideo(nextConfig)
```

If the project already wraps config with another plugin, `withNextVideo` should be the innermost wrapper around the base config.

```ts
export default withSentryConfig(withNextVideo(nextConfig))
```

## 2) Add TypeScript support for imported videos

Create `video.d.ts` and ensure `tsconfig.json` includes it.

```ts
/// <reference types="next-video/video-types/global" />

declare module '*.mp4' {
  const value: import('next-video').VideoMetadata
  export default value
}
```

Example `tsconfig.json` update:

```json
{
  "include": ["next-env.d.ts", "video.d.ts", "**/*.ts", "**/*.tsx"]
}
```

If you store generated assets in a dedicated folder, you can also alias it:

```json
{
  "compilerOptions": {
    "paths": {
      "@videos/*": ["./videos/*"]
    }
  }
}
```

## 3) Configure Mux credentials

Add the Mux environment variables required by your upload/provider flow.

```bash
MUX_TOKEN_ID=your_mux_token_id
MUX_TOKEN_SECRET=your_mux_token_secret
```

Runtime LLM should place them in `.env.local` for local development and in deployment environment settings for production.

## 4) Render video with `next-video`

Use the `Video` component for playback.

```tsx
import Video from 'next-video'

export function ArticleVideo({ src, title }: { src: string; title: string }) {
  return (
    <Video
      src={src}
      controls
      playsInline
      aria-label={title}
    />
  )
}
```

For a CMS-driven page, resolve the playback URL or stored metadata on the server and pass it to the component.

```tsx
import Video from 'next-video'

export default async function Page() {
  const video = await getVideoEntry()

  return <Video src={video.src} controls playsInline />
}
```

## 5) Decide how asset keys are generated

This integration includes a provider utility that preserves local folder structure and gives remote URLs a filename-based key by default.

Behavior:
- local files keep their relative path
- remote files default to `videos/<filename>`
- remote URLs with the same filename can collide

If the app imports many remote sources, override asset-key generation so keys are unique per source.

Example pattern:

```ts
function generateAssetKey(filePathOrURL: string, folder: string) {
  if (!filePathOrURL.startsWith('http')) return filePathOrURL

  const url = new URL(filePathOrURL)
  const safeHost = url.hostname.replace(/[^a-z0-9.-]/gi, '-')
  const safePath = url.pathname.replace(/[^a-z0-9./-]/gi, '-')
  return `${folder}/${safeHost}${safePath}`
}
```

## 6) Throttle provider-side requests when batching uploads

Mux/API workflows often involve repeated polling or upload-related requests. Use a small queue/throttle instead of firing many requests at once.

```ts
const queue = new Queue(1000)

await Promise.all(
  items.map((item) =>
    queue.enqueue(() => syncVideoAsset(item))
  )
)
```

This helps avoid bursty provider traffic during ingestion jobs.

# UX rules

- Always show a stable player container with reserved aspect ratio to avoid layout shift.
- Use `controls` unless the user explicitly asked for decorative/autoplay video.
- For autoplay, also set `muted` and `playsInline`.
- Provide text context near the player: title, caption, transcript link, or summary.
- In article or CMS contexts, store video metadata in the content model instead of hardcoding URLs in components.
- Prefer server-side fetching of video records for page rendering.
- If upload/processing state is visible to users, show clear statuses such as `uploading`, `processing`, `ready`, and `failed`.

# Avoid

- Do not keep template/demo landing-page sections just to showcase video.
- Do not hardcode sample playback IDs in production code.
- Do not assume remote URL filenames are unique; collisions are a real risk with the default asset-key strategy.
- Do not trigger large batches of provider requests without throttling.
- Do not store Mux credentials in client components or expose them to the browser.
- Do not use iframe embeds when the requirement is managed uploads and Mux-backed playback via `next-video`.

# Verification

1. Start the app and confirm Next.js builds with `withNextVideo(...)` enabled.
2. Confirm TypeScript recognizes imported video modules and `video.d.ts` is included.
3. Render a page with:

```tsx
import Video from 'next-video'
```

and verify the player loads.
4. Verify Mux credentials are available only on the server.
5. If importing remote videos, confirm generated asset keys are unique enough for the project's content source.
6. If ingesting multiple videos, verify queueing/throttling prevents burst failures.
7. In production, test one full video lifecycle: upload/import -> processing -> playback.
