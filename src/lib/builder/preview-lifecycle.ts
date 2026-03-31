/** Discrete preview lifecycle for own-engine sandbox + iframe (builder UI). */
export type PreviewLifecycleState =
  | "idle"
  | "bootstrapping"
  | "live"
  | "recovering"
  | "failed";
