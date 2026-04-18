# When to use

Use this dossier when the app needs to:

- transcribe live speech in the browser with Deepgram
- break transcript text into candidate statements
- classify whether a statement is checkable
- validate claims server-side with LLMs
- return a compact verdict such as `true`, `dubious`, or `obviously-fake`

This is a good fit for meeting assistants, classroom tools, moderation helpers, debate/fact-checking UIs, and voice-driven app shells.

# How to integrate

## 1) Add required environment variables

```env
DEEPGRAM_API_KEY=
OPENAI_API_KEY=
PERPLEXITY_API_KEY=
```

Notes:

- `DEEPGRAM_API_KEY` is used by the auth route to create a short-lived browser key.
- `OPENAI_API_KEY` is used for structured classification and final validation.
- `PERPLEXITY_API_KEY` is used only when a claim needs current/contextual lookup.

## 2) Keep the server routes

### Deepgram temporary key route

Use `app/api/authenticate/route.ts` to avoid exposing your long-lived Deepgram key to the browser.

```ts
import { DeepgramError, createClient } from "@deepgram/sdk";
import { NextResponse, type NextRequest } from "next/server";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (process.env.DEEPGRAM_ENV === "development") {
    return NextResponse.json({ key: process.env.DEEPGRAM_API_KEY ?? "" });
  }

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY ?? "");
  const { result: projectsResult, error: projectsError } =
    await deepgram.manage.getProjects();

  if (projectsError) return NextResponse.json(projectsError, { status: 500 });

  const project = projectsResult?.projects[0];
  if (!project) {
    return NextResponse.json(
      new DeepgramError("Cannot find a Deepgram project. Please create a project first."),
      { status: 500 },
    );
  }

  const { result: newKeyResult, error: newKeyError } =
    await deepgram.manage.createProjectKey(project.project_id, {
      comment: "Temporary API key",
      scopes: ["usage:write"],
      tags: ["nextjs"],
      time_to_live_in_seconds: 60,
    });

  if (newKeyError) return NextResponse.json(newKeyError, { status: 500 });

  const response = NextResponse.json(newKeyResult);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
```

### Statement validation route

Use `app/api/validate-statement/route.ts` for all claim checking. Keep the model calls on the server.

Expected request body:

```json
{
  "statement": "The moon is made of cheese.",
  "transcript": "We were talking about the moon landing and then someone said..."
}
```

Expected response shapes:

For non-checkable input:

```json
{
  "statement": "hello there",
  "type": "not-checkable",
  "reasoning": "This statement is not a checkable claim"
}
```

For checkable input:

```json
{
  "statement": "The moon is made of cheese.",
  "type": "checkable",
  "classification": "obviously-fake",
  "reasoning": "The Moon is a rocky natural satellite, not a cheese-based object."
}
```

## 3) Add the missing schema file

Create `lib/schemas.ts`:

```ts
import { z } from "zod";

export const validatedStatementSchema = z.object({
  classification: z.enum(["true", "dubious", "obviously-fake"]),
  reasoning: z.string().min(1),
});
```

This schema is required by `generateObject(...)` in the validation route.

## 4) Use the transcript helper when processing continuous speech

The shared utility includes a useful helper:

```ts
export const splitIntoStatements = (text: string): string[] => {
  return text.match(/[^.!?]+[.!?]+/g) || [];
};
```

Typical usage:

```ts
import { splitIntoStatements } from "@/lib/utils";

const statements = splitIntoStatements(transcriptText);
for (const statement of statements) {
  await fetch("/api/validate-statement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement, transcript: transcriptText }),
  });
}
```

## 5) Recommended client flow

1. Browser requests `/api/authenticate`
2. Browser connects to Deepgram realtime transcription using the temporary key
3. Client accumulates transcript text
4. Client splits transcript into completed statements
5. Client POSTs each statement to `/api/validate-statement`
6. UI renders classification and short reasoning

## 6) Recommended hardening changes

The source route is usable, but for production you should add:

- request body validation with `zod`
- rate limiting on `/api/validate-statement`
- auth if the feature is not public
- timeout / retry handling for upstream model calls
- structured error responses for model failures
- debouncing so the same statement is not validated repeatedly

Example request validation:

```ts
import { z } from "zod";

const requestSchema = z.object({
  statement: z.string().min(1).max(500),
  transcript: z.string().max(20000).optional(),
});

const parsed = requestSchema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
```

# UX rules

- Show validation as assistive output, not absolute truth.
- Always display the short reasoning next to the verdict.
- Label uncertain results clearly; `dubious` should not be styled the same as `obviously-fake`.
- Do not block the transcript stream while waiting for validation.
- Validate only completed clauses/sentences, not every partial fragment.
- If transcript context is used, make it clear that verdicts may depend on surrounding conversation.
- Prefer quiet, incremental updates over disruptive alerts for every checked sentence.

# Avoid

- Do not call OpenAI, Perplexity, or Deepgram directly from the browser with long-lived secrets.
- Do not treat greetings, opinions, or casual conversation as factual claims.
- Do not validate every token or interim transcript chunk.
- Do not rely on Perplexity for every statement; only use it when more context/current knowledge is needed.
- Do not present classifications as legally or medically authoritative decisions.
- Do not keep the template's app layout/providers unless the rest of that UI is intentionally adopted.
- Do not keep the included CORS middleware unless you specifically need cross-origin API access.

# Verification

## Minimal API checks

### 1) Deepgram auth route

```bash
curl http://localhost:3000/api/authenticate
```

Expect JSON containing a temporary key in production-style usage, or the configured key in local development mode.

### 2) Validation route with an obviously false claim

```bash
curl -X POST http://localhost:3000/api/validate-statement \
  -H 'Content-Type: application/json' \
  -d '{"statement":"The moon is made of cheese."}'
```

Expect:

- HTTP 200
- `type: "checkable"`
- `classification: "obviously-fake"` or equivalent schema-valid output
- a non-empty `reasoning`

### 3) Validation route with non-checkable text

```bash
curl -X POST http://localhost:3000/api/validate-statement \
  -H 'Content-Type: application/json' \
  -d '{"statement":"Hi, how are you?"}'
```

Expect:

- HTTP 200
- `type: "not-checkable"`

### 4) Transcript-aware ambiguous statement

```bash
curl -X POST http://localhost:3000/api/validate-statement \
  -H 'Content-Type: application/json' \
  -d '{"statement":"He works at Google.","transcript":"We are discussing Sam Altman and recent company roles."}'
```

Expect the route to complete successfully and use transcript context when pronouns make the subject ambiguous.

## Integration checklist

- env vars are present
- `lib/schemas.ts` exists
- server routes compile without unresolved imports
- no provider secrets are exposed in client bundles
- duplicate statement submissions are reduced in the UI
- verdicts render with clear uncertainty states
