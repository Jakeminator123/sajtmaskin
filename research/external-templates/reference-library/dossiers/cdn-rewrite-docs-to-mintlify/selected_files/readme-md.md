# README.md

Reason: Setup and architecture context

```text
---
name: Mintlify docs rewrite (vercel.ts)
slug: mintlify-docs-rewrite
description: Serve Mintlify-hosted docs from your main domain using vercel.ts rewrites. Build a product site with seamlessly integrated documentation.
framework: Next.js
useCase: Rewrites
css: Tailwind
deployUrl: https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/cdn/mintlify-docs-rewrite&project-name=mintlify-docs-rewrite&repository-name=mintlify-docs-rewrite&env=MINTLIFY_DOCS_URL
demoUrl: https://docsrewrite.vercel.app
---

# Mintlify docs rewrite (vercel.ts) example

This template demonstrates how to serve Mintlify-hosted documentation from your main domain using Vercel's `vercel.ts` configuration. Instead of linking to `docs.yourdomain.com` or an external URL, your docs are seamlessly integrated at `/docs` on your product site.

The demo shows a fictional product site ("Flux") with docs hosted on Mintlify but served from the main domain for a unified user experience.

## Demo

https://mintlify-docs-rewrite.vercel.app/

Visit the docs at `/docs` to see the Mintlify-hosted site served through the main domain.

## How to Use

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/cdn/mintlify-docs-rewrite&project-name=mintlify-docs-rewrite&repository-name=mintlify-docs-rewrite&env=MINTLIFY_DOCS_URL)

### Clone and Deploy

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
pnpm create next-app --example https://github.com/vercel/examples/tree/main/cdn/mintlify-docs-rewrite
```

Next, run Next.js in development mode:

```bash
pnpm dev
```

## Environment variables

- `MINTLIFY_DOCS_URL` – Your Mintlify custom domain URL (e.g., `https://your-subdomain.mintlify.dev`)

Set this in your Vercel project settings or in a `.env.local` file.

## How it works

1. You configure a custom domain in Mintlify (e.g., `your-subdomain

// ... truncated
```
