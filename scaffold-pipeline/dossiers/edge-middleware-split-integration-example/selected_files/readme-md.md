# README.md

Reason: Setup and architecture context

```text
---
name: Split Integration example
slug: ab-testing-split
description: Learn to use Split, a feature delivery platform that powers feature flag management, software experimentation and continuous delivery.
framework: Next.js
useCase: Edge Middleware
css: Tailwind
deployUrl: https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/edge-middleware/feature-flag-split&env=SPLIT_SDK_CLIENT_API_KEY,EDGE_CONFIG,EDGE_CONFIG_SPLIT_ITEM_KEY&project-name=feature-flag-split&repository-name=feature-flag-split&integration-ids=oac_bic40oWF5k9pDFboJhKYqMd1&edge-config-stores=%7B%22EDGE_CONFIG%22%3A%7B%7D%7D
demoUrl: https://ab-testing-split.vercel.app
relatedTemplates:
  - maintenance-page
  - feature-flag-apple-store
---

# A/B Testing with Split

[Split](https://www.split.io/) is a feature delivery platform that powers feature flag management, software experimentation and continuous delivery.

## Demo

https://ab-testing-split.vercel.app

## How to Use

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/examples/tree/main/edge-middleware/feature-flag-split&env=SPLIT_SDK_CLIENT_API_KEY,EDGE_CONFIG,EDGE_CONFIG_SPLIT_ITEM_KEY&project-name=feature-flag-split&repository-name=feature-flag-split&integration-ids=oac_bic40oWF5k9pDFboJhKYqMd1&edge-config-stores=%7B%22EDGE_CONFIG%22%3A%7B%7D%7D)

### Clone and Deploy

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [pnpm](https://pnpm.io/installation) to bootstrap the example:

```bash
pnpm create next-app --example https://github.com/vercel/examples/tree/main/edge-middleware/feature-flag-split feature-flag-split
```

You'll need to have an account with [Split](https://www.split.io/signup/). Once that's done, copy the `.env.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.example .env.local
```

Then open `.env.local` and set the environment variables to match the ones in your Split dashboard. Your keys should be available under Workspace settings - API Keys, in the admin settings of your organi

// ... truncated
```
