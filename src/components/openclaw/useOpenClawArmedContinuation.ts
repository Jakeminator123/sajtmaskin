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
        if (decision.notify) {
          // A notified abort means the run was cut short (failed build, chat
          // switch, timeout). Telling the user autonomy stopped while leaving
          // the mandate armed would let a later action auto-send anyway, so
          // disarm — `setArmedMandate(null)` drops the watch with it.
          state.setArmedMandate(null);
          state.addMessage({
            id: `oc-continuation-${Date.now()}`,
            role: "assistant",
            content: decision.reason,
            timestamp: Date.now(),
          });
        } else {
          state.setArmedContinuation(null);
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
      void Promise.resolve(sendRef.current(prompt, { allowArming: false }))
        .catch(() => {
          // The wake-up never reached OpenClaw. The watch is already gone, so
          // leaving the mandate armed would strand it: no loop to continue it,
          // but still enough authority for a later action to auto-send.
          const live = useOpenClawStore.getState();
          live.setArmedMandate(null);
          live.addMessage({
            id: `oc-continuation-${Date.now()}`,
            role: "assistant",
            content: "Autonomin stoppades: jag kunde inte läsa resultatet av bygget.",
            timestamp: Date.now(),
          });
        })
        .finally(() => {
          resumingRef.current = false;
        });
    };

    const timer = setInterval(tick, ARMED_CONTINUATION_POLL_MS);
    return () => clearInterval(timer);
  }, [hasWatch]);
}
