import { devLogAppend } from "@/lib/logging/devLog";
import {
  type PromptToDoneKind,
  recordPromptToDone,
} from "./metrics";

/**
 * Wrap an SSE ReadableStream so that we can observe when the terminal
 * `event: done` SSE frame passes through (or when the stream ends
 * without one). The returned stream is byte-for-byte identical to the
 * source — this is telemetry-only and intentionally never mutates
 * chunks. On stream completion/error/cancel we record a single
 * `sajtmaskin_prompt_to_done_ms` observation.
 *
 * Failure / abort classification:
 *  - `done` frame seen → "done"
 *  - source stream errored or consumer cancelled → "failed"
 *    (unless `signal.aborted` is true, in which case "aborted")
 *  - source stream closed gracefully without a `done` frame → "failed"
 *    (the codegen pipeline always emits a `done` on the happy path,
 *    so a clean close without one means the pipeline short-circuited)
 *
 * All metric calls are wrapped in try/catch to guarantee that telemetry
 * never breaks codegen. Mirrors the pattern used in
 * `validate-and-fix.ts` / `verifier-pass.ts` / `finalize-version.ts`.
 */
export function wrapStreamForPromptToDoneMetric(
  source: ReadableStream<Uint8Array>,
  opts: {
    kind: PromptToDoneKind;
    promptStartedAt: number;
    signal?: AbortSignal;
    /**
     * P0 stream-abort recovery (2026-04-26). When provided, the wrapper
     * will emit a `site.aborted` devLog row whenever the stream closes
     * without seeing the terminal `event: done` SSE frame (transport
     * abort, server-restart, source pipe error). This is the read-side
     * complement to `stream-format.ts` which only emits abort for
     * provider-aborts mid-iteration. Without `chatId` we still record
     * the prompt-to-done metric but skip the devLog row (no run scope).
     */
    chatId?: string | null;
    versionId?: string | null;
  },
): ReadableStream<Uint8Array> {
  const { kind, promptStartedAt, signal, chatId, versionId } = opts;
  const decoder = new TextDecoder();
  // `event: done\n` is the SSE frame-header written by formatSSEEvent.
  // We scan decoded chunks for this literal. Frames always start with
  // `event: <name>\n`, so the literal appears verbatim on a clean
  // boundary. `tail` preserves up to ~32 bytes across chunks so the
  // pattern can still be found even if a chunk splits mid-header.
  const DONE_NEEDLE = "event: done\n";
  const TAIL_KEEP = DONE_NEEDLE.length;
  let tail = "";
  let sawDone = false;
  let recorded = false;

  const emitAbortLog = (reason: "client_disconnect" | "stream_closed_without_done" | "stream_error") => {
    if (sawDone || !chatId) return;
    try {
      devLogAppend("in-progress", {
        type: "site.aborted",
        chatId: chatId ?? null,
        versionId: versionId ?? null,
        reason,
        kind,
        elapsedMs: Date.now() - promptStartedAt,
      });
    } catch {
      // Logging is fail-safe — never break codegen on observability errors.
    }
  };

  // `cause` distinguishes the two terminal paths so we can map them to
  // the right `site.aborted.reason`:
  //   - "graceful": flush() ran — the source stream closed without
  //     erroring but never produced a `done` frame. Reason
  //     `stream_closed_without_done`.
  //   - "pipe-error": pipeTo() rejected — the source stream itself
  //     errored mid-flight (provider RST, network blip, AI SDK threw).
  //     Reason `stream_error`.
  // `signal.aborted` is checked independently and wins regardless of
  // cause: a request cancelled by the client always classifies as
  // `client_disconnect` even if the underlying pipe also errored.
  const record = (cause: "graceful" | "pipe-error") => {
    if (recorded) return;
    recorded = true;
    const outcome = sawDone
      ? "done"
      : signal?.aborted
        ? "aborted"
        : "failed";
    try {
      recordPromptToDone(Date.now() - promptStartedAt, outcome, kind);
    } catch {
      // Telemetry is fail-safe — never break codegen on observe errors.
    }
    if (outcome === "aborted") {
      emitAbortLog("client_disconnect");
    } else if (outcome === "failed") {
      emitAbortLog(cause === "pipe-error" ? "stream_error" : "stream_closed_without_done");
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!sawDone && chunk && chunk.byteLength > 0) {
        try {
          const text = decoder.decode(chunk, { stream: true });
          const combined = tail + text;
          if (combined.includes(DONE_NEEDLE)) {
            sawDone = true;
            tail = "";
          } else {
            tail = combined.length > TAIL_KEEP
              ? combined.slice(-TAIL_KEEP)
              : combined;
          }
        } catch {
          // Decoding should never fail on Uint8Array input, but never
          // let a tap error bubble into the source stream.
        }
      }
      controller.enqueue(chunk);
    },
    flush() {
      // Source stream closed gracefully. If we never saw `done`, the
      // codegen pipeline short-circuited — emit `stream_closed_without_done`.
      record("graceful");
    },
  });

  // Fire-and-forget pipe. Any source-side error surfaces here — emit
  // `stream_error` (or `client_disconnect` when signal.aborted wins).
  source.pipeTo(transform.writable).catch(() => {
    record("pipe-error");
  });

  return transform.readable;
}

/**
 * Convenience wrapper that applies {@link wrapStreamForPromptToDoneMetric}
 * to a Response's body and returns a new Response with the same status +
 * headers. No-op if `resp.body` is null (e.g. the caller returned a JSON
 * error response before the stream was produced).
 */
export function withPromptToDoneMetricResponse(
  resp: Response,
  opts: {
    kind: PromptToDoneKind;
    promptStartedAt: number;
    signal?: AbortSignal;
    chatId?: string | null;
    versionId?: string | null;
  },
): Response {
  if (!resp.body) return resp;
  const wrapped = wrapStreamForPromptToDoneMetric(resp.body, opts);
  return new Response(wrapped, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}
