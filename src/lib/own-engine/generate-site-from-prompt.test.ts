import { beforeEach, describe, expect, it, vi } from "vitest";

const CHAT_ID = "chat_test_1";
const VERSION_ID = "ver_test_1";
const MSG_ID = "msg_test_1";

const createGenerationPipelineMock = vi.hoisted(() => vi.fn());
const createChatMock = vi.hoisted(() => vi.fn());
const addMessageMock = vi.hoisted(() => vi.fn());
const addAssistantMessageAndCreateDraftVersionMock = vi.hoisted(() => vi.fn());
const getChatOrchestrationSnapshotMock = vi.hoisted(() => vi.fn());
const updateChatOrchestrationSnapshotMock = vi.hoisted(() => vi.fn());
const logGenerationMock = vi.hoisted(() => vi.fn());
const failVersionVerificationMock = vi.hoisted(() => vi.fn());
const createGenerationTelemetryRecordMock = vi.hoisted(() => vi.fn());
const createEngineVersionErrorLogsMock = vi.hoisted(() => vi.fn());
const buildOwnEnginePreviewRuntimeMock = vi.hoisted(() => vi.fn());
const buildSandboxEnvLocalContentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/generation-pipeline", () => ({
  createGenerationPipeline: createGenerationPipelineMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
  dbConfigured: false,
}));

vi.mock("@/lib/db/chat-repository-pg", () => ({
  createChat: createChatMock,
  addMessage: addMessageMock,
  addAssistantMessageAndCreateDraftVersion: addAssistantMessageAndCreateDraftVersionMock,
  getChatOrchestrationSnapshot: getChatOrchestrationSnapshotMock,
  updateChatOrchestrationSnapshot: updateChatOrchestrationSnapshotMock,
  logGeneration: logGenerationMock,
  failVersionVerification: failVersionVerificationMock,
  createDraftVersion: vi.fn(),
  getChat: vi.fn(),
  deleteEngineMessage: vi.fn(),
}));

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  createGenerationTelemetryRecord: createGenerationTelemetryRecordMock,
}));

vi.mock("@/lib/db/services/version-errors", () => ({
  createEngineVersionErrorLogs: createEngineVersionErrorLogsMock,
}));

vi.mock("@/lib/gen/prompt-dump", () => ({
  dumpOwnEngineCodegenFromFullSystem: vi.fn(),
  writeLatestPromptDump: vi.fn(),
  PROMPT_DUMP_CATEGORY: "own-engine",
  isPromptDumpEnabled: () => false,
}));

vi.mock("@/lib/mcp/runtime-url", () => ({
  buildOwnEnginePreviewRuntime: buildOwnEnginePreviewRuntimeMock,
  createSandboxRuntimeFromFiles: vi.fn(),
  isSandboxConfigured: () => false,
}));

vi.mock("@/lib/gen/sandbox-env-local", () => ({
  buildSandboxEnvLocalContents: buildSandboxEnvLocalContentsMock,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: vi.fn(),
  devLogFinalizeSite: vi.fn(),
}));

vi.mock("@/lib/utils/debug", () => ({
  debugLog: vi.fn(),
  warnLog: vi.fn(),
}));

import { generateOwnEngineSiteFromPrompt } from "./generate-site-from-prompt";

const LLM_CONTENT = [
  "```tsx file=\"app/page.tsx\"",
  "import { Button } from \"@/components/ui/button\";",
  "",
  "export default function HomePage() {",
  "  return (",
  "    <main className=\"min-h-screen bg-background\">",
  "      <section className=\"mx-auto max-w-4xl px-4 py-24 text-center\">",
  "        <h1 className=\"text-5xl font-bold tracking-tight\">Lindström & Co</h1>",
  "        <p className=\"mt-4 text-lg text-muted-foreground\">Juridisk expertis sedan 1985</p>",
  "        <Button size=\"lg\" className=\"mt-8\">Kontakta oss</Button>",
  "      </section>",
  "    </main>",
  "  );",
  "}",
  "```",
  "",
  "```css file=\"app/globals.css\"",
  "@import \"tailwindcss\";",
  "@theme inline {",
  "  --color-background: oklch(0.98 0 0);",
  "  --color-foreground: oklch(0.15 0 0);",
  "  --color-primary: oklch(0.35 0.05 250);",
  "  --color-primary-foreground: oklch(0.98 0 0);",
  "  --color-muted: oklch(0.94 0.01 250);",
  "  --color-muted-foreground: oklch(0.45 0.02 250);",
  "  --color-accent: oklch(0.55 0.12 45);",
  "}",
  "```",
].join("\n");

function buildSSEPayload(text: string): string {
  const contentLine = `event: content\ndata: ${JSON.stringify({ text })}\n\n`;
  const doneLine = `event: done\ndata: ${JSON.stringify({ promptTokens: 150, completionTokens: 800 })}\n\n`;
  return contentLine + doneLine;
}

function sseStream(payload: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(payload);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

function setupMocks() {
  createGenerationPipelineMock.mockReturnValue(sseStream(buildSSEPayload(LLM_CONTENT)));

  createChatMock.mockResolvedValue({
    id: CHAT_ID,
    project_id: "proj_1",
    title: null,
    model: "gpt-5.4",
    system_prompt: null,
    scaffold_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  addMessageMock.mockResolvedValue({
    id: "msg_user_1",
    chat_id: CHAT_ID,
    role: "user",
    content: "",
    token_count: null,
    created_at: new Date().toISOString(),
  });

  addAssistantMessageAndCreateDraftVersionMock.mockResolvedValue({
    message: {
      id: MSG_ID,
      chat_id: CHAT_ID,
      role: "assistant",
      content: "",
      token_count: null,
      created_at: new Date().toISOString(),
    },
    version: {
      id: VERSION_ID,
      chat_id: CHAT_ID,
      message_id: MSG_ID,
      version_number: 1,
      files_json: "[]",
      sandbox_url: null,
      release_state: "draft",
      verification_state: "pending",
      verification_summary: null,
      promoted_at: null,
      created_at: new Date().toISOString(),
    },
  });

  getChatOrchestrationSnapshotMock.mockResolvedValue(null);
  updateChatOrchestrationSnapshotMock.mockResolvedValue(true);
  logGenerationMock.mockResolvedValue({
    id: "gen_log_1",
    chat_id: CHAT_ID,
    model: "gpt-5.4",
    prompt_tokens: 150,
    completion_tokens: 800,
    duration_ms: 1000,
    success: 1,
    error_message: null,
    created_at: new Date().toISOString(),
  });
  failVersionVerificationMock.mockResolvedValue(null);

  createGenerationTelemetryRecordMock.mockResolvedValue({ id: "tel_1" });
  createEngineVersionErrorLogsMock.mockResolvedValue([]);

  buildOwnEnginePreviewRuntimeMock.mockReturnValue({
    url: `https://preview.test/${CHAT_ID}/${VERSION_ID}`,
  });

  buildSandboxEnvLocalContentsMock.mockResolvedValue("# sandbox env\n");
}

describe("generateOwnEngineSiteFromPrompt — full pipeline e2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("generates a site for 'Bygg en hemsida för en advokatbyrå'", async () => {
    const result = await generateOwnEngineSiteFromPrompt({
      prompt: "Bygg en hemsida för en advokatbyrå",
      projectId: "proj_1",
      buildIntent: "website",
    });

    expect(result.chatId).toBe(CHAT_ID);
    expect(result.versionId).toBe(VERSION_ID);
    expect(typeof result.model).toBe("string");
    expect(result.scaffoldId).not.toBeNull();
    expect(result.filesCount).toBeGreaterThan(0);

    expect(createGenerationTelemetryRecordMock).toHaveBeenCalledOnce();
    const telemetryArg = createGenerationTelemetryRecordMock.mock.calls[0][0];
    expect(telemetryArg.qualityGateResult).toMatch(/preflight/);
    expect(telemetryArg.meta).toBeDefined();
    expect(telemetryArg.meta.buildSpec).toBeDefined();
    expect(telemetryArg.meta.buildSpec.previewPolicy).toBe("fidelity2");
  }, 30_000);

  it("generates a site for 'Build a SaaS landing page with pricing'", async () => {
    createGenerationPipelineMock.mockReturnValue(sseStream(buildSSEPayload(LLM_CONTENT)));

    const result = await generateOwnEngineSiteFromPrompt({
      prompt: "Build a SaaS landing page with pricing",
      projectId: "proj_2",
      buildIntent: "website",
    });

    expect(result.scaffoldId).not.toBeNull();
    expect(result.filesCount).toBeGreaterThan(0);

    expect(updateChatOrchestrationSnapshotMock).toHaveBeenCalled();
  }, 30_000);
});
