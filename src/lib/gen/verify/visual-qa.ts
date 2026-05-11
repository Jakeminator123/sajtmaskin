/**
 * Visual QA scoring for live-preview-rendered pages.
 *
 * When preview is running, captures a screenshot of the index route and
 * applies heuristic checks to detect common visual quality issues.
 *
 * Behind feature flag SAJTMASKIN_VISUAL_QA=1. Validated via `serverSchema`
 * in `src/lib/env.ts` so tooling (`scripts/env/manage_env.py`, env-audit)
 * sees the key. Default off.
 */

import { getServerEnv } from "@/lib/env";

export function isVisualQAEnabled(): boolean {
  const v = getServerEnv().SAJTMASKIN_VISUAL_QA?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export interface VisualQACheckResult {
  check: string;
  passed: boolean;
  score: number;
  detail: string;
}

export interface VisualQAResult {
  overallScore: number;
  passed: boolean;
  checks: VisualQACheckResult[];
  screenshotCaptured: boolean;
}

const PASS_THRESHOLD = 60;

/**
 * Analyze generated HTML/CSS files for common visual quality issues
 * without requiring a running preview session. This is a static heuristic check.
 */
export function analyzeVisualQuality(
  files: Array<{ path: string; content: string }>,
): VisualQAResult {
  const checks: VisualQACheckResult[] = [];

  const mainPage = files.find(
    (f) => f.path === "app/page.tsx" || f.path === "src/app/page.tsx",
  );
  const globalsCss = files.find(
    (f) => f.path === "app/globals.css" || f.path === "src/app/globals.css",
  );
  const layout = files.find(
    (f) => f.path === "app/layout.tsx" || f.path === "src/app/layout.tsx",
  );

  checks.push(checkBracketPlaceholders(files));
  checks.push(checkHeroSection(mainPage?.content));
  checks.push(checkColorAdaptation(globalsCss?.content));
  checks.push(checkMetadata(layout?.content));
  checks.push(checkImageUsage(mainPage?.content));
  checks.push(checkSectionVariety(mainPage?.content));
  checks.push(checkWebGLReadiness(files));

  const totalWeight = checks.length * 100;
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const overallScore = totalWeight > 0
    ? Math.round((totalScore / totalWeight) * 100)
    : 0;

  return {
    overallScore,
    passed: overallScore >= PASS_THRESHOLD,
    checks,
    screenshotCaptured: false,
  };
}

function checkWebGLReadiness(
  files: Array<{ path: string; content: string }>,
): VisualQACheckResult {
  const r3fFiles = files.filter(
    (file) =>
      /\.(t|j)sx$/i.test(file.path) &&
      (file.content.includes("@react-three/fiber") || /<Canvas\b/.test(file.content)),
  );

  if (r3fFiles.length === 0) {
    return {
      check: "webgl-readiness",
      passed: true,
      score: 100,
      detail: "No React Three Fiber/WebGL canvas detected.",
    };
  }

  const missingClientBoundary = r3fFiles.filter(
    (file) => !/^\s*["']use client["']\s*;?/m.test(file.content),
  );

  if (missingClientBoundary.length === 0) {
    return {
      check: "webgl-readiness",
      passed: true,
      score: 100,
      detail: `React Three Fiber canvas has client boundary in ${r3fFiles.length} file(s).`,
    };
  }

  return {
    check: "webgl-readiness",
    passed: false,
    score: 0,
    detail: `React Three Fiber canvas missing "use client" in ${missingClientBoundary
      .map((file) => file.path)
      .join(", ")}.`,
  };
}

function checkBracketPlaceholders(
  files: Array<{ path: string; content: string }>,
): VisualQACheckResult {
  const bracketPattern = /\[(?:Butiksnamn|Företagsnamn|Produktnamn|Pris|Kundens namn|Company Name|Product Name|Brand Name|Your (?:Company|Brand|Product))\]/gi;
  let totalHits = 0;

  for (const file of files) {
    const matches = file.content.match(bracketPattern);
    if (matches) totalHits += matches.length;
  }

  if (totalHits === 0) {
    return { check: "no-bracket-placeholders", passed: true, score: 100, detail: "No bracket placeholders found." };
  }
  return {
    check: "no-bracket-placeholders",
    passed: false,
    score: Math.max(0, 100 - totalHits * 25),
    detail: `Found ${totalHits} bracket placeholder(s) that should be replaced with real content.`,
  };
}

function checkHeroSection(content?: string): VisualQACheckResult {
  if (!content) {
    return { check: "hero-quality", passed: false, score: 0, detail: "No main page found." };
  }

  let score = 0;
  const details: string[] = [];

  if (/text-[4-9]xl|text-\dxl/i.test(content)) {
    score += 30;
  } else {
    details.push("Hero headline should use large typography (text-4xl+).");
  }

  if (/py-2[0-9]|py-3[0-9]|py-4[0-9]/i.test(content)) {
    score += 25;
  } else {
    details.push("Hero section needs generous vertical padding (py-20+).");
  }

  if (/Button|button/i.test(content)) {
    score += 25;
  } else {
    details.push("Hero section should have a CTA button.");
  }

  if (/<p[^>]*>/.test(content) && content.length > 500) {
    score += 20;
  } else {
    details.push("Hero should have descriptive subtext.");
  }

  return {
    check: "hero-quality",
    passed: score >= 70,
    score,
    detail: details.length > 0 ? details.join(" ") : "Hero section has good structure.",
  };
}

function checkColorAdaptation(content?: string): VisualQACheckResult {
  if (!content) {
    return { check: "color-adaptation", passed: false, score: 0, detail: "No globals.css found." };
  }

  const neutralPattern = /oklch\([\d.]+ 0 0\)/g;
  const colorPattern = /oklch\([\d.]+ [\d.]+ [\d.]+\)/g;
  const neutralMatches = content.match(neutralPattern) || [];
  const colorMatches = content.match(colorPattern) || [];

  const totalTokens = neutralMatches.length + colorMatches.length;
  if (totalTokens === 0) {
    return { check: "color-adaptation", passed: true, score: 70, detail: "No oklch tokens found (custom CSS?)." };
  }

  const colorRatio = colorMatches.length / totalTokens;
  if (colorRatio >= 0.3) {
    return { check: "color-adaptation", passed: true, score: 100, detail: "Color palette has been adapted from neutral grays." };
  }

  return {
    check: "color-adaptation",
    passed: false,
    score: Math.round(colorRatio * 100),
    detail: `Only ${Math.round(colorRatio * 100)}% of color tokens have hue — palette looks too neutral/gray.`,
  };
}

function checkMetadata(content?: string): VisualQACheckResult {
  if (!content) {
    return { check: "metadata", passed: false, score: 0, detail: "No layout file found." };
  }

  let score = 0;
  if (/title:/i.test(content)) score += 50;
  if (/description:/i.test(content)) score += 50;

  return {
    check: "metadata",
    passed: score >= 50,
    score,
    detail: score >= 100 ? "Title and description metadata present." : "Missing title or description metadata.",
  };
}

function checkImageUsage(content?: string): VisualQACheckResult {
  if (!content) {
    return { check: "image-usage", passed: false, score: 0, detail: "No main page found." };
  }

  const imagePatterns = [/placeholder\.svg/gi, /next\/image/gi, /<img/gi, /Image/g];
  let imageCount = 0;
  for (const pattern of imagePatterns) {
    const matches = content.match(pattern);
    if (matches) imageCount += matches.length;
  }

  if (imageCount >= 3) {
    return { check: "image-usage", passed: true, score: 100, detail: `Found ${imageCount} image references.` };
  }
  if (imageCount >= 1) {
    return { check: "image-usage", passed: true, score: 60, detail: `Only ${imageCount} image reference(s) — consider adding more visual content.` };
  }
  return { check: "image-usage", passed: false, score: 0, detail: "No images found on the main page." };
}

function checkSectionVariety(content?: string): VisualQACheckResult {
  if (!content) {
    return { check: "section-variety", passed: false, score: 0, detail: "No main page found." };
  }

  const sectionPattern = /<section/gi;
  const sections = content.match(sectionPattern) || [];
  const bgAlternation = /bg-muted|bg-card|bg-secondary|bg-accent/gi;
  const bgChanges = content.match(bgAlternation) || [];

  let score = 0;
  if (sections.length >= 3) score += 50;
  else if (sections.length >= 2) score += 30;
  if (bgChanges.length >= 2) score += 50;
  else if (bgChanges.length >= 1) score += 25;

  return {
    check: "section-variety",
    passed: score >= 50,
    score,
    detail: `${sections.length} sections, ${bgChanges.length} background variations.`,
  };
}
