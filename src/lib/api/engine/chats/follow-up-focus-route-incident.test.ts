/**
 * Regression for the prod incident where a marked PORTFOLIO nav link plus
 * "ny sida som ska heta Bilder" incorrectly:
 *   1) planned `/work` from focus-block keyword "PORTFOLIO"
 *   2) omitted `components/header.tsx` from the 6-file content context
 *      (slots taken by app/* + base64 favicon)
 *
 * Preview-host install/build readiness is covered by PR A; this file covers
 * the follow-up planning + file-context contract that is unit-testable in-repo.
 */
import { describe, expect, it } from "vitest";

import { buildInspectPointsPrompt } from "@/lib/builder/focus-point-prompt";
import { buildRoutePlan } from "@/lib/gen/route-plan";
import type { CodeFile } from "@/lib/gen/parser";

import { buildFollowUpOrchestrationInput } from "./follow-up-orchestration-input";
import { buildFollowUpFileContextDecision } from "./follow-up-file-context";
import type { FollowUpCapabilityDetection } from "@/lib/builder/follow-up-capability-detection";

const HEADER_CONTENT = `
export function Header() {
  return (
    <header>
      <nav>
        <a href="/">HOME</a>
        <a href="#portfolio">PORTFOLIO</a>
        <a href="#about">ABOUT</a>
      </nav>
    </header>
  );
}
`.trim();

function incidentPreviousFiles(): CodeFile[] {
  return [
    {
      path: "app/page.tsx",
      language: "tsx",
      content: "export default function Page(){return <main><Header/></main>}",
    },
    {
      path: "app/layout.tsx",
      language: "tsx",
      content:
        "import { Header } from '@/components/header'; export default function Layout({children}:{children:React.ReactNode}){return <html><body><Header/>{children}</body></html>}",
    },
    {
      path: "app/globals.css",
      language: "css",
      content: "@import 'tailwindcss';",
    },
    {
      path: "app/favicon.ico",
      language: "binary",
      content: `base64:${"AA".repeat(800)}`,
    },
    {
      path: "components/header.tsx",
      language: "tsx",
      content: HEADER_CONTENT,
    },
    {
      path: "components/hero.tsx",
      language: "tsx",
      content: "export function Hero(){return <section>Hero</section>}",
    },
    {
      path: "components/footer.tsx",
      language: "tsx",
      content: "export function Footer(){return <footer/>}",
    },
    {
      path: "components/about.tsx",
      language: "tsx",
      content: "export function About(){return <section>About</section>}",
    },
    {
      path: "components/contact.tsx",
      language: "tsx",
      content: "export function Contact(){return <section>Contact</section>}",
    },
    {
      path: "lib/utils.ts",
      language: "ts",
      content: "export function cn(){return ''}",
    },
  ];
}

function emptyCapabilityDetection(): FollowUpCapabilityDetection {
  return {
    capabilities: [],
    capabilityIds: [],
    tierByCapability: {},
    wordCount: 0,
    referencesExistingCapability: false,
    modifyReferenceMatches: [],
  };
}

describe("follow-up focus + named page incident (PORTFOLIO → Bilder)", () => {
  const userText = 'Skapa en ny sida som ska heta "Bilder". Länken jag markerade ska gå dit.';

  const focusWithSource = buildInspectPointsPrompt([
    {
      demoUrl: "https://preview.example/session",
      xPercent: 48.2,
      yPercent: 6.1,
      viewportWidth: 1440,
      viewportHeight: 900,
      element: {
        tag: "a",
        id: null,
        className: "nav-link",
        text: "PORTFOLIO",
        ariaLabel: null,
        role: "link",
        href: "#portfolio",
        selector: "header > nav > a:nth-of-type(2)",
        nearestHeading: null,
        sourcePath: "components/header.tsx",
        sourceLine: 6,
      },
      source: "local",
    },
  ]);

  const focusWithoutSource = buildInspectPointsPrompt([
    {
      demoUrl: "https://preview.example/session",
      xPercent: 48.2,
      yPercent: 6.1,
      viewportWidth: 1440,
      viewportHeight: 900,
      element: {
        tag: "a",
        id: null,
        className: "nav-link",
        text: "PORTFOLIO",
        ariaLabel: null,
        role: "link",
        href: "#portfolio",
        selector: "header > nav > a:nth-of-type(2)",
        nearestHeading: null,
      },
      source: "local",
    },
  ]);

  it("route plan creates /bilder and never /work from focus PORTFOLIO text", () => {
    const fullMessage = `${userText}\n\n${focusWithSource}`;
    const plan = buildRoutePlan({
      prompt: fullMessage,
      buildIntent: "website",
      resolvedScaffold: null,
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });

    expect(plan.routes.map((r) => r.path)).toContain("/bilder");
    expect(plan.routes.map((r) => r.path)).not.toContain("/work");
  });

  it("orchestration routePlanPrompt drops focus appendix so PORTFOLIO cannot keyword-match", () => {
    const fullMessage = `${userText}\n\n${focusWithSource}`;
    const input = buildFollowUpOrchestrationInput({
      mode: "codegen",
      optimizedMessage: fullMessage,
      message: fullMessage,
      buildIntent: "website",
      parsedMeta: {
        brief: null,
        themeColors: null,
        palette: null,
        designThemePreset: null,
        scaffoldMode: "auto",
        scaffoldId: null,
        lifecycleStage: "design",
        pageCountHint: null,
        styleKeywordsHint: [],
        toneKeywordsHint: [],
        styleChoiceHint: null,
        colorModeHint: null,
        complexityHint: null,
        buildIntentExplicit: false,
      },
      resolvedImageGenerations: false,
      designReferences: [],
      persistedScaffoldId: "landing-page",
      previousFilesCount: incidentPreviousFiles().length,
      hasFollowUpBase: true,
      ignorePersistedScaffoldForMatch: false,
      promptStrategyMeta: { strategy: "direct", promptType: "followup_general" },
      existingRoutePaths: ["/"],
      existingShellRoutePaths: [],
      followUpCapabilityDetection: emptyCapabilityDetection(),
      followUpIntent: "clear-refine",
      orchestrationSnapshot: null,
      engineModelId: "gpt-5.4",
      chatId: "incident-chat",
    });

    expect(input.routePlanPrompt).toBe(userText);
    expect(input.routePlanPrompt).not.toContain("PORTFOLIO");
    expect(input.rawPrompt).toContain("Källfil: components/header.tsx");
    expect(input.prompt).toContain("PORTFOLIO");

    const planPrompt = input.routePlanPrompt ?? input.rawPrompt ?? "";
    const plan = buildRoutePlan({
      prompt: planPrompt,
      buildIntent: "website",
      resolvedScaffold: null,
      generationMode: "followUp",
      existingRoutePaths: ["/"],
    });
    expect(plan.routes.some((r) => r.path === "/bilder")).toBe(true);
    expect(plan.routes.some((r) => r.path === "/work")).toBe(false);
  });

  it("pins header into model context and skips favicon content slots", () => {
    const fullMessage = `${userText}\n\n${focusWithSource}`;
    const decision = buildFollowUpFileContextDecision({
      message: fullMessage,
      previousFiles: incidentPreviousFiles(),
      followUpIntent: "clear-refine",
    });

    expect(decision.pinnedFiles).toContain("components/header.tsx");
    expect(decision.fileContext.summary).toContain("### components/header.tsx");
    expect(decision.fileContext.summary).toContain("PORTFOLIO");
    expect(decision.fileContext.summary).toContain("| app/favicon.ico |");
    expect(decision.fileContext.summary).not.toContain("### app/favicon.ico");
    expect(decision.fileContext.summary).not.toMatch(/base64:AA/);
  });

  it("literal-search fallback pins header when Källfil is missing", () => {
    const fullMessage = `${userText}\n\n${focusWithoutSource}`;
    const decision = buildFollowUpFileContextDecision({
      message: fullMessage,
      previousFiles: incidentPreviousFiles(),
      followUpIntent: "clear-refine",
    });

    expect(decision.pinnedFiles).toContain("components/header.tsx");
    expect(decision.pinnedFiles).not.toContain("components/footer.tsx");
    expect(decision.fileContext.summary).toContain("### components/header.tsx");
  });

  it("inspect prompt includes Källfil so the model sees the source path", () => {
    expect(focusWithSource).toContain("Källfil: components/header.tsx:6");
    expect(focusWithSource).toContain("Träff-text: PORTFOLIO");
    expect(focusWithSource).toContain("href: #portfolio");
    expect(focusWithSource).toMatch(/Markerad länktext identifierar vilken länk/i);
  });
});
