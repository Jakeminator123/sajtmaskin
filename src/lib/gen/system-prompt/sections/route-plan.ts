/**
 * Route Plan block + Canonical paths + Recurring Failures + Error-log RAG.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { FEATURES } from "@/lib/config";
import { renderErrorLogRagBlockLines } from "@/lib/gen/rag/error-log-retriever";
import type { RoutePlan } from "../../route-plan";
import type { ScaffoldManifest } from "../../scaffolds/types";
import type { BuildSpec } from "../../build-spec";
import { renderRecurringFailuresBlockLines } from "../recurring-failures";

export function renderRoutePlanBlock(params: {
  routePlan: RoutePlan | null | undefined;
  buildSpec: BuildSpec | null | undefined;
  isFollowUp: boolean;
  chatId: string | null | undefined;
  userPrompt: string | undefined;
  resolvedScaffold: ScaffoldManifest | null | undefined;
}): string[] {
  const { routePlan, buildSpec, isFollowUp, chatId, userPrompt, resolvedScaffold } = params;
  if (!routePlan || routePlan.routes.length === 0) return [];

  const parts: string[] = [];
  const routeRealization = buildSpec?.routeRealization ?? null;
  const routeMode = routeRealization?.mode ?? "full";
  const shellRoutes = routeRealization?.shellRoutePaths ?? [];
  const fullRoutes = routeRealization?.fullRoutePaths ?? routePlan.routes.map((route) => route.path);
  parts.push(
    "## Route Plan",
    "",
    `- **Site type:** ${routePlan.siteType}`,
    `- **Planning source:** ${routePlan.provenance.primarySource}`,
    `- **Route contributors:** ${routePlan.provenance.sources.join(" → ")}`,
    `- **Why:** ${routePlan.reason}`,
    "",
  );
  if (routeRealization) {
    parts.push(`- **Primary route:** \`${routeRealization.primaryRoutePath}\``);
    if (routeMode === "primary-full-with-shells") {
      parts.push(
        `- **Init realization policy:** Fully realize only \`${routeRealization.primaryRoutePath}\` in this generation. Planned extras should start as intentional shell pages.`,
      );
      parts.push(
        `- **Full routes now:** ${fullRoutes.map((path) => `\`${path}\``).join(", ")}`,
      );
      parts.push(
        `- **Shell routes now:** ${shellRoutes.map((path) => `\`${path}\``).join(", ")}`,
      );
    } else {
      parts.push(
        `- **Init realization policy:** Fully realize all planned routes in this generation when they are in scope.`,
      );
    }
    parts.push("");
  }
  for (const route of routePlan.routes.slice(0, 10)) {
    const routeModeLabel =
      routeMode === "primary-full-with-shells"
        ? route.path === routeRealization?.primaryRoutePath
          ? " [full now]"
          : shellRoutes.includes(route.path)
            ? " [shell now]"
            : ""
        : "";
    parts.push(
      `- \`${route.path}\` — ${route.name}${routeModeLabel}: ${route.intent}${route.required ? " (must exist)" : ""}`,
    );
  }
  if (routeMode === "primary-full-with-shells") {
    parts.push(
      "",
      "- For shell routes, create valid App Router pages that look intentional: include page title, route purpose, a short explanation of what the page will become, and a clear primary CTA such as 'Skapa sida'.",
      "- Shell routes should feel like deliberate builder-owned placeholder states, not broken pages. It is fine if they use a bold branded theme treatment to signal 'this route exists and is ready to be expanded next'.",
      "- Keep shell code lightweight, coherent, and safe to preview. They should preserve navigation, metadata surface, and internal linking without pretending to be fully implemented.",
      "- Keep most design and implementation budget on the primary route. Extra planned routes should preserve IA, navigation, metadata, and internal linking without demanding full implementation yet.",
    );
    if (isFollowUp) {
      parts.push(
        "- **Shell preservation rule (follow-up):** These shell routes already exist as intentional placeholders. Do NOT replace, expand, redesign, or regenerate them unless the user explicitly asks to build out that specific page. If your change does not target a shell route, omit it from your response entirely so it is kept as-is.",
      );
    }
  } else if (routePlan.routes.length > 1) {
    parts.push(
      "",
      "- Do not collapse this into a single long landing page. Create real App Router page files for the required routes unless the user explicitly asks to simplify.",
    );
  } else {
    parts.push("", "- Keep the route structure compact unless the prompt clearly requires extra pages.");
  }
  parts.push(
    "- Generate routes in the project's primary language only. Do not emit both '/contact' and '/kontakt' — pick one based on the brief locale.",
  );

  // Hard contract: list the canonical paths the LLM is allowed to use in
  // navigation expressions. This catches the /blog vs /blogg failure mode
  // where the LLM emits href="/blog/${slug}" against actual route /blogg.
  // Mirror of the deterministic preflight check in
  // src/lib/gen/verify/href-route-cross-check.ts.
  const canonicalPaths = routePlan.routes.map((route) => route.path);
  parts.push(
    "",
    "### Canonical route paths (use these EXACTLY in href/Link/router.push/redirect)",
    "",
    ...canonicalPaths.map((path) => `- \`${path}\``),
    "",
    "Hard rules for navigation expressions:",
    "- Never invent paths that are not in the list above.",
    "- For slug-based detail pages, reuse the listing route's path as prefix (e.g. if `/blogg` is listed, use `\\`/blogg/${slug}\\`` — never `\\`/blog/${slug}\\``).",
    "- The finalize preflight runs a deterministic href ↔ route cross-check; mismatches surface as warnings in the version error log and may block future builds.",
    "- Sub-routes (anything other than `/`) MUST NOT auto-redirect back to `/`. Even when the scaffold is one-page-marketing, sub-routes are intentional and must render their own content. NEVER emit `router.push('/')`, `redirect('/')`, or `window.location.href = '/'` inside a sub-route page, layout, or client component on mount. The only legitimate redirect-on-mount target from a sub-route is to a sibling sub-route after a real user action (e.g. successful form submit) — never the root.",
  );
  parts.push("");

  // Phase 2D — recurring failures block. Only on follow-ups (init has no
  // historical patterns), only when the FEATURES.recurringPatternsInMainPrompt
  // toggle is on, and only when there is real signal. Inserted right after
  // the canonical-route-paths block so the model sees both "where to go"
  // and "what not to repeat" together. See renderRecurringFailuresBlockLines.
  if (isFollowUp && FEATURES.recurringPatternsInMainPrompt) {
    const recurringLines = renderRecurringFailuresBlockLines(chatId);
    if (recurringLines.length > 0) {
      parts.push(...recurringLines);
    }
  }

  // Phase 3.4 — Vector RAG block. When enabled, retrieves top-K
  // similar past failures from the deterministic TF-IDF index built
  // by `scripts/observability/index-error-log-rag.mjs` and renders
  // them as `### Lessons from similar past builds`. Auto-rebuilt at
  // npm run dev|build|start (see scripts/dev/next-runner.mjs hook).
  // Capped at 800 chars; falls silently when index is empty/missing.
  if (FEATURES.useErrorLogRag) {
    const ragLines = renderErrorLogRagBlockLines({
      prompt: userPrompt ?? "",
      scaffoldId: resolvedScaffold?.id ?? buildSpec?.scaffoldId ?? null,
      // lineageHash is not surfaced into DynamicContextOptions today; the
      // retriever happily works without it. P26 follow-up could thread it
      // through orchestration-snapshot.
    });
    if (ragLines.length > 0) {
      parts.push(...ragLines);
    }
  }

  return parts;
}
