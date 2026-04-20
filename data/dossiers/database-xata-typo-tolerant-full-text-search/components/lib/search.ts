import 'server-only'
import { z } from 'zod'
import { xata } from './xata'
import { movieList } from './schemas'

const searchResultSchema = z.object({
  records: movieList,
  totalCount: z.number().optional(),
})

type SearchOptions = {
  table: string
  query: string
  columns?: string[]
  limit?: number
}

export async function searchRecords({
  table,
  query,
  columns = ['title', 'name', 'description'],
  limit = 20,
}: SearchOptions) {
  const term = query.trim()

  if (!term) {
    return { records: [], totalCount: 0 }
  }

  const response = await xata.db[table].search(term, {
    fuzziness: 1,
    prefix: 'phrase',
    target: columns,
    page: {
      size: limit,
    },
  })

  return searchResultSchema.parse({
    records: response.records,
    totalCount: response.meta?.page?.estimatedTotal,
  })
}
