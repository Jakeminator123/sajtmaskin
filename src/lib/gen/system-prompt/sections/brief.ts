/**
 * Brief-driven sections: Project Context + Pages & Sections + Must Have +
 * Avoid + UX & UI Notes.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { Brief } from "../types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

export function renderBriefBlocks(brief: Brief | null | undefined): string[] {
  if (!brief) return [];

  const parts: string[] = [];

  // ── Project Context (from brief) ────────────────────────────────────────
  const title = str(brief.projectTitle) || str(brief.siteName) || "Website";
  const brand = str(brief.brandName);
  const pitch = str(brief.oneSentencePitch) || str(brief.tagline);
  const audience = str(brief.targetAudience);
  const cta = str(brief.primaryCallToAction);
  const tone = strList(brief.toneAndVoice);

  const ctxLines: string[] = [
    `## Project Context`,
    "",
    `- **Title:** ${title}`,
  ];
  if (brand) ctxLines.push(`- **Brand:** ${brand}`);
  if (pitch) ctxLines.push(`- **Pitch:** ${pitch}`);
  if (audience) ctxLines.push(`- **Audience:** ${audience}`);
  if (cta) ctxLines.push(`- **Primary CTA:** ${cta}`);
  if (tone.length) ctxLines.push(`- **Tone:** ${tone.join(", ")}`);
  ctxLines.push("");

  parts.push(...ctxLines);

  // Pages & Sections — only when the brief carries section-level detail
  // that goes beyond what Route Plan already provides (path + name + intent).
  const pages = Array.isArray(brief.pages) ? brief.pages : [];
  const pagesWithSections = pages.filter(
    (p) => Array.isArray(p?.sections) && p.sections.length > 0,
  );
  if (pagesWithSections.length > 0) {
    parts.push("## Pages & Sections", "");
    for (const p of pagesWithSections.slice(0, 10)) {
      const name = str(p?.name) || "Page";
      const path = str(p?.path) || "/";
      const purpose = str(p?.purpose);
      parts.push(`- **${name}** (\`${path}\`)${purpose ? ` — ${purpose}` : ""}`);
      const sections = Array.isArray(p?.sections) ? p.sections : [];
      for (const s of sections.slice(0, 14)) {
        const type = str(s?.type) || "section";
        const heading = str(s?.heading);
        const bullets = strList(s?.bullets).slice(0, 8);
        const bulletText = bullets.length > 0 ? `: ${bullets.join("; ")}` : "";
        parts.push(`  - ${type}${heading ? ` — ${heading}` : ""}${bulletText}`);
      }
    }
    parts.push("");
  }

  // Must-have / avoid
  const mustHave = strList(brief.mustHave).slice(0, 10);
  const avoid = strList(brief.avoid).slice(0, 8);
  if (mustHave.length > 0) {
    parts.push("## Must Have", "", ...mustHave.map((m) => `- ${m}`), "");
  }
  if (avoid.length > 0) {
    parts.push("## Avoid", "", ...avoid.map((a) => `- ${a}`), "");
  }

  // UX & UI notes from brief
  const uiComponents = strList(brief.uiNotes?.components).slice(0, 16);
  const uiInteractions = strList(brief.uiNotes?.interactions).slice(0, 16);
  const uiAccessibility = strList(brief.uiNotes?.accessibility).slice(0, 16);
  if (uiComponents.length > 0 || uiInteractions.length > 0 || uiAccessibility.length > 0) {
    parts.push("## UX & UI Notes", "");
    if (uiComponents.length > 0) {
      parts.push("**Components:**", ...uiComponents.map((c) => `- ${c}`), "");
    }
    if (uiInteractions.length > 0) {
      parts.push("**Interactions:**", ...uiInteractions.map((i) => `- ${i}`), "");
    }
    if (uiAccessibility.length > 0) {
      parts.push("**Accessibility:**", ...uiAccessibility.map((a) => `- ${a}`), "");
    }
  }

  return parts;
}
