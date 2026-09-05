/**
 * Classification of the preview host's `readinessError` text.
 *
 * `preview-host/src/runtime/process-lifecycle.js` `waitForReady` records one
 * of a handful of verdict messages when a boot never becomes ready. The host
 * message is the contract (it is also what lands in
 * `engine_version_error_logs`), so this module derives a stable *kind* from
 * it and splits the human summary from the appended Next.js log tail.
 *
 * Pure and dependency-free: used both by the preview-status route (server)
 * and by the builder UI (client) so both sides agree on what a verdict means.
 *
 * Prod chat 28af0778 (2026-09-04): a client-rendered app (`useEffect` →
 * localStorage gate, skeleton-only SSR) produced the `empty_body` verdict
 * three versions in a row. The builder showed it as a red "byggfel" banner
 * with 30 lines of `GET / 200 in 3xms` — which is not an error at all.
 */

export type ReadinessFailureKind =
  /** HTTP 200 HTML, but no visible text before scripts run (client-rendered / gated page). */
  | "empty_body"
  /** Next dev served its build-error overlay persistently — the code does not compile. */
  | "build_error_overlay"
  /** The dev server never accepted a TCP/HTTP connection. */
  | "http_not_accepted"
  /** The runtime exited cleanly several times before readiness. */
  | "clean_exit_loop"
  /** Install / spawn / postcondition failed before the dev server came up. */
  | "boot_failed"
  /** Readiness deadline hit without a more specific verdict. */
  | "deadline"
  | "unknown";

const LOG_TAIL_MARKER = /\n\s*Last Next\.js output(?: before exit)?(?: \(tail\))?:\s*\n?/i;

export function classifyReadinessFailure(
  message: string | null | undefined,
): ReadinessFailureKind {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return "unknown";
  if (/served HTML with an empty body|body text still empty/i.test(text)) return "empty_body";
  if (/build error overlay|build-error overlay/i.test(text)) return "build_error_overlay";
  if (/never accepted HTTP/i.test(text)) return "http_not_accepted";
  if (/exited cleanly \d+ times/i.test(text)) return "clean_exit_loop";
  if (/boot failed|npm install|install failed|postcondition/i.test(text)) return "boot_failed";
  if (/did not become ready within/i.test(text)) return "deadline";
  return "unknown";
}

/**
 * `true` when the verdict does NOT prove the site is broken. The probe is a
 * JS-less fetch, so a page that renders client-side (or behind a local demo
 * login) can never satisfy it even though it works in the browser. The UI
 * must not present this as a build failure.
 */
export function isUnverifiedReadinessFailure(kind: ReadinessFailureKind): boolean {
  return kind === "empty_body";
}

/**
 * Split the host message into the one-line human summary and the raw log
 * tail the host appended (`Last Next.js output: …`). The tail is diagnostic
 * material for logs and a collapsed "teknisk detalj" panel — never the
 * primary banner text.
 */
export function splitReadinessFailureDetail(
  message: string | null | undefined,
): { summary: string; logTail: string | null } {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return { summary: "", logTail: null };
  const match = LOG_TAIL_MARKER.exec(text);
  if (!match || match.index === undefined) {
    return { summary: text, logTail: null };
  }
  const summary = text.slice(0, match.index).trim();
  const logTail = text.slice(match.index + match[0].length).trim();
  return { summary: summary || text, logTail: logTail || null };
}

export type ReadinessFailurePresentation = {
  kind: ReadinessFailureKind;
  /** `info` = calm notice (site probably fine); `error` = the code really does not run. */
  severity: "info" | "error";
  title: string;
  /** Plain-language explanation for the end user. No log lines, no stack traces. */
  message: string;
  /** Raw host text (summary + tail) for an optional collapsed details panel. */
  detail: string | null;
};

/**
 * Turn a host readiness verdict into what the builder should say to the user.
 * The end user is a site owner, not a Next.js developer: titles say what
 * happened and what to do, and the raw host text is only offered as detail.
 */
export function presentReadinessFailure(
  message: string | null | undefined,
): ReadinessFailurePresentation {
  const kind = classifyReadinessFailure(message);
  const { summary, logTail } = splitReadinessFailureDetail(message);
  const detail = [summary, logTail].filter(Boolean).join("\n") || null;

  switch (kind) {
    case "empty_body":
      return {
        kind,
        severity: "info",
        title: "Förhandsvisningen kunde inte kontrolleras automatiskt",
        message:
          "Sidan svarar, men visar inget innehåll förrän den körts i webbläsaren " +
          "(vanligt när startsidan ligger bakom en lokal inloggning eller renderas " +
          "helt på klientsidan). Förhandsvisningen laddas ändå nedan — titta att den ser rätt ut.",
        detail,
      };
    case "build_error_overlay":
      return {
        kind,
        severity: "error",
        title: "Koden kompilerar inte",
        message:
          "Next.js visar ett byggfel för den här versionen. En omstart hjälper inte — " +
          "be om en rättning i chatten eller kör reparation." +
          (summary ? ` Fel: ${trimSummary(summary)}` : ""),
        detail,
      };
    case "http_not_accepted":
      return {
        kind,
        severity: "error",
        title: "Förhandsvisningen svarade inte",
        message:
          "Utvecklingsservern startade aldrig. Prova att starta om förhandsvisningen; " +
          "händer det igen behöver koden rättas.",
        detail,
      };
    case "clean_exit_loop":
    case "boot_failed":
      return {
        kind,
        severity: "error",
        title: "Förhandsvisningen kunde inte starta",
        message:
          "Sajten kraschade eller kunde inte installeras när den skulle startas. " +
          "Be om en rättning i chatten eller kör reparation.",
        detail,
      };
    case "deadline":
      return {
        kind,
        severity: "error",
        title: "Förhandsvisningen blev inte klar i tid",
        message: "Sajten svarade inte inom tidsgränsen. Prova att starta om förhandsvisningen.",
        detail,
      };
    default:
      return {
        kind,
        severity: "error",
        title: "Förhandsvisningen stoppade",
        message:
          "Live-förhandsvisningen kunde inte verifieras. Prova att starta om den, eller be om en rättning i chatten.",
        detail,
      };
  }
}

function trimSummary(summary: string): string {
  const cleaned = summary
    .replace(/^Runtime is serving a Next\.js build error overlay \(not ready\):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}
