import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { detectFollowUpCapabilities } from "@/lib/builder/follow-up-capability-detection";
import { buildFollowUpFileContextDecision } from "@/lib/api/engine/chats/follow-up-file-context";
import { buildFollowUpOrchestrationInput } from "@/lib/api/engine/chats/follow-up-orchestration-input";
import { classifyFollowUpIntent } from "@/lib/providers/own-engine/follow-up-clarification";
import {
  PROMPT_WRAPPER_HEADINGS,
  wrapWithSection,
} from "@/lib/gen/prompt-wrapper-contract";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import type { CodeFile } from "@/lib/gen/parser";

type FollowUpEvalCase = {
  id: string;
  message: string;
  previousFiles: CodeFile[];
  persistedScaffoldId: string;
  persistedVariantId: string;
  buildIntent: "website" | "template" | "app";
  expected: {
    maxOptimizedMessageChars: number;
    maxSystemPromptChars: number;
  };
};

type FollowUpEvalResult = {
  id: string;
  passed: boolean;
  optimizedMessageChars: number;
  systemPromptChars: number;
  dynamicContextChars: number;
  contextPolicy: string;
  fileContextPolicy: string;
  maxFilesWithContent: number;
  pinnedFiles: string[];
  scaffoldId: string | null;
  variantId: string | null;
  issues: string[];
};

const FOLLOW_UP_SYSTEM_POINTER =
  "(Follow-up rules: see system prompt § Generation Mode: Follow-Up.)";

const landingPreviousFiles: CodeFile[] = [
  {
    path: "app/page.tsx",
    language: "tsx",
    content: `import { Hero } from "@/components/hero";
import { Menu } from "@/components/menu";
import { Contact } from "@/components/contact";

export default function Page() {
  return <main><Hero /><Menu /><Contact /></main>;
}
`,
  },
  {
    path: "app/layout.tsx",
    language: "tsx",
    content: `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="sv"><body>{children}</body></html>;
}
`,
  },
  {
    path: "app/globals.css",
    language: "css",
    content: `@import "tailwindcss";
@theme inline {
  --color-background: oklch(0.98 0.02 80);
  --color-foreground: oklch(0.2 0.03 80);
}
`,
  },
  {
    path: "components/hero.tsx",
    language: "tsx",
    content: `export function Hero() {
  return <section className="py-24"><h1>Kaffekoppen</h1><p>Kaffe i hjärtat av stan.</p></section>;
}
`,
  },
  {
    path: "components/menu.tsx",
    language: "tsx",
    content: `export function Menu() {
  return <section className="py-16"><h2>Meny</h2><p>Bryggkaffe, espresso och bakverk.</p></section>;
}
`,
  },
  {
    path: "components/contact.tsx",
    language: "tsx",
    content: `export function Contact() {
  return <section className="py-16"><h2>Kontakt</h2><p>Öppet varje dag.</p></section>;
}
`,
  },
];

const CASES: FollowUpEvalCase[] = [
  {
    id: "copy-hero-title",
    message: "Byt rubriken i hero till Kaffe med hjärta.",
    previousFiles: landingPreviousFiles,
    persistedScaffoldId: "landing-page",
    persistedVariantId: "warm-local",
    buildIntent: "website",
    expected: {
      maxOptimizedMessageChars: 18_000,
      maxSystemPromptChars: 72_000,
    },
  },
  {
    id: "style-background",
    message: "Gör bakgrunden mörkare och färgerna lite varmare.",
    previousFiles: landingPreviousFiles,
    persistedScaffoldId: "landing-page",
    persistedVariantId: "warm-local",
    buildIntent: "website",
    expected: {
      maxOptimizedMessageChars: 22_000,
      maxSystemPromptChars: 76_000,
    },
  },
];

function buildOptimizedFollowUpMessage(params: {
  message: string;
  previousFiles: CodeFile[];
  followUpIntent: ReturnType<typeof classifyFollowUpIntent>;
}): {
  optimizedMessage: string;
  fileContextDecision: ReturnType<typeof buildFollowUpFileContextDecision>;
} {
  const fileContextDecision = buildFollowUpFileContextDecision({
    message: params.message,
    previousFiles: params.previousFiles,
    followUpIntent: params.followUpIntent,
  });
  const optimizedMessage = [
    wrapWithSection({
      heading: PROMPT_WRAPPER_HEADINGS.followUpEditingMode,
      introLines: [FOLLOW_UP_SYSTEM_POINTER],
      body: fileContextDecision.fileContext.summary,
    }),
    "",
    PROMPT_WRAPPER_HEADINGS.requestedChanges,
    "",
    params.message,
  ].join("\n");
  return { optimizedMessage, fileContextDecision };
}

async function runCase(testCase: FollowUpEvalCase): Promise<FollowUpEvalResult> {
  const promptOrchestration = orchestratePromptMessage({
    message: testCase.message,
    buildIntent: testCase.buildIntent,
    isFirstPrompt: false,
  });
  const followUpIntent = classifyFollowUpIntent(testCase.message);
  const { optimizedMessage, fileContextDecision } = buildOptimizedFollowUpMessage({
    message: testCase.message,
    previousFiles: testCase.previousFiles,
    followUpIntent,
  });
  const orchestrationInput = buildFollowUpOrchestrationInput({
    mode: "codegen",
    optimizedMessage,
    message: testCase.message,
    buildIntent: testCase.buildIntent,
    parsedMeta: {
      brief: null,
      themeColors: null,
      palette: null,
      designThemePreset: null,
      scaffoldMode: "auto",
      scaffoldId: null,
      lifecycleStage: "design",
    },
    resolvedImageGenerations: false,
    designReferences: [],
    persistedScaffoldId: testCase.persistedScaffoldId,
    previousFilesCount: testCase.previousFiles.length,
    hasFollowUpBase: true,
    ignorePersistedScaffoldForMatch: false,
    promptStrategyMeta: promptOrchestration.strategyMeta,
    existingRoutePaths: ["/"],
    existingShellRoutePaths: [],
    followUpCapabilityDetection: detectFollowUpCapabilities(testCase.message),
    followUpIntent,
    orchestrationSnapshot: {
      scaffoldId: testCase.persistedScaffoldId,
      variantId: testCase.persistedVariantId,
      briefSummary: {
        projectTitle: "Kaffekoppen",
        styleKeywords: ["warm", "local"],
        toneKeywords: ["friendly"],
        qualityBar: "premium",
      },
      buildSpec: {
        qualityTarget: "premium",
      },
    },
    engineModelId: "gpt-5.4",
    persistedVariantId: testCase.persistedVariantId,
    priorQualityTarget: "premium",
  });
  orchestrationInput.embeddingScaffoldMatch = false;
  const generationInput = await prepareGenerationContext(orchestrationInput);
  const issues: string[] = [];
  if (optimizedMessage.length > testCase.expected.maxOptimizedMessageChars) {
    issues.push(
      `optimizedMessage ${optimizedMessage.length} > ${testCase.expected.maxOptimizedMessageChars}`,
    );
  }
  if (generationInput.promptSize.total.chars > testCase.expected.maxSystemPromptChars) {
    issues.push(
      `systemPrompt ${generationInput.promptSize.total.chars} > ${testCase.expected.maxSystemPromptChars}`,
    );
  }
  return {
    id: testCase.id,
    passed: issues.length === 0,
    optimizedMessageChars: optimizedMessage.length,
    systemPromptChars: generationInput.promptSize.total.chars,
    dynamicContextChars: generationInput.promptSize.dynamicContext.chars,
    contextPolicy: generationInput.buildSpec.contextPolicy,
    fileContextPolicy: fileContextDecision.contextPolicy,
    maxFilesWithContent: fileContextDecision.maxFilesWithContent,
    pinnedFiles: fileContextDecision.pinnedFiles,
    scaffoldId: generationInput.resolvedScaffold?.id ?? null,
    variantId: generationInput.variantId ?? null,
    issues,
  };
}

export async function runFollowUpContextEval(): Promise<FollowUpEvalResult[]> {
  const results: FollowUpEvalResult[] = [];
  for (const testCase of CASES) {
    results.push(await runCase(testCase));
  }
  return results;
}

export function formatFollowUpContextEvalReport(results: FollowUpEvalResult[]): string {
  const lines = [
    "# Follow-up Context Eval",
    "",
    "| Case | Status | FileCtx | System | Dynamic | Policy | Pins | Issues |",
    "|---|---|---:|---:|---:|---|---|---|",
  ];
  for (const result of results) {
    lines.push(
      `| ${result.id} | ${result.passed ? "PASS" : "FAIL"} | ${result.optimizedMessageChars} | ${result.systemPromptChars} | ${result.dynamicContextChars} | ${result.fileContextPolicy}/${result.contextPolicy} | ${result.pinnedFiles.join(", ") || "-"} | ${result.issues.join("; ") || "-"} |`,
    );
  }
  return lines.join("\n");
}
