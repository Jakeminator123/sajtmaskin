/**
 * Lane contracts for all fixer surfaces.
 *
 * These contracts describe where a fixer lane runs, what it receives, and
 * what it is allowed to mutate. `FixEntry.lane` should always map to one of
 * these contracts so telemetry can be filtered by lane.
 */

export type FixLane =
  | "mechanical"
  | "static_gate"
  | "llm_repair"
  | "stream_suspense"
  | "post_merge"
  | "server_repair";

export interface FixLaneContract {
  trigger: string;
  input: string;
  output: string;
  mutates: string;
}

export const FIX_LANE_CONTRACTS: Record<FixLane, FixLaneContract> = {
  mechanical: {
    trigger: "Deterministisk autofix-pass i runAutoFix().",
    input: "Kandidatens CodeProject-innehall per fil.",
    output: "Samma project med mekaniska omskrivningar + warnings.",
    mutates: "Enskilda filer i kandidatinnehall (ingen server-state).",
  },
  static_gate: {
    trigger: "Validatorfas (syntax/jsx/dep/preflight checks).",
    input: "Kandidatinnehall efter mekanisk lane.",
    output: "Diagnostik/issue-shapes som gate-signaler.",
    mutates: "Ingen kod; endast signaler och issue-listor.",
  },
  llm_repair: {
    trigger: "runLlmFixer efter blockerande fel i syntax/verifier-lane.",
    input: "Kandidatinnehall + fel-sammanfattning.",
    output: "LLM-reparerat kandidatinnehall (ev. partial/noop).",
    mutates: "Kandidatinnehall via explicit fixer-pass.",
  },
  stream_suspense: {
    trigger: "createDefaultRules() i stream-line processor.",
    input: "Inkommande stream-rader (ofullstandigt projekt).",
    output: "Transformerade rader innan parse/finalize.",
    mutates: "Endast line-buffer i stream-context; inte persisted filer.",
  },
  post_merge: {
    trigger: "Cross-file post-merge/finalize preflight-pass.",
    input: "Sammanfogade CodeFile[] efter merge/scaffold-build.",
    output: "Reparerade filer + fixlista for merge-fas.",
    mutates: "Merged filset efter stream/finalize.",
  },
  server_repair: {
    trigger: "Server verify/repair-loop efter finalize.",
    input: "Persistad version + verifier/build-fel.",
    output: "Reparerad serverversion eller early-stop.",
    mutates: "Persistad version i server-repair-lane.",
  },
};

const FIXER_DEFAULT_LANE: Record<string, FixLane> = {
  "llm-syntax-fixer": "llm_repair",
  "llm-verifier-fixer": "llm_repair",
  "llm-server-repair": "server_repair",
  "verifier-pass": "static_gate",
  "syntax-validator": "static_gate",
  "jsx-checker": "static_gate",
  "dep-completer": "static_gate",
  "dep-version-validator": "static_gate",
  "type-only-module-default-import-fixer": "post_merge",
};

export function resolveFixLane(params: {
  fixer: string;
  lane?: FixLane;
  fallbackLane: FixLane;
}): FixLane {
  return params.lane ?? FIXER_DEFAULT_LANE[params.fixer] ?? params.fallbackLane;
}
