# When to use

Use this dossier when you need **semantic search, related-content lookup, or recommendations** from a Weaviate collection in a Next.js app.

Typical fits:
- recommend books, products, articles, jobs, or tools from free-text interests
- search content by meaning instead of exact keywords
- enrich results with generated explanations when Cohere-backed generation is enabled in Weaviate

Do **not** use this dossier if you only need plain keyword search against SQL or static JSON.

# How to integrate

## 1) Set environment variables

Required baseline:

```bash
WEAVIATE_CLUSTER_URL=your-cluster.region.provider.weaviate.cloud
WEAVIATE_API_KEY=your-weaviate-api-key
```

Optional provider headers for vectorization / generation configured in Weaviate:

```bash
OPENAI_API_KEY=your-openai-api-key
COHERE_API_KEY=your-cohere-api-key
```

Notes:
- `WEAVIATE_CLUSTER_URL` should be the host; the helper strips `https://` if present.
- Only expose these on the server. Do not use `NEXT_PUBLIC_*` for secrets.
- `NEXT_PUBLIC_COHERE_CONFIGURED` is template-specific and usually unnecessary for the integration itself.

## 2) Create a shared server client

Use a server-only helper so all routes/actions initialize Weaviate consistently.

```ts
import weaviate, { ApiKey, type WeaviateClient } from 'weaviate-ts-client'

let cachedClient: WeaviateClient | null = null

export function getWeaviateClient(): WeaviateClient {
  if (cachedClient) return cachedClient

  const host = process.env.WEAVIATE_CLUSTER_URL?.replace(/^https?:\/\//, '')
  if (!host) throw new Error('Missing WEAVIATE_CLUSTER_URL')

  const headers: Record<string, string> = {}
  if (process.env.OPENAI_API_KEY) headers['X-OpenAI-Api-Key'] = process.env.OPENAI_API_KEY
  if (process.env.COHERE_API_KEY) headers['X-Cohere-Api-Key'] = process.env.COHERE_API_KEY

  cachedClient = weaviate.client({
    scheme: 'https',
    host,
    apiKey: process.env.WEAVIATE_API_KEY ? new ApiKey(process.env.WEAVIATE_API_KEY) : undefined,
    headers,
  })

  return cachedClient
}
```

## 3) Add a semantic recommendations API route

This route accepts a list of concepts and queries a Weaviate class.

```ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { getWeaviateClient } from '../../lib/weaviate'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { concepts, className = 'Book', fields = ['title', 'description'], limit = 10 } = req.body

  if (!Array.isArray(concepts) || concepts.length === 0) {
    return res.status(400).json({ error: 'concepts must be a non-empty string array' })
  }

  const client = getWeaviateClient()

  const result = await client.graphql
    .get()
    .withClassName(className)
    .withFields(fields.join(' '))
    .withNearText({ concepts, certainty: 0.6 })
    .withLimit(Math.min(limit, 20))
    .do()

  return res.status(200).json(result)
}
```

## 4) Call it from the UI

Use plain fetch from a client component or server action.

```ts
const response = await fetch('/api/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    className: 'Book',
    concepts: ['historical fiction', 'politics', 'long-form nonfiction'],
    fields: ['title', 'description', 'authors', 'categories'],
    limit: 8,
  }),
})

const data = await response.json()
```

## 5) Optional: generated explanation per result

If your Weaviate setup supports generation and `COHERE_API_KEY` is configured, add a prompt:

```ts
const result = await client.graphql
  .get()
  .withClassName('Book')
  .withFields('title description authors _additional { generate { singleResult } }')
  .withNearText({ concepts: ['machine learning', 'startups'], certainty: 0.6 })
  .withGenerate({
    singlePrompt:
      'Explain in 1-2 sentences why this item matches these interests: startups, machine learning. Use only the provided fields.',
  })
  .withLimit(5)
  .do()
```

Only request generated output when the UI actually shows it, because it adds cost and latency.

## 6) Adapt the class and fields to your schema

The source template assumes a `Book` class. In a production site, replace that with your own collection/class and field list.

Examples:
- ecommerce: `Product` with `name description category price imageUrl`
- blog/content: `Article` with `title excerpt tags slug coverImage`
- directory: `Tool` with `name summary features pricing website`

# UX rules

- Label results as **semantic matches** or **recommended for your interests**; do not imply exact factual matching.
- Show loading and empty states.
- Let users refine the prompt or interests instead of silently returning poor matches.
- Cap result counts to a small number first, usually `5-10`.
- If using generated explanations, render them as supportive copy, not ground truth.
- Prefer structured chips/tags for interests so the request sends a clear `string[]` of concepts.

# Avoid

- Do not ship hardcoded fallback cluster URLs or API keys.
- Do not call Weaviate directly from the browser with secret keys.
- Do not assume the dataset always uses the `Book` class.
- Do not send unbounded `limit` values.
- Do not require both OpenAI and Cohere unless your Weaviate configuration actually needs them.
- Do not keep template-only env flags like `NEXT_PUBLIC_COHERE_CONFIGURED` unless the UI explicitly depends on them.

# Verification

## Environment

Confirm the server sees the required env vars:

```bash
printenv WEAVIATE_CLUSTER_URL
printenv WEAVIATE_API_KEY
```

## API route

Smoke test the route locally:

```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H 'Content-Type: application/json' \
  -d '{
    "className": "Book",
    "concepts": ["science fiction", "space exploration"],
    "fields": ["title", "description"],
    "limit": 3
  }'
```

Expected outcome:
- `200` response
- GraphQL result payload with matches under the requested class

## Failure cases

Verify these return the right errors:
- GET `/api/recommendations` -> `405`
- POST with empty `concepts` -> `400`
- missing `WEAVIATE_CLUSTER_URL` -> server error during query setup

## Relevance check

Run 3-5 representative searches from your domain and confirm:
- top results are semantically related, not only keyword-overlapping
- generated explanations do not invent unsupported details
- schema fields requested by the route actually exist in Weaviate
