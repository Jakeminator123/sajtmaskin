# When to use

Use this dossier when the site needs **semantic search or chat Q&A over its own docs/content** using:

- **Supabase Postgres + pgvector** for storage and similarity search
- **OpenAI embeddings** for indexing and retrieval
- **Next.js API routes** for streaming answers

Good fits:

- product docs
- help centers
- internal knowledge bases
- developer portals
- app dashboards with an AI help assistant

Do **not** use this as a general-purpose chatbot with no source corpus. This pattern is retrieval over site-owned content.

# How to integrate

## 1. Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_KEY=...
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` must stay server-only.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be needed by the app generally, but the search/indexing flow here uses the **service role** on the server.
- The source uses `OPENAI_KEY`; keep that exact name unless you update all server code.

## 2. Create the database schema in Supabase

Run the SQL in `components/db/supabase-doc-search.sql`.

This creates:

- `nods_page`
- `nods_page_section`
- `match_page_sections(...)`
- pgvector indexes

The route expects the RPC name to be exactly:

```sql
match_page_sections
```

## 3. Add server-side Supabase access

Use the admin client helper from `components/lib/supabase-admin.ts`:

```ts
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

const supabase = createSupabaseAdminClient()
```

Use this only in:

- indexing scripts
- server routes
- background jobs

Never expose the service role key to client components.

## 4. Index your docs/content into embeddings

The ingestion script in `components/lib/generate-embeddings.ts` is the core indexing pipeline. It:

- walks MD/MDX files
- extracts section chunks by heading
- strips MDX-only nodes
- computes a checksum per page
- generates embeddings with OpenAI
- stores sections in Supabase

Important assumptions in the current script:

- content lives under a `pages` directory
- docs are MDX/Markdown files
- embeddings are stored with dimension `1536`
- the script uses OpenAI model `text-embedding-ada-002`

If you are integrating into a newer app, adapt the source path to wherever docs actually live, for example `content/docs`, `src/content`, or fetched CMS content.

Example server-side indexing pattern:

```ts
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { OpenAI } from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY })
const supabase = createSupabaseAdminClient()

async function indexSection(pageId: number, content: string, heading?: string, slug?: string) {
  const input = content.replace(/\n/g, ' ')

  const embedding = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input,
  })

  await supabase.from('nods_page_section').insert({
    page_id: pageId,
    heading,
    slug,
    content,
    embedding: embedding.data[0].embedding,
    token_count: embedding.usage.total_tokens,
  })
}
```

If you modernize the integration, keep the DB vector dimension aligned with the embedding model you choose.

## 5. Add the search API route

The kept route at `components/pages/api/vector-search.ts` is the retrieval endpoint. It performs:

1. input validation
2. moderation
3. query embedding generation
4. Supabase vector search via RPC
5. prompt assembly from matched sections
6. streaming answer generation

Core retrieval pattern:

```ts
const { data: pageSections, error } = await supabase.rpc('match_page_sections', {
  embedding,
  match_threshold: 0.78,
  match_count: 10,
  min_content_length: 50,
})
```

Core answer-guard pattern:

```ts
import { buildDocSearchPrompt } from '@/lib/search-prompt'

const contextText = pageSections
  .map((section) => section.content.trim())
  .join('\n---\n')

const prompt = buildDocSearchPrompt({
  query: sanitizedQuery,
  contextText,
})
```

The answering model must be instructed to use **only retrieved context** and to explicitly say it does not know when context is insufficient.

## 6. Add a UI that calls the route

Any search box or chat panel can post to the endpoint.

Minimal client example:

```ts
async function askDocs(prompt: string) {
  const res = await fetch('/api/vector-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Request failed')
  }

  return res.body
}
```

For chat UIs:

- show loading state immediately
- stream partial output when supported
- preserve the original user query in the transcript
- display a fallback message when no grounded answer is found

## 7. Keep the route server-only and grounded

Server route requirements:

- use `SUPABASE_SERVICE_ROLE_KEY` only on the server
- never send raw embeddings generation secrets to the client
- keep retrieval and answer generation in one protected server path

If using the App Router instead of Pages Router, move the route logic into:

```ts
app/api/vector-search/route.ts
```

and return a streamed `Response` from the server handler.

# UX rules

- Label the feature as **Ask docs**, **Search docs**, or **AI help** — not as a general assistant unless it truly is one.
- Make the grounding obvious: answers should be framed as based on the documentation.
- Show an empty state that suggests example questions.
- If there are no good matches, say so clearly instead of fabricating an answer.
- Prefer concise answers first; link users to full docs pages when available.
- If moderation flags input, return a neutral validation message.
- If you expose citations, use page path + heading or slug from matched sections.

# Avoid

- Do not keep the template's Supabase-branded assistant persona for unrelated products.
- Do not answer from model prior knowledge when retrieval is weak or empty.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in client code, public env, or browser bundles.
- Do not mismatch embedding dimensions between OpenAI output and the pgvector column.
- Do not index huge whole pages as a single chunk; split by heading/section.
- Do not skip checksum/change detection if indexing runs repeatedly.
- Do not rely on client-side filtering for protected or private docs.

# Verification

## Functional checks

1. Confirm schema exists in Supabase:

```sql
select * from nods_page limit 1;
select * from nods_page_section limit 1;
```

2. Run ingestion and verify rows are created.

3. Confirm embeddings exist:

```sql
select id, heading, length(content) as len
from nods_page_section
order by id desc
limit 10;
```

4. Call the API route:

```bash
curl -X POST http://localhost:3000/api/vector-search \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"How do I configure authentication?"}'
```

5. Verify behavior for:

- valid grounded query
- unknown query with no support in docs
- empty prompt
- moderated/flagged prompt

## Grounding checks

- Ask a question whose answer is definitely present in indexed content: response should be correct.
- Ask a question outside the corpus: response should say it does not know based on docs.
- Temporarily raise `match_threshold` to test no-match behavior.

## Security checks

- Search the codebase for `SUPABASE_SERVICE_ROLE_KEY`; it should appear only in server code.
- Ensure no client component imports server-only indexing helpers.
- Ensure private docs are not indexed into a public search experience unless intended.
