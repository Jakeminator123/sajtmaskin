# When to use

Use this dossier when the product needs a natural-language interface over an existing PostgreSQL database, such as:

- internal analytics assistants
- admin/dashboard data exploration
- customer-facing reporting over constrained data
- AI copilots that answer questions with live SQL-backed results

This is best when the app already has a Postgres schema and the goal is to let users ask questions in plain language, inspect the generated SQL, and optionally render charts from the result rows.

# How to integrate

## 1) Required environment variables

Use the provider env already declared in the manifest:

```env
OPENAI_API_KEY=...
POSTGRES_URL=...
```

In many Vercel Postgres projects, additional `POSTGRES_*` variables are injected automatically. For this integration, the critical runtime requirements are:

- `OPENAI_API_KEY`
- a working Postgres connection, typically via `POSTGRES_URL`

## 2) Keep the shared schemas and chart transform utility

Keep these files because they are integration-specific:

- `components/lib/types.ts`
- `components/lib/rechart-format.ts`

`types.ts` gives you Zod validation for structured AI output:

```ts
import { configSchema, explanationsSchema } from "@/components/lib/types";
```

`rechart-format.ts` helps normalize grouped SQL results into chart series:

```ts
import { transformDataForMultiLineChart } from "@/components/lib/rechart-format";
```

## 3) Add a server route that generates read-only SQL

Create a route like `app/api/query/route.ts` and keep the SQL generation/execution server-side.

Core pattern:

```ts
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { sql } from "@vercel/postgres";
import { z } from "zod";

const sqlPlanSchema = z.object({
  sql: z.string(),
  chartable: z.boolean(),
  chartIntent: z.string().nullable(),
});
```

First fetch the live schema from Postgres:

```ts
const schemaResult = await sql`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
`;
```

Then ask the model for a single read-only query using only that schema:

```ts
const { object: plan } = await generateObject({
  model: openai("gpt-4.1"),
  schema: sqlPlanSchema,
  system: [
    "You translate natural language into PostgreSQL.",
    "Return exactly one read-only query.",
    "Use only tables and columns from the provided schema.",
    "Never write DDL or DML.",
    "Prefer explicit column names over SELECT *.",
  ].join(" "),
  prompt: `Database schema:\n${schemaText}\n\nUser question: ${question}`,
});
```

Execute only after validating it is read-only:

```ts
function assertReadOnly(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }

  for (const keyword of ["insert", "update", "delete", "drop", "alter", "create", "truncate"]) {
    if (normalized.includes(keyword)) {
      throw new Error(`Forbidden SQL keyword detected: ${keyword}`);
    }
  }
}
```

Then run:

```ts
assertReadOnly(plan.sql);
const result = await sql.query(plan.sql);
const rows = result.rows;
```

## 4) Generate structured explanations and optional chart config

Use `explanationsSchema` and `configSchema` so the UI gets reliable, typed output.

```ts
import { configSchema, explanationsSchema } from "@/components/lib/types";
import { generateObject, generateText } from "ai";
```

Explanation pattern:

```ts
const explanationResult = await generateObject({
  model: openai("gpt-4.1"),
  schema: explanationsSchema,
  system: "Return short sections explaining the result set.",
  prompt: `Question: ${question}\n\nRows: ${JSON.stringify(rows).slice(0, 12000)}`,
});
```

Chart config pattern:

```ts
const chartResult = await generateObject({
  model: openai("gpt-4.1"),
  schema: configSchema,
  system: [
    "Create chart configs only when the data is suitable for visualization.",
    "Use keys that exist in the SQL result rows.",
    "Prefer bar or line charts for comparisons and trends.",
  ].join(" "),
  prompt: `Question: ${question}\n\nRows: ${JSON.stringify(rows).slice(0, 12000)}`,
});
```

## 5) Add a minimal client page or embed in an existing dashboard

Typical client flow:

```tsx
const res = await fetch("/api/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question }),
});

const data = await res.json();
```

Render at minimum:

- the original question
- generated SQL
- tabular result rows
- a plain-language summary
- optional chart when `chart` is present

## 6) If rendering grouped line charts, normalize the rows first

Use the included utility when the chart config uses `multipleLines` and `lineCategories`.

```ts
import { transformDataForMultiLineChart } from "@/components/lib/rechart-format";

const transformed = transformDataForMultiLineChart(rows, chartConfig);
```

This is useful when SQL returns rows like:

```ts
[
  { year: 2022, segment: "SMB", revenue: 10 },
  { year: 2022, segment: "Enterprise", revenue: 18 },
  { year: 2023, segment: "SMB", revenue: 14 },
]
```

and the chart needs:

```ts
[
  { year: "2022", SMB: 10, Enterprise: 18 },
  { year: "2023", SMB: 14, Enterprise: null },
]
```

# UX rules

- Always show the generated SQL to the user in analytics/admin contexts.
- Label results as AI-generated SQL over live database data.
- Make loading and failure states explicit; invalid questions and unsafe queries should return actionable errors.
- Prefer sample prompts near the input, such as “Show top customers by revenue this quarter”.
- If no rows are returned, explain that clearly instead of rendering an empty chart.
- Treat charting as optional enhancement, not a requirement for every query.
- In user-facing apps, constrain scope by product area or tenant rather than exposing the full public schema.

# Avoid

- Do not execute model-generated write queries.
- Do not pass DB credentials or direct SQL execution to the client.
- Do not allow unrestricted schema access in multi-tenant apps without row-level or tenant filters.
- Do not assume every result set should become a chart.
- Do not keep the unicorn seed script or demo branding unless the user explicitly wants sample data.
- Do not rely on `SELECT *`; ask the model for explicit columns.
- Do not skip server-side validation of the generated SQL.

# Verification

## Functional checks

1. Confirm the route returns JSON for a simple question:

```bash
curl -X POST http://localhost:3000/api/query \
  -H 'Content-Type: application/json' \
  -d '{"question":"List the 5 most recent orders"}'
```

2. Verify the response includes:
   - `sql`
   - `rows`
   - `summary`
   - optional `explanations`
   - optional `chart`

3. Verify unsafe prompts are blocked, for example prompts attempting deletion or schema mutation.

## Data and safety checks

- Ask for a known aggregate and compare the answer with a manual SQL query.
- Test a question that should return zero rows.
- Test a grouped time-series question if charts are enabled.
- Confirm the route fails safely when the model references a missing column/table.

## Production readiness checks

- Ensure the route is server-only.
- Ensure `OPENAI_API_KEY` and Postgres env vars are set in deployment.
- Ensure result sizes are bounded in prompts sent back to the model for summarization/chart config.
- Add app-specific tenant filtering before shipping to real users.
