import weaviate, { ApiKey, type WeaviateClient } from 'weaviate-ts-client'

let cachedClient: WeaviateClient | null = null

export function getWeaviateClient(): WeaviateClient {
  if (cachedClient) return cachedClient

  const rawHost = process.env.WEAVIATE_CLUSTER_URL
  if (!rawHost) {
    throw new Error('Missing WEAVIATE_CLUSTER_URL')
  }

  const host = rawHost.replace(/^https?:\/\//, '')

  const headers: Record<string, string> = {}
  if (process.env.OPENAI_API_KEY) {
    headers['X-OpenAI-Api-Key'] = process.env.OPENAI_API_KEY
  }
  if (process.env.COHERE_API_KEY) {
    headers['X-Cohere-Api-Key'] = process.env.COHERE_API_KEY
  }

  cachedClient = weaviate.client({
    scheme: 'https',
    host,
    ...(process.env.WEAVIATE_API_KEY
      ? { apiKey: new ApiKey(process.env.WEAVIATE_API_KEY) }
      : {}),
    headers,
  })

  return cachedClient
}
