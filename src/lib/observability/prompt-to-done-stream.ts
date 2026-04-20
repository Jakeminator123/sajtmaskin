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
  },
): ReadableStream<Uint8Array> {
  const { kind, promptStartedAt, signal } = opts;
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

  const record = (fallback: "failed" | "aborted") => {
    if (recorded) return;
    recorded = true;
    const outcome = sawDone
      ? "done"
      : signal?.aborted
        ? "aborted"
        : fallback;
    try {
      recordPromptToDone(Date.now() - promptStartedAt, outcome, kind);
    } catch {
      // Telemetry is fail-safe — never break codegen on observe errors.
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
      // Called when the source stream closes gracefully. If we never
      // saw `done`, treat it as "failed" (codegen short-circuited).
      record("failed");
    },
  });

  // Fire-and-forget pipe. Any source-side error surfaces here and we
  // record with "failed" (or "aborted" if the request was cancelled).
  source.pipeTo(transform.writable).catch(() => {
    record("failed");
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
