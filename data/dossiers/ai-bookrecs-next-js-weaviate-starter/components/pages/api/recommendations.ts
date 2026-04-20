import type { NextApiRequest, NextApiResponse } from 'next'
import { getWeaviateClient } from '../../lib/weaviate'

type RecommendationsRequest = {
  concepts: string[]
  className?: string
  fields?: string[]
  limit?: number
  certainty?: number
  generatePrompt?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      concepts,
      className = 'Book',
      fields = ['title', 'description'],
      limit = 10,
      certainty = 0.6,
      generatePrompt,
    } = req.body as RecommendationsRequest

    if (!Array.isArray(concepts) || concepts.length === 0) {
      return res.status(400).json({ error: 'concepts must be a non-empty string array' })
    }

    const client = getWeaviateClient()

    let query = client.graphql
      .get()
      .withClassName(className)
      .withFields(fields.join(' '))
      .withNearText({ concepts, certainty })
      .withLimit(Math.min(limit, 20))

    if (generatePrompt && process.env.COHERE_API_KEY) {
      query = query.withGenerate({ singlePrompt: generatePrompt })
    }

    const result = await query.do()
    return res.status(200).json(result)
  } catch (error) {
    console.error('Weaviate recommendations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
