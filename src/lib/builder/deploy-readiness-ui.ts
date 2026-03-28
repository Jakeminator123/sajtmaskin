import type { ChatReadiness } from "@/lib/chat-readiness";

/** Badge / rubrik bredvid "Lansering" — en källa för hela byggaren. */
export function formatDeployReadinessStatusLabel(readiness: ChatReadiness): string {
  if (readiness.status === "blocked") {
    const n = readiness.blockers.length;
    return n === 1 ? "1 spärr" : `${n} spärrar`;
  }
  if (readiness.status === "warning") {
    const n = readiness.warnings.length;
    return `${n} varning${n === 1 ? "" : "ar"}`;
  }
  return "Redo att publicera";
}

export function deployReadinessBadgeClassName(readiness: ChatReadiness): string {
  if (readiness.status === "blocked") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (readiness.status === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}
