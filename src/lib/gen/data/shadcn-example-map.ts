import type { InferredCapabilities } from "../capability-inference";

/**
 * Maps capability flags to the most relevant shadcn example names.
 * Names must match files in `data/shadcn-examples/{name}.json`
 * or be fetchable from the live registry via shadcn-registry-fetch.
 */
export function getRelevantExampleNames(caps: InferredCapabilities): string[] {
  const names: string[] = [];
  if (caps.needsCalendar) names.push("date-picker-demo");
  if (caps.needsCommandSearch) names.push("combobox-demo");
  if (caps.needsCarousel) names.push("carousel-demo");
  if (caps.needsCharts) {
    names.push("chart-bar-default", "chart-line-default", "chart-pie-simple", "chart-radial-simple");
  }
  if (caps.needsForms && !caps.needsCalendar) names.push("input-form");
  if (caps.needsAuth) names.push("login-01");
  if (caps.needsAppShell) names.push("sidebar-07", "dashboard-01");
  if (caps.needsDataUI) names.push("data-table-demo");
  return names.slice(0, 8);
}

const PROMPT_DRIVEN_PATTERNS: Array<{ pattern: RegExp; names: string[] }> = [
  { pattern: /\bradial.?chart\b/i, names: ["chart-radial-simple", "chart-radial-text"] },
  { pattern: /\bpie.?chart\b/i, names: ["chart-pie-simple", "chart-pie-interactive"] },
  { pattern: /\bradar.?chart\b/i, names: ["chart-radar-default", "chart-radar-multiple"] },
  { pattern: /\bline.?chart\b/i, names: ["chart-line-default", "chart-line-interactive"] },
  { pattern: /\barea.?chart\b/i, names: ["chart-area-default", "chart-area-interactive"] },
  { pattern: /\bstacked.?chart\b/i, names: ["chart-bar-stacked", "chart-area-stacked"] },
  { pattern: /\binteractive.?chart\b/i, names: ["chart-bar-interactive", "chart-line-interactive"] },
  { pattern: /\bdonut\b/i, names: ["chart-pie-donut"] },
  { pattern: /\btooltip.?chart|chart.?tooltip\b/i, names: ["chart-tooltip-default"] },
  { pattern: /\blogin.?(form|page|screen)\b/i, names: ["login-01", "login-04"] },
  { pattern: /\bsignup|registrer\b/i, names: ["signup-01"] },
  { pattern: /\bdashboard\b/i, names: ["dashboard-01"] },
];

/**
 * Extract additional example names from the raw prompt text.
 * Catches specific chart types and block patterns that capability
 * inference does not cover (e.g. "radial chart", "donut chart").
 */
export function getPromptDrivenExampleNames(prompt: string): string[] {
  const names = new Set<string>();
  for (const { pattern, names: candidates } of PROMPT_DRIVEN_PATTERNS) {
    if (pattern.test(prompt)) {
      for (const n of candidates) names.add(n);
    }
  }
  return [...names];
}
