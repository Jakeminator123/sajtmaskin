"use client";

import { useEffect, useRef } from "react";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { readBuilderTurnSnapshot } from "@/lib/openclaw/builder-target";
import {
  buildArmedContinuationPrompt,
  decideArmedContinuation,
  observeBuilderTurn,
} from "@/lib/openclaw/debug/armed-continuation";
import type { OpenClawSendOptions } from "./useOpenClawChat";

/**
 * How often the builder turn is sampled. `window.__SITEMASKIN_CONTEXT` is a
 * plain object without change events on the builder, so polling is the only
 * read path — one cheap object read per second while a watch is pending, and
 * no timer at all when autonomy is idle.
 */
export const ARMED_CONTINUATION_POLL_MS = 1000;

type SendFn = (text: string, options?: OpenClawSendOptions) => void | Promise<void>;

/**
 * Closes the armed-autonomy loop (Mode A). `OpenClawArmedSendCard` fires one
 * auto-send and registers a watch; this hook follows that builder turn and,
 * when it terminates cleanly, wakes OpenClaw once with fresh context so the
 * mandate's next step can run. Every stop condition lives in the pure
 * `decideArmedContinuation` — this hook only owns the timer, the send and the
 * user-visible note when a run is cut short.
 */
export function useOpenClawArmedContinuation(send: SendFn): void {
  const hasWatch = useOpenClawStore((s) => s.armedContinuation !== null);
  const sendRef = useRef<SendFn>(send);
  const resumingRef = useRef(false);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!hasWatch) return;

    const tick = () => {
      const state = useOpenClawStore.getState();
      const watch = state.armedContinuation;
      if (!watch || resumingRef.current) return;

      const snapshot = readBuilderTurnSnapshot();
      const observed = observeBuilderTurn(watch, snapshot);
      if (observed !== watch) state.setArmedContinuation(observed);

      const decision = decideArmedContinuation({
        watch: observed,
        mandate: state.armedMandate,
        editEnabled: state.editEnabled,
        openClawStreaming: state.isStreaming,
        snapshot,
        now: Date.now(),
      });

      if (decision.kind === "abort") {
        state.setArmedContinuation(null);
        if (decision.notify) {
          state.addMessage({
            id: `oc-continuation-${Date.now()}`,
            role: "assistant",
            content: decision.reason,
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (decision.kind !== "resume") return;

      // Drop the watch before sending: the resumed turn registers its own watch
      // if it auto-sends again, and a failed send must not leave a stale one.
      resumingRef.current = true;
      state.setArmedContinuation(null);
      const prompt = buildArmedContinuationPrompt({
        remaining: state.armedMandate?.remaining ?? 1,
        versionStatus: decision.versionStatus,
      });
      void Promise.resolve(sendRef.current(prompt, { allowArming: false })).finally(() => {
        resumingRef.current = false;
      });
    };

    const timer = setInterval(tick, ARMED_CONTINUATION_POLL_MS);
    return () => clearInterval(timer);
  }, [hasWatch]);
}
