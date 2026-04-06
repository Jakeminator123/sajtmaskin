/** Discrete preview lifecycle for own-engine live preview + iframe (builder UI). */
export type PreviewLifecycleState =
  | "idle"
  | "bootstrapping"
  | "live"
  | "recovering"
  | "failed";
