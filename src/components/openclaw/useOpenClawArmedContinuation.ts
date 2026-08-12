"use client";

import { useEffect, useRef } from "react";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { readBuilderTurnSnapshot } from "@/lib/openclaw/builder-target";
import {
  buildArmedContinuationPrompt,
  decideArmedContinuation,
  markContinuationResumed,
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
        // Ending the run while leaving the mandate armed would let a later
        // action auto-send under authority the user believes is spent.
        // `setArmedMandate(null)` drops the watch with it.
        if (decision.disarm) state.setArmedMandate(null);
        else state.setArmedContinuation(null);
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

      // Keep the watch and stamp it instead of dropping it. `send` can return
      // without doing anything (an OpenClaw turn started in the same tick), and
      // a dropped watch would then strand the mandate with no loop to finish
      // it. A stamped watch stops resuming, and closes the run itself if no
      // next step arrives.
      resumingRef.current = true;
      state.setArmedContinuation(markContinuationResumed(observed, Date.now()));
      const prompt = buildArmedContinuationPrompt({
        remaining: state.armedMandate?.remaining ?? 1,
        versionStatus: decision.versionStatus,
      });
      void Promise.resolve(sendRef.current(prompt, { allowArming: false }))
        .catch(() => {
          // The wake-up threw, so no next step can arrive. End the run now
          // rather than letting the follow-through timeout do it silently.
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
          // Restart the follow-through clock from the end of the wake-up answer.
          // `send` resolves only when the whole stream is done, and the ticks in
          // between were skipped, so a long answer would otherwise be mistaken
          // for silence the moment it finished.
          const live = useOpenClawStore.getState();
          const pending = live.armedContinuation;
          if (pending?.resumedAt !== null && pending !== null) {
            live.setArmedContinuation(markContinuationResumed(pending, Date.now()));
          }
        });
    };

    const timer = setInterval(tick, ARMED_CONTINUATION_POLL_MS);
    return () => clearInterval(timer);
  }, [hasWatch]);
}
