/**
 * AI SDK tool definitions for the own engine's agentistic generation.
 *
 * These tools allow the model to actively signal integration needs,
 * ask clarifying questions, and emit structured plan artifacts instead
 * of us having to parse free text or scan code with regex after the fact.
 */

import { tool } from "ai";
import { z } from "zod";

export const INTEGRATION_PROVIDERS = [
  "supabase",
  "stripe",
  "clerk",
  "next-auth",
  "resend",
  "upstash",
  "prisma",
  "openai",
  "vercel-blob",
  "vercel-kv",
  "google",
  "other",
] as const;

export const suggestIntegration = tool({
  description:
    "Signal that the generated site requires an external integration or service. " +
    "Call this BEFORE writing code that depends on the integration so the user " +
    "can configure it. Include all required environment variables.",
  inputSchema: z.object({
    name: z.string().describe("Human-readable integration name, e.g. 'Supabase'"),
    provider: z
      .enum(INTEGRATION_PROVIDERS)
      .describe("Provider key"),
    envVars: z
      .array(z.string())
      .describe("Environment variable names the integration requires, e.g. ['SUPABASE_URL', 'SUPABASE_ANON_KEY']"),
    reason: z
      .string()
      .describe("Why this integration is needed for the project"),
    setupHint: z
      .string()
      .optional()
      .describe("Brief setup instruction for the user"),
  }),
});

export const requestEnvVar = tool({
  description:
    "Signal that the generated code requires a specific environment variable " +
    "that the user must configure. Use this for custom env vars not covered " +
    "by a known integration provider.",
  inputSchema: z.object({
    key: z
      .string()
      .describe("The environment variable name, e.g. 'MY_API_KEY'"),
    description: z
      .string()
      .describe("What this variable is used for"),
    required: z
      .boolean()
      .default(true)
      .describe("Whether the site will fail without this variable"),
  }),
});

export const askClarifyingQuestion = tool({
  description:
    "Ask the user a clarifying question before generating code. Use this when " +
    "the prompt is ambiguous about a critical decision like database choice, " +
    "auth provider, payment system, or core feature scope.",
  inputSchema: z.object({
    question: z
      .string()
      .describe("The question to ask the user"),
    options: z
      .array(z.string())
      .optional()
      .describe("Quick-reply options for the user to choose from"),
    kind: z
      .enum(["integration", "env", "database", "auth", "payment", "unclear", "scope"])
      .describe("Category of the question"),
    blocking: z
      .boolean()
      .default(true)
      .describe("If true, code generation should pause until answered"),
  }),
});

export const emitPlanArtifact = tool({
  description:
    "Emit a structured project plan. Use this in plan mode to return " +
    "the plan as a structured artifact instead of free text.",
  inputSchema: z.object({
    goal: z.string().describe("One-sentence project goal"),
    scope: z.array(z.string()).describe("Pages or sections to build"),
    steps: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        phase: z.enum(["build", "polish", "verify"]),
      }),
    ),
    blockers: z
      .array(
        z.object({
          id: z.string(),
          kind: z.enum([
            "integration",
            "env",
            "database",
            "auth",
            "payment",
            "unclear",
          ]),
          question: z.string(),
          options: z.array(z.string()).optional(),
        }),
      )
      .optional()
      .default([]),
    assumptions: z
      .array(
        z.object({
          id: z.string(),
          description: z.string(),
          defaultValue: z.string(),
        }),
      )
      .optional()
      .default([]),
  }),
});

export function getAgentTools() {
  return {
    suggestIntegration,
    requestEnvVar,
    askClarifyingQuestion,
    emitPlanArtifact,
  };
}

export type AgentToolName = keyof ReturnType<typeof getAgentTools>;
