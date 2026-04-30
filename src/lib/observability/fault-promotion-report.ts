import type { FaultEvent } from "./fault-events";

export interface FaultPromotionCandidate {
  faultType: string;
  count: number;
  successRate: number | null;
  topFiles: string[];
  topScaffolds: string[];
  topCapabilities: string[];
  recommendedPromotion: string;
  evidence: string[];
}

function topKeys(counts: Map<string, number>, limit = 3): string[] {
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, limit)
    .map(([key, count]) => `${key} (${count})`);
}

function recommendPromotion(candidate: {
  faultType: string;
  count: number;
  topCapabilities: string[];
  topScaffolds: string[];
}): string {
  const fault = candidate.faultType.toLowerCase();
  if (candidate.count < 2) return "investigate";
  if (fault.includes("import") || fault.includes("type") || fault.includes("module")) {
    return "mechanical-fixer-or-core-rule";
  }
  if (fault.includes("3d") || fault.includes("r3f") || candidate.topCapabilities.some((cap) => cap.includes("3d"))) {
    return "capability-dossier-or-3d-policy";
  }
  if (fault.includes("a11y") || fault.includes("form")) {
    return "component-contract-or-verifier";
  }
  if (candidate.topScaffolds.length > 0) return "scaffold-or-variant-fix";
  return "verifier-rule-or-core-rule";
}

export function buildFaultPromotionCandidates(
  events: FaultEvent[],
): FaultPromotionCandidate[] {
  const groups = new Map<string, FaultEvent[]>();
  for (const event of events) {
    const key = event.faultType || event.normalizedPattern || "unknown_fault";
    const current = groups.get(key) ?? [];
    current.push(event);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([faultType, group]) => {
      const files = new Map<string, number>();
      const scaffolds = new Map<string, number>();
      const capabilities = new Map<string, number>();
      let knownOutcomes = 0;
      let successes = 0;
      for (const event of group) {
        if (event.filePath) files.set(event.filePath, (files.get(event.filePath) ?? 0) + 1);
        if (event.scaffoldId) scaffolds.set(event.scaffoldId, (scaffolds.get(event.scaffoldId) ?? 0) + 1);
        for (const cap of event.capabilityIds ?? []) {
          capabilities.set(cap, (capabilities.get(cap) ?? 0) + 1);
        }
        if (typeof event.success === "boolean") {
          knownOutcomes += 1;
          if (event.success) successes += 1;
        }
      }
      const topFiles = topKeys(files);
      const topScaffolds = topKeys(scaffolds);
      const topCapabilities = topKeys(capabilities);
      const successRate = knownOutcomes > 0 ? successes / knownOutcomes : null;
      return {
        faultType,
        count: group.length,
        successRate,
        topFiles,
        topScaffolds,
        topCapabilities,
        recommendedPromotion: recommendPromotion({
          faultType,
          count: group.length,
          topCapabilities,
          topScaffolds,
        }),
        evidence: group.slice(0, 3).map((event) => event.message.slice(0, 120)),
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.faultType.localeCompare(b.faultType);
    });
}

function fmtPct(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

export function formatFaultPromotionReport(
  candidates: FaultPromotionCandidate[],
): string {
  if (candidates.length === 0) {
    return [
      "# Fault Promotion Candidates",
      "",
      "No local fault-log data found. Nothing to promote yet.",
      "",
    ].join("\n");
  }
  const lines = [
    "# Fault Promotion Candidates",
    "",
    "| faultType | count | successRate | top files | top scaffold | top capability | recommendedPromotion | evidence |",
    "|---|---:|---:|---|---|---|---|---|",
  ];
  for (const candidate of candidates) {
    lines.push(
      `| ${candidate.faultType} | ${candidate.count} | ${fmtPct(candidate.successRate)} | ${candidate.topFiles.join(", ") || "-"} | ${candidate.topScaffolds.join(", ") || "-"} | ${candidate.topCapabilities.join(", ") || "-"} | ${candidate.recommendedPromotion} | ${candidate.evidence.join(" / ") || "-"} |`,
    );
  }
  return lines.join("\n");
}
