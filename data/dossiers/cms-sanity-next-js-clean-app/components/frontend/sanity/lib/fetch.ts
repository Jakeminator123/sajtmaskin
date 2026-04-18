import {client} from '@/sanity/lib/client'

type SanityFetchOptions = {
  query: string
  params?: Record<string, unknown>
  perspective?: 'published' | 'drafts'
  stega?: boolean
}

export async function sanityFetch<T>({
  query,
  params = {},
  perspective = 'published',
  stega = false,
}: SanityFetchOptions): Promise<T> {
  return client.fetch<T>(query, params, {
    perspective,
    stega,
    next: {tags: ['sanity']},
  })
}
