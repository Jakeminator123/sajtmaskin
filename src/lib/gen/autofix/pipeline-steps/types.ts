import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";
import type { FixEntry, FixEntryDraft } from "../types";

/** @deprecated Use `FixEntry` from `src/lib/gen/autofix/types` for new code. */
export type AutoFixEntry = Omit<FixEntryDraft, "category" | "lane">;

export interface AutoFixResult {
  fixedContent: string;
  fixes: FixEntry[];
  warnings: string[];
  dependencies: Record<string, string>;
}

export interface AutoFixContext {
  chatId?: string;
  model?: string;
  /**
   * Lifecycle stage of the build. Drives the F2 SDK guard
   * (`tier3-sdk-guard-fixer`): tier-3 backend SDK imports are stripped
   * unless `previewPolicy === "fidelity3"`. Absent/undefined is treated
   * as F2 — preview-blocking SDK leakage is the bigger risk than an
   * occasional false-positive strip in test harnesses.
   */
  previewPolicy?: BuildSpecPreviewPolicy;
  /**
   * Canonical capability ids for deterministic dependency-injection.
   * Example: `visual-3d` -> `three` + `@react-three/fiber` + `@react-three/drei`.
   */
  requestedCapabilities?: string[];
  /**
   * Scaffold id picked by orchestrate. Combined with `variantId` it lets
   * `font-import-fixer` materialize the chosen variant's `fontPairings[0]`
   * into baseline `app/layout.tsx` files instead of relying on the LLM
   * to swap `Inter`. Absent => no-op (safe default for eval/repair).
   */
  scaffoldId?: string | null;
  /**
   * Scaffold-variant id picked by orchestrate (or carried over from a
   * locked snapshot on follow-ups). Used together with `scaffoldId` to
   * resolve the variant's first font pair.
   */
  variantId?: string | null;
}
