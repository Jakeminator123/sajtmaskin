import type { InferredCapabilities } from "../capability-inference";

/**
 * Maps capability flags to the most relevant shadcn example names.
 * Names must match files in `data/shadcn-examples/{name}.json`.
 */
export function getRelevantExampleNames(caps: InferredCapabilities): string[] {
  const names: string[] = [];
  if (caps.needsCalendar) names.push("date-picker-demo");
  if (caps.needsCommandSearch) names.push("combobox-demo");
  if (caps.needsCarousel) names.push("carousel-demo");
  if (caps.needsCharts) names.push("chart-bar-default");
  if (caps.needsForms && !caps.needsCalendar) names.push("input-form");
  if (caps.needsAppShell) names.push("sidebar-07");
  if (caps.needsDataUI) names.push("data-table-demo");
  return names.slice(0, 5);
}
