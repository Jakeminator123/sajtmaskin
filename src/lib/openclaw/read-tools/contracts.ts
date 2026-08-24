import { z } from "zod";

export const OPENCLAW_READ_TOOL_NAMES = [
  "project_list_files",
  "project_read_file",
  "project_search_code",
  "project_get_version",
  "project_get_diagnostics",
  "preview_get_status",
  "preview_get_logs",
] as const;

export type OpenClawReadToolName = (typeof OPENCLAW_READ_TOOL_NAMES)[number];

const pathSchema = z.string().trim().min(1).max(200);
const optionalPrefixSchema = z.string().trim().max(200).nullish();
const optionalCursorSchema = z
  .string()
  .regex(/^v1:\d+$/)
  .nullish();
const optionalIntegerSchema = (min: number, max: number) =>
  z.number().int().min(min).max(max).nullish();
const optionalBooleanSchema = z.boolean().nullish();

export const openClawListFilesArgsSchema = z
  .object({
    prefix: optionalPrefixSchema,
    cursor: optionalCursorSchema,
    limit: optionalIntegerSchema(1, 100),
  })
  .strict();

export const openClawReadFileArgsSchema = z
  .object({
    path: pathSchema,
    startLine: optionalIntegerSchema(1, 100_000),
    endLine: optionalIntegerSchema(1, 100_000),
  })
  .strict()
  .refine(
    (value) => value.startLine == null || value.endLine == null || value.endLine >= value.startLine,
    { message: "endLine must be greater than or equal to startLine" },
  );

export const openClawSearchCodeArgsSchema = z
  .object({
    query: z.string().min(2).max(160),
    pathPrefix: optionalPrefixSchema,
    caseSensitive: optionalBooleanSchema,
    limit: optionalIntegerSchema(1, 30),
  })
  .strict();

export const openClawDiagnosticsArgsSchema = z
  .object({
    limit: optionalIntegerSchema(1, 30),
  })
  .strict();

export const openClawPreviewLogsArgsSchema = z
  .object({
    limit: optionalIntegerSchema(1, 40),
  })
  .strict();

const emptyArgsSchema = z.object({}).strict();

const schemasByName = {
  project_list_files: openClawListFilesArgsSchema,
  project_read_file: openClawReadFileArgsSchema,
  project_search_code: openClawSearchCodeArgsSchema,
  project_get_version: emptyArgsSchema,
  project_get_diagnostics: openClawDiagnosticsArgsSchema,
  preview_get_status: emptyArgsSchema,
  preview_get_logs: openClawPreviewLogsArgsSchema,
} satisfies Record<OpenClawReadToolName, z.ZodType>;

export type OpenClawReadToolArgs = {
  project_list_files: { prefix?: string; cursor?: string; limit?: number };
  project_read_file: { path: string; startLine?: number; endLine?: number };
  project_search_code: {
    query: string;
    pathPrefix?: string;
    caseSensitive?: boolean;
    limit?: number;
  };
  project_get_version: Record<string, never>;
  project_get_diagnostics: { limit?: number };
  preview_get_status: Record<string, never>;
  preview_get_logs: { limit?: number };
};

export type OpenClawReadToolCall = {
  [Name in OpenClawReadToolName]: {
    name: Name;
    arguments: OpenClawReadToolArgs[Name];
  };
}[OpenClawReadToolName];

export type OpenClawFunctionToolDefinition = {
  type: "function";
  function: {
    name: OpenClawReadToolName;
    description: string;
    strict: true;
    parameters: Record<string, unknown>;
  };
};

const noArgsParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
  required: [],
} as const;

/**
 * Client-supplied function tools for the OpenClaw Chat Completions boundary.
 * None of the schemas accept tenant, chat, version, URL or credential fields;
 * those values are bound by the server-side read session instead.
 */
export const OPENCLAW_READ_TOOL_DEFINITIONS: readonly OpenClawFunctionToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "project_list_files",
      description: "List bounded paths from the server-bound project version snapshot.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          prefix: { type: ["string", "null"], maxLength: 200 },
          cursor: { type: ["string", "null"], pattern: "^v1:[0-9]+$" },
          limit: { type: ["integer", "null"], minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
        required: ["prefix", "cursor", "limit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_read_file",
      description:
        "Read a bounded line range from one non-sensitive text file in the bound snapshot.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1, maxLength: 200 },
          startLine: { type: ["integer", "null"], minimum: 1, maximum: 100_000 },
          endLine: { type: ["integer", "null"], minimum: 1, maximum: 100_000 },
        },
        additionalProperties: false,
        required: ["path", "startLine", "endLine"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_search_code",
      description: "Search literal text in bounded, non-sensitive project source files.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 2, maxLength: 160 },
          pathPrefix: { type: ["string", "null"], maxLength: 200 },
          caseSensitive: { type: ["boolean", "null"] },
          limit: { type: ["integer", "null"], minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
        required: ["query", "pathPrefix", "caseSensitive", "limit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_get_version",
      description:
        "Read scrubbed metadata for the exact server-bound project version and revision.",
      strict: true,
      parameters: noArgsParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "project_get_diagnostics",
      description: "Read bounded, scrubbed diagnostics for the exact server-bound version.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          limit: { type: ["integer", "null"], minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
        required: ["limit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_get_status",
      description:
        "Read passive, scrubbed preview session and file-manifest status without starting the runtime.",
      strict: true,
      parameters: noArgsParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "preview_get_logs",
      description:
        "Read bounded, scrubbed event lines for the bound preview session without exposing its id or URL.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          limit: { type: ["integer", "null"], minimum: 1, maximum: 40 },
        },
        additionalProperties: false,
        required: ["limit"],
      },
    },
  },
] as const;

export type ParseOpenClawReadToolCallResult =
  { ok: true; call: OpenClawReadToolCall } | { ok: false; message: string };

function parseArguments(raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return Symbol.for("openclaw.invalid-json");
  }
}

function normalizeNullableArguments(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, item === null ? undefined : item]),
  );
}

export function parseOpenClawReadToolCall(input: {
  name: unknown;
  arguments?: unknown;
}): ParseOpenClawReadToolCallResult {
  if (
    typeof input.name !== "string" ||
    !OPENCLAW_READ_TOOL_NAMES.includes(input.name as OpenClawReadToolName)
  ) {
    return { ok: false, message: "Unknown read tool." };
  }

  const name = input.name as OpenClawReadToolName;
  const parsedArguments = parseArguments(input.arguments);
  if (typeof parsedArguments === "symbol") {
    return { ok: false, message: "Tool arguments must be valid JSON." };
  }
  const parsed = schemasByName[name].safeParse(parsedArguments);
  if (!parsed.success) {
    return { ok: false, message: "Tool arguments do not match the read-only contract." };
  }
  return {
    ok: true,
    call: {
      name,
      arguments: normalizeNullableArguments(parsed.data),
    } as OpenClawReadToolCall,
  };
}
