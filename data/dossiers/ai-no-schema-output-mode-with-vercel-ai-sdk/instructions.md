# When to use

Use this dossier when you want an LLM to return a JSON object whose shape is not known ahead of time.

Typical cases:
- extracting ad hoc structured data from long text or web pages
- letting users describe the fields they want in natural language
- prototyping structured outputs before committing to a strict schema

Do **not** use this pattern when the object shape is stable or required for downstream validation. In those cases, prefer `streamObject` with a Zod schema.

# How to integrate

## 1) Install dependencies

```bash
npm install ai @ai-sdk/openai cheerio
```

Set the required environment variable:

```env
OPENAI_API_KEY=sk-...
```

## 2) Add a server route that uses `output: 'no-schema'`

Create an App Router route such as `app/api/chat/route.ts`:

```ts
import { streamObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  const { prompt, source }: { prompt: string; source: string } = await req.json();

  if (!source || !source.startsWith('https://en.wikipedia.org/wiki/')) {
    return new Response('Invalid source URL', { status: 400 });
  }

  const page = await fetch(source, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!page.ok) {
    return new Response('Failed to fetch source content', { status: 502 });
  }

  const html = await page.text();
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const cleanText = $('body').text().replace(/\s+/g, ' ').trim();

  const result = streamObject({
    model: openai('gpt-4-turbo'),
    system: `Generate a JSON object based on the user request. Use camelCase keys.\n\nSource content:\n${cleanText}`,
    prompt,
    output: 'no-schema',
  });

  return result.toTextStreamResponse();
}
```

Notes:
- `output: 'no-schema'` tells the SDK not to validate against a predefined schema.
- `toTextStreamResponse()` is appropriate when your client reads the stream as text.
- Return `400`/`502` responses for invalid input or upstream fetch failures instead of throwing generic errors.

## 3) Call the route from your UI

You can use any client implementation that posts `{ prompt, source }` and renders the streamed text.

Minimal example:

```ts
const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Extract the main facts as a JSON object with summary, timeline, and keyPeople.',
    source: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
  }),
});

if (!res.ok || !res.body) {
  throw new Error('Request failed');
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let text = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  text += decoder.decode(value, { stream: true });
}

// Depending on your UI flow, parse or display the streamed JSON text.
console.log(text);
```

## 4) Parse carefully on the client if needed

Because the shape is unknown, your UI should treat the result as untrusted structured data.

```ts
let parsed: unknown;

try {
  parsed = JSON.parse(text);
} catch {
  throw new Error('Model did not return valid JSON');
}
```

If your app later depends on certain keys, validate them after parsing with your own guards or a schema introduced at that layer.

# UX rules

- Tell users that output structure may vary between prompts.
- Show raw JSON or a generic tree view unless you have post-parse validation.
- If the source document is large, show a loading state and explain that extraction may take time.
- Surface fetch errors separately from model errors.
- If you allow arbitrary URLs, explain privacy implications and what content is sent to the model provider.

# Avoid

- Do not build critical business logic on fields that are not validated.
- Do not assume the model will always return valid JSON just because you requested it.
- Do not pass unrestricted user-provided URLs into server-side fetch without allowlisting, SSRF protections, or both.
- Do not dump full unbounded page content into the prompt for large sites; trim, chunk, or pre-process it.
- Do not use no-schema mode when you already know the expected output shape; use a strict schema instead.

# Verification

1. Set `OPENAI_API_KEY`.
2. Start the app and send a POST request to the route with a valid `prompt` and allowed `source` URL.
3. Confirm the response streams incrementally rather than waiting for a full JSON payload.
4. Confirm the final stream content is parseable JSON for normal prompts.
5. Test failure cases:
   - invalid URL -> `400`
   - fetch failure -> `502`
   - malformed prompt/output -> graceful client error state
6. Verify your UI does not assume fixed keys unless you add a validation layer.
