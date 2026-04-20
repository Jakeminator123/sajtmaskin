import 'server-only'

import {draftMode} from 'next/headers'
import {sanityClient, previewClient} from './client'

export async function sanityFetch<QueryResponse>({
  query,
  params = {},
  tags = [],
}: {
  query: string
  params?: Record<string, unknown>
  tags?: string[]
}): Promise<QueryResponse> {
  const {isEnabled} = await draftMode()
  const client = isEnabled ? previewClient : sanityClient

  return client.fetch<QueryResponse>(query, params, {
    next: {
      tags,
    },
  })
}
