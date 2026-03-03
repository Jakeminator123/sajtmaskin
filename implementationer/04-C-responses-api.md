# 04-C: OpenAI Responses API Migration

**Implementation plan for migrating AI routes from Chat Completions to OpenAI's Responses API.**

**Reference:** [LLM/ROADMAP-next.txt](../LLM/ROADMAP-next.txt) — Section C  
**Roadmap:** `implementationer/README.md` — Steg 4 av 6  
**Status:** [ ] Ej påbörjad  
**Priority:** MEDIUM  
**Effort:** MEDIUM–HIGH  
**Beroenden:** Bör köras EFTER 02-B (Brave kan ersätta web_search i company-lookup)

---

## 1. Overview

OpenAI's Responses API (March 2025+) replaces Chat Completions as the standard interface. It offers:

- **Structured outputs** — guaranteed JSON matching a schema (no parse errors)
- **Built-in tools** — `web_search`, `file_search`, `code_interpreter`
- **Cost savings** — 40–80% cheaper via prompt caching
- **Three web search modes** — deep research, agentic search, non-reasoning

Today, most sajtmaskin AI routes use Chat Completions via the AI SDK (`generateText`, `streamText`) and manually parse JSON from response text. Migrating structured-output routes to the Responses API eliminates parsing brittleness and enables web search where beneficial.

---

## 2. Responses API vs Chat Completions (Developer Context)

| Aspect | Chat Completions (current) | Responses API |
|--------|---------------------------|---------------|
| **API** | `POST /v1/chat/completions` | `POST /v1/responses` |
| **SDK** | AI SDK (`generateText`, `streamText`) or `openai.chat.completions.create` | `openai.responses.create` |
| **Auth** | Often via AI Gateway (`AI_GATEWAY_API_KEY`) | Usually direct OpenAI (`OPENAI_API_KEY`) |
| **Structured output** | Instruct model to return JSON, then parse manually | `text: { format: { type: "json_schema", schema } }` — guaranteed shape |
| **Web search** | Not built-in; must orchestrate externally (e.g. Brave) | Built-in `tools: [{ type: "web_search" }]` (costs per search) |
| **Streaming** | Native via AI SDK | Supported; different consumption pattern |

**Key distinction:** Routes using `gateway()` (AI SDK) for streaming (e.g. `ai/chat`) work well as-is. Routes that need structured output or web search benefit most from migration. The project uses both `AI_GATEWAY_API_KEY` (Vercel AI Gateway) and `OPENAI_API_KEY` (direct OpenAI).

---

## 3. Migration Priority by Route

| Priority | Route | Reason |
|----------|-------|--------|
| **HIGH** | `api/audit` | Structured output + optional `web_search` for SEO/competitor context; large schema, frequent parse failures |
| **HIGH** | `api/text/analyze` | Already uses `responses.create`; add structured output schema, remove manual JSON parse |
| **MEDIUM** | `api/wizard/enrich` | Structured output for consistent `questions` / `suggestions` format |
| **MEDIUM** | `api/wizard/competitors` | Structured output for `competitors` + `marketInsight` |
| **LOW** | `api/wizard/company-lookup` | Use Brave for search (cheaper); Responses API optional |
| **DO NOT MIGRATE** | `api/ai/chat` | Streaming via AI SDK + gateway is the right pattern; no structured output needed |

---

## 4. Step-by-Step Plan

- [ ] **C1.** Complete text/analyze migration — add structured output schema, remove manual JSON parse
- [ ] **C2.** Migrate audit route — `responses.create` + structured output; optional `web_search` tool
- [ ] **C3.** Migrate wizard/enrich — structured output for questions, suggestions, insightSummary
- [ ] **C4.** Migrate wizard/competitors — structured output for competitors array
- [ ] **C5.** Cost evaluation — compare gateway costs vs direct OpenAI Responses API

---

## 5. Route Migrations in Detail

### 5.1. C1 — Text Analyze (`/api/text/analyze`)

**Current pattern (before):**
```typescript
// Uses responses.create already but:
// - No text.format schema
// - Manual JSON parse with try/catch + markdown-strip + fallback to defaults
const response = await openai.responses.create({
  model: toGatewayModelId(ANALYSIS_MODEL),
  instructions: "...",
  input: "...",
  store: false,
});
let responseText = response.output_text || "";
// Extract from ```json blocks, parse, validate structure, fallback on error
```

**Target pattern (after):**
```typescript
const response = await openai.responses.create({
  model: ANALYSIS_MODEL,
  instructions: "...",
  input: `...`,
  text: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                description: { type: "string" },
                prompt: { type: "string" },
              },
              required: ["id", "label", "description", "prompt"],
            },
          },
        },
        required: ["summary", "suggestions"],
      },
    },
  },
  store: false,
});
// response.output_text is guaranteed valid JSON — no parse, no fallback
```

**Schema definition needed:** `{ summary, suggestions: [{ id, label, description, prompt }] }`

**Auth note:** Route currently uses gateway (`AI_GATEWAY_API_KEY`). For Responses API with `text.format`, use direct OpenAI SDK with `OPENAI_API_KEY` (or verify gateway supports Responses API + structured output).

---

### 5.2. C2 — Audit (`/api/audit`)

**Current pattern (before):**
```typescript
// AI SDK generateText via gateway
const aiResult = await generateText({
  model: gateway(usedModel),
  messages: promptMessages,
  maxOutputTokens: 16000,
});
const outputText = aiResult.text || "";
// webSearchCallCount hardcoded to 0 — web search NOT used
// Manual: extract JSON from markdown, parseJsonWithRepair, extractFirstJsonObject, fallback
```

**Target pattern (after):**
```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await openai.responses.create({
  model: "gpt-4o",
  input: [{ role: "user", content: promptContent }],
  tools: enableWebSearch ? [{ type: "web_search", search_context_size: "low" }] : [],
  text: {
    format: {
      type: "json_schema",
      schema: AUDIT_AI_SCHEMA,  // existing schema in route.ts
    },
  },
  store: false,
});

// Guaranteed valid JSON — no parse, no fallback
const auditResult = JSON.parse(response.output_text);
```

**Schema:** Existing `AUDIT_AI_SCHEMA` in `route.ts` — already defined; map to Responses API JSON Schema format.

**Web search:** Use sparingly. Enable only for advanced audits when SEO/competitor context adds value. `web_search` costs per search.

---

### 5.3. C3 — Wizard Enrich (`/api/wizard/enrich`)

**Current pattern (before):**
```typescript
const result = await generateText({
  model: gateway(ENRICH_MODEL),
  messages: [...],
  maxOutputTokens: 4096,
});
// Parse JSON from result.text — comment says "generateObject adds ~10s overhead"
```

**Target pattern (after):**
```typescript
const response = await openai.responses.create({
  model: ENRICH_MODEL,
  input: [...],
  text: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          questions: { type: "array", items: { ... } },
          suggestions: { type: "array", items: { ... } },
          insightSummary: { type: "string" },
          meta: { ... },
        },
        required: ["questions", "suggestions"],
      },
    },
  },
  store: false,
});
```

**Schema:** Map existing `enrichResponseSchema` (Zod) to JSON Schema: `questions`, `suggestions`, `insightSummary`, `meta`.

---

### 5.4. C4 — Wizard Competitors (`/api/wizard/competitors`)

**Current pattern (before):**
```typescript
const result = await generateText({
  model: gateway(...),
  messages: [...],
});
// normalizeResponse(raw) — manual parse + Zod safeParse + fallback to EMPTY
```

**Target pattern (after):**
```typescript
const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: [...],
  text: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          competitors: { type: "array", items: { ... } },
          marketInsight: { type: "string" },
        },
        required: ["competitors"],
      },
    },
  },
  store: false,
});
```

**Schema:** `{ competitors: [{ name, description, website?, lat?, lng?, isInspiration? }], marketInsight? }`

---

## 6. Important Notes

1. **ai/chat route — do NOT migrate.** Streaming via AI SDK + gateway is the right pattern for prompt assist. No structured output needed; migration would add complexity without benefit.

2. **Auth difference.** Responses API uses direct OpenAI SDK (`OPENAI_API_KEY`); gateway routes use `AI_GATEWAY_API_KEY`. Ensure `OPENAI_API_KEY` is set in env for migrated routes.

3. **web_search costs per search.** Use sparingly. Audit: yes (when beneficial). Company-lookup: use Brave instead (see ROADMAP B).

4. **Gateway vs direct.** Some routes may need to stay on gateway for provider flexibility (e.g. Claude fallback). Audit currently uses fallback chain; Responses API migration may require re-evaluating model strategy.

---

## 7. Files to Modify

| Action | Path |
|--------|------|
| Modify | `src/app/api/text/analyze/route.ts` — add `text.format` schema, remove manual parse |
| Modify | `src/app/api/audit/route.ts` — replace `generateText` with `openai.responses.create`, add schema |
| Modify | `src/app/api/wizard/enrich/route.ts` — replace `generateText` with `openai.responses.create`, add schema |
| Modify | `src/app/api/wizard/competitors/route.ts` — replace `generateText` with `openai.responses.create`, add schema |
| Create/modify | `src/lib/openai-responses.ts` — shared Responses API client + schema helpers (optional) |

---

## 8. Testing Plan

### Manual
1. **Text analyze:** Upload text file → verify suggestions array is valid, no fallback to defaults.
2. **Audit:** Run basic + advanced audit → verify full schema populated, no `X-Audit-Fallback`.
3. **Wizard enrich:** Complete wizard step → verify questions/suggestions shape.
4. **Competitors:** Submit industry + location → verify competitors array + marketInsight.

### Automated (optional)
- Unit tests for schema validation (Zod/JSON Schema round-trip).
- Integration test: mock OpenAI Responses API response, assert no parse errors.

---

## 9. Rollback Strategy

Keep old implementation behind a feature flag:

```typescript
const USE_RESPONSES_API = process.env.USE_RESPONSES_API === "true";

if (USE_RESPONSES_API) {
  // New: openai.responses.create with structured output
} else {
  // Old: generateText + manual parse
}
```

- Default: `USE_RESPONSES_API=false` (or unset) until migration is validated.
- After validation: flip to `true`, remove old path, delete flag.

---

## 10. Cost Evaluation (C5)

After migrations:

1. **Compare per-request cost:** Gateway (Chat Completions) vs direct OpenAI (Responses API).
2. **Factor in:** Prompt caching savings (40–80% on repeated prompts), web_search cost (per search).
3. **Recommendation:** Document cost delta in `LLM/ROADMAP-next.txt` or internal docs. Prefer Responses API for routes with high token volume + repeated system prompts (audit, enrich).
