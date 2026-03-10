# Plan 06: Eval-loop och kvalitets-scoring

> Prioritet: MEDEL — ger mätbar kvalitet och regressionsskydd
> Beroenden: Plan 01-05 (testar hela pipelinen)
> Insats: 5-7 dagar

## Problemet

Ingen systematisk mätning av generationskvalitet. Vi vet inte:
- Hur ofta genererad kod kompilerar rent
- Hur ofta preview renderar korrekt
- Om nya ändringar förbättrar eller försämrar kvaliteten

## Lösning

Bygg en eval-runner som kör test-prompts genom motorn, validerar output, och producerar en kvalitetsrapport.

## Nya filer att skapa

### `src/lib/gen/eval/prompts.ts`

Test-prompter med förväntade egenskaper:

```typescript
interface EvalPrompt {
  id: string;
  prompt: string;
  intent: "website" | "template" | "app";
  expectedFeatures: {
    minFiles: number;
    maxFiles: number;
    mustInclude: string[];       // filnamn som måste finnas
    mustImport: string[];        // paket som bör importeras
    mustHaveExports: boolean;
    shouldCompile: boolean;
    shouldRender: boolean;       // preview bör visa innehåll
  };
}

const EVAL_PROMPTS: EvalPrompt[] = [
  {
    id: "simple-landing",
    prompt: "Create a landing page for a Swedish coffee shop called Kaffekoppen",
    intent: "website",
    expectedFeatures: {
      minFiles: 1, maxFiles: 8,
      mustInclude: ["app/page.tsx"],
      mustImport: ["@/components/ui/button"],
      mustHaveExports: true,
      shouldCompile: true,
      shouldRender: true,
    },
  },
  {
    id: "dashboard",
    prompt: "Build a dashboard with user statistics, charts, and a sidebar navigation",
    intent: "app",
    expectedFeatures: {
      minFiles: 3, maxFiles: 15,
      mustInclude: ["app/page.tsx"],
      mustImport: ["@/components/ui/card"],
      mustHaveExports: true,
      shouldCompile: true,
      shouldRender: true,
    },
  },
  // ... 8-10 fler prompts (portfolio, e-commerce, blog, kontaktsida, etc.)
];
```

### `src/lib/gen/eval/checks.ts`

Individuella kvalitetskontroller:

```typescript
interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  score: number;  // 0-1
}

function checkFileCount(files: CodeFile[], expected: { min: number; max: number }): CheckResult
function checkRequiredFiles(files: CodeFile[], mustInclude: string[]): CheckResult
function checkExports(files: CodeFile[]): CheckResult
function checkSyntax(files: CodeFile[]): Promise<CheckResult>  // uses esbuild
function checkImports(files: CodeFile[], mustImport: string[]): CheckResult
function checkUseClient(files: CodeFile[]): CheckResult
function checkNoHardcodedColors(files: CodeFile[]): CheckResult
function checkResponsive(files: CodeFile[]): CheckResult  // letar efter sm:/md:/lg:
function checkAccessibility(files: CodeFile[]): CheckResult  // letar efter alt, aria-, role
```

### `src/lib/gen/eval/runner.ts`

Kör alla prompts och samlar resultat:

```typescript
interface EvalResult {
  promptId: string;
  prompt: string;
  generationTimeMs: number;
  retryCount: number;
  files: CodeFile[];
  checks: CheckResult[];
  totalScore: number;        // 0-100
  passed: boolean;
}

interface EvalReport {
  timestamp: string;
  model: string;
  totalPrompts: number;
  passedPrompts: number;
  averageScore: number;
  averageGenerationTimeMs: number;
  results: EvalResult[];
}

async function runEval(options?: { prompts?: EvalPrompt[]; model?: string }): Promise<EvalReport>
```

Implementation:
1. För varje prompt:
   a. Bygg systemprompt med `buildSystemPrompt()`
   b. Generera med `generateCode()` (icke-streaming, vänta på hela svaret)
   c. Parsa med `parseCodeProject()`
   d. Kör autofix med `runAutoFix()`
   e. Kör alla checks
   f. Sammanställ score
2. Producera rapport

### `src/lib/gen/eval/report.ts`

Formaterar rapport som markdown:

```typescript
function formatReport(report: EvalReport): string
```

Output-format:
```markdown
# Eval Report — 2026-03-06

Model: gpt-5.2 | Prompts: 10 | Passed: 8/10 | Avg Score: 78%

| Prompt | Score | Compile | Files | Time | Issues |
|--------|-------|---------|-------|------|--------|
| simple-landing | 92% | ✓ | 4 | 12.3s | |
| dashboard | 85% | ✓ | 8 | 18.7s | Missing responsive |
| ...
```

### `scripts/run-eval.ts`

Körbart script:

```typescript
#!/usr/bin/env npx tsx
import { runEval } from "../src/lib/gen/eval/runner";
import { formatReport } from "../src/lib/gen/eval/report";
import { writeFileSync } from "fs";

async function main() {
  console.log("Starting eval...");
  const report = await runEval();
  const markdown = formatReport(report);
  const filename = `eval-report-${new Date().toISOString().split("T")[0]}.md`;
  writeFileSync(filename, markdown);
  console.log(`Report saved to ${filename}`);
  console.log(`Score: ${report.averageScore}% (${report.passedPrompts}/${report.totalPrompts} passed)`);
  process.exit(report.passedPrompts === report.totalPrompts ? 0 : 1);
}

main().catch(console.error);
```

## Acceptanskriterier

- [ ] Minst 10 eval-prompts definierade
- [ ] Minst 8 kvalitetskontroller implementerade
- [ ] `runEval()` kör alla prompts och producerar rapport
- [ ] Rapport är läsbar markdown med scores
- [ ] Script körbart med `npx tsx scripts/run-eval.ts`
- [ ] Inga nya lint-fel
- [ ] TypeScript kompilerar rent
