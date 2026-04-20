import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import { configSchema, explanationsSchema } from "@/components/lib/types";

const requestSchema = z.object({
  question: z.string().min(1),
});

const sqlPlanSchema = z.object({
  sql: z.string().describe("A single read-only PostgreSQL query"),
  chartable: z.boolean(),
  chartIntent: z
    .string()
    .nullable()
    .describe("Short note about whether a chart may help explain the result"),
});

function assertReadOnly(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }

  const forbidden = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "truncate",
    "grant",
    "revoke",
    "comment",
    "copy",
    "execute",
    "call",
  ];

  for (const keyword of forbidden) {
    if (normalized.includes(keyword)) {
      throw new Error(`Forbidden SQL keyword detected: ${keyword}`);
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());

    const schemaResult = await sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `;

    const schemaText = schemaResult.rows
      .map((r) => `${r.table_name}.${r.column_name} (${r.data_type})`)
      .join("\n");

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
      prompt: `Database schema:\n${schemaText}\n\nUser question: ${body.question}`,
    });

    assertReadOnly(plan.sql);

    const result = await sql.query(plan.sql);
    const rows = result.rows as Record<string, string | number>[];

    const { text: summary } = await generateText({
      model: openai("gpt-4.1"),
      system: "Explain SQL query results clearly and concisely for an end user.",
      prompt: `Question: ${body.question}\n\nSQL: ${plan.sql}\n\nRows: ${JSON.stringify(rows).slice(0, 12000)}`,
    });

    let explanations = null;
    let chart = null;

    if (rows.length > 0) {
      try {
        const explanationResult = await generateObject({
          model: openai("gpt-4.1"),
          schema: explanationsSchema,
          system: "Return short sections explaining the result set.",
          prompt: `Question: ${body.question}\n\nRows: ${JSON.stringify(rows).slice(0, 12000)}`,
        });
        explanations = explanationResult.object;
      } catch {}

      try {
        const chartResult = await generateObject({
          model: openai("gpt-4.1"),
          schema: configSchema,
          system: [
            "Create chart configs only when the data is suitable for visualization.",
            "Use keys that exist in the SQL result rows.",
            "Prefer bar or line charts for comparisons and trends.",
          ].join(" "),
          prompt: `Question: ${body.question}\n\nRows: ${JSON.stringify(rows).slice(0, 12000)}`,
        });
        chart = chartResult.object;
      } catch {}
    }

    return Response.json({
      sql: plan.sql,
      rows,
      summary,
      explanations,
      chart,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
