/**
 * «Nästa bästa steg» efter ett bygge.
 *
 * När en builder-tur når ett terminalt läge väcks Sajtagenten en gång med en
 * kort intern tur (`[Byggresultat]`) och svarar med vad som ändrades och ett
 * förslag på nästa steg. Ersätter den gamla tips-popovern
 * (`/api/openclaw/tips` + `TipCard`): samma inställning, men svaret hamnar i
 * den gemensamma chatten där det hör hemma.
 *
 * Ren modul (inga timers, ingen DOM) så reglerna är testbara:
 *
 * - bara en digest per version och bara när versionen är den senaste,
 * - aldrig på en sidladdning: övergången måste ha setts i sessionen
 *   (föregående ögonblicksbild var en annan version eller strömmade),
 * - aldrig medan armerad continuation redan äger väckningen,
 * - aldrig medan agenten själv skriver.
 */

export interface PostBuildDigestSnapshot {
  chatId: string | null;
  activeVersionId: string | null;
  versionStatus: string | null;
  versionIsLatest: boolean;
  isStreaming: boolean;
}

export interface PostBuildDigestInput {
  prev: PostBuildDigestSnapshot | null;
  next: PostBuildDigestSnapshot;
  /** Inställningen «Sajtagenten kommenterar efter bygget». */
  enabled: boolean;
  agentStreaming: boolean;
  /** En armerad continuation-watch är aktiv — den väcker agenten själv. */
  continuationActive: boolean;
  /** Version som redan fått sin digest i den här sessionen. */
  lastDigestVersionId: string | null;
}

export type PostBuildDigestDecision =
  | { kind: "idle" }
  | { kind: "digest"; versionId: string; versionStatus: string };

const TERMINAL_STATUSES = new Set(["ready", "promoted", "degraded", "failed", "blocked"]);

export function decidePostBuildDigest(input: PostBuildDigestInput): PostBuildDigestDecision {
  const { prev, next } = input;
  if (!input.enabled) return { kind: "idle" };
  if (input.agentStreaming || input.continuationActive) return { kind: "idle" };
  if (!next.chatId || !next.activeVersionId || !next.versionStatus) return { kind: "idle" };
  if (next.isStreaming || !next.versionIsLatest) return { kind: "idle" };
  if (!TERMINAL_STATUSES.has(next.versionStatus)) return { kind: "idle" };
  if (input.lastDigestVersionId === next.activeVersionId) return { kind: "idle" };
  // Övergången måste ha setts: utan föregående bild (sidladdning) eller när
  // samma version redan stod terminal utan att strömma får inget hända.
  if (!prev) return { kind: "idle" };
  if (prev.chatId !== next.chatId) return { kind: "idle" };
  const observedTransition =
    prev.isStreaming ||
    prev.activeVersionId !== next.activeVersionId ||
    (prev.versionStatus !== null && !TERMINAL_STATUSES.has(prev.versionStatus));
  if (!observedTransition) return { kind: "idle" };
  return { kind: "digest", versionId: next.activeVersionId, versionStatus: next.versionStatus };
}

const STATUS_LABEL: Record<string, string> = {
  ready: "klar",
  promoted: "klar och godkänd",
  degraded: "klar men med anmärkningar",
  failed: "misslyckad",
  blocked: "stoppad av kontrollerna",
};

/** Intern tur. Får inte tolkas som armering eller stopp (locked by test). */
export function buildPostBuildDigestPrompt(input: { versionStatus: string }): string {
  const label = STATUS_LABEL[input.versionStatus] ?? input.versionStatus;
  return (
    `[Byggresultat] Builderturen är ${label} (status: ${input.versionStatus}).` +
    " Läs byggkontexten och svara kort på svenska, max tre meningar:" +
    " vad ändrades, och ETT konkret nästa steg som användaren kan be om." +
    " Starta inget bygge och fyll inget fält nu — bara ett kort besked."
  );
}
