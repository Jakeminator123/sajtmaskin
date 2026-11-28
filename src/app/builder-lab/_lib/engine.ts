/**
 * Sömmen mellan det nya builder-UI:t och motorn bakom det.
 *
 * Labbet kör på en påhittad motor (`useStudio`). Den riktiga buildern ska
 * kunna kopplas in genom att en adapter läser `BuilderViewModel`
 * (`src/app/builder/useBuilderPageController.ts`) och ger samma form. Varje
 * fält nedan anger var värdet finns i dag. Mockens retur kontrolleras mot
 * kontraktet vid typecheck (`satisfies StudioEngine` i `use-studio.ts`).
 *
 * UI-läge (enhet, kodvy, peka & ändra, jämför, layoutläge, kubsida) hör inte
 * hit: det ägs av det nya UI:t oavsett motor.
 */
import type { SectionId } from "./mock-data";
import type { ChatMessage } from "./use-studio";

/** En byggd version, utan labbets påhittade sajtinnehåll. */
export type EngineVersion = {
  id: string;
  /** `versionNumber` i `vm.effectiveVersionsList`. */
  number: number;
  /** Versionen ändringen utgick från (null för den första). */
  parentId: string | null;
  /** Kort sammanfattning; i dag `verificationSummary`/meddelandets text. */
  summary: string;
  /** Ändrade sektioner om motorn vet det; tomt annars. */
  changed: SectionId[];
  createdAt: number;
};

/** Ett pågående bygge, så som stegkortet och statusfältet visar det. */
export type EngineBuild = {
  versionNumber: number;
  first: boolean;
  /** Labbet: fasta steg. Riktigt: `getActiveAgentLogLabel` i `chat/tooling/agent-log.tsx`. */
  stepLabels: string[];
  stepIndex: number;
  startedAt: number;
};

export interface StudioEngine {
  /** `vm.appProjectName`. */
  projectName: string;
  /** `vm.messages` (AI SDK-meddelanden) mappade till labbets enklare rader. */
  messages: readonly ChatMessage[];
  /** `vm.effectiveVersionsList`. */
  versions: readonly EngineVersion[];
  /** `vm.activeVersionId`. */
  activeVersionId: string | null;
  /** `vm.latestVersionId`. */
  latestVersionId: string | null;
  /** `vm.isAnyStreaming` + aktiv agentfas; null när inget byggs. */
  build: EngineBuild | null;
  /**
   * Antal köade ändringar. Den riktiga motorn har ingen kö (komposern säger
   * «Ändringen kan skickas när det är klart»), så kön ligger i adaptern.
   */
  queued: number;
  /** Första prompten: `vm.requestCreateChat`; därefter `vm.sendMessage`. */
  submit: (prompt: string, target?: SectionId | null) => void;
  /** `vm.cancelActiveGeneration` (skalet släpper även agentens mandat). */
  cancel: () => void;
  /** `vm.handleVersionSelect`. */
  selectVersion: (id: string) => void;
  /** `vm.resetToNewChat`. */
  reset: () => void;
}
