# README.md

Reason: Setup and architecture context

```text
# @mux/ai + Vercel Workflows Starter

A Next.js starter template demonstrating how to build **durable video AI pipelines** with [`@mux/ai`](https://github.com/muxinc/ai) and the [Vercel Workflow DevKit](https://github.com/vercel/workflow).

## 🚀 Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmuxinc%2Fnextjs-video-ai-workflows&env=MUX_TOKEN_ID,MUX_TOKEN_SECRET,OPENAI_API_KEY,DATABASE_URL,S3_ENDPOINT,S3_REGION,S3_BUCKET,S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY&envDescription=Required%20credentials%20for%20Mux%2C%20AI%20providers%2C%20database%2C%20and%20S3%20storage&envLink=https%3A%2F%2Fgithub.com%2Fmuxinc%2Fnextjs-video-ai-workflows%2Fblob%2Fmain%2F.env.example&project-name=mux-ai-workflows&repository-name=mux-ai-workflows)

## Three Integration Layers

| Layer             | Pattern                          | Example                                                            |
| ----------------- | -------------------------------- | ------------------------------------------------------------------ |
| **1. Primitives** | Call functions directly          | `getSummaryAndTags()` — instant results                            |
| **2. Workflows**  | Run durably via Vercel Workflows | `translateCaptions`, `translateAudio` — retries, progress tracking |
| **3. Connectors** | Compose with external tools      | Clip creation with Remotion — multi-step pipelines                 |

## Resumable workflows (try it)

This project showcases **resumable, durable workflows out of the box**:

- Start a workflow (captions, dubbing, or summary).
- Refresh the page, or navigate away and back.
- You should see the workflow **still running asynchronously**, with status rehydrated from browser `localStorage`.

## Quick Start

```bash
npm install
npm run dev
```

Inspect workflow runs locally:

```bash
npx workflow web
```

## Rate Limiting

This demo includes IP-based rate limiting to protect against excessive API costs. Limits are automatically bypassed in development mode.

| Endpoint             | Limit | Window |
| -------------------- | ----- | ------ |
| `translate-audio`    | 3     | 24h    |
| `translate-captions` | 10    | 24h    |
| `render`             | 6     | 24h    |
| `summary`            | 10    | 24h    |
| `search`

// ... truncated
```
