"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  reply: { id: string; text: string; summary: boolean } | null;
  draft: string;
  userTurn?: string;
  interrupted?: boolean;
  waitingForModel?: boolean;
};

export function AlinaStage({ reply, draft, userTurn, interrupted, waitingForModel }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const lastSent = useRef(reply?.id ?? "");
  const lastTurn = useRef(reply ? userTurn : undefined);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "alina:ready") setReady(true);
      if (event.data?.type === "alina:format") {
        setRatio(
          event.data.format === "portrait" ? 3 / 4 : event.data.format === "square" ? 1 : 16 / 9,
        );
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    if (ready && draft)
      frame.current?.contentWindow?.postMessage({ type: "alina:activity" }, location.origin);
  }, [draft, ready]);
  useEffect(() => {
    if (!ready || lastTurn.current === userTurn) return;
    const target = frame.current?.contentWindow;
    if (lastTurn.current) target?.postMessage({ type: "alina:cancel", turn: lastTurn.current }, location.origin);
    lastTurn.current = userTurn;
    if (userTurn) target?.postMessage({ type: "alina:question", turn: userTurn }, location.origin);
  }, [ready, userTurn]);
  useEffect(() => {
    if (ready && userTurn && (interrupted || waitingForModel))
      frame.current?.contentWindow?.postMessage({
        type: interrupted ? "alina:cancel" : "alina:wait", turn: userTurn,
      }, location.origin);
  }, [ready, userTurn, interrupted, waitingForModel]);
  useEffect(() => {
    if (!ready || !reply || lastSent.current === reply.id) return;
    frame.current?.contentWindow?.postMessage(
      { type: "alina:reply", text: reply.text, summary: reply.summary, turn: userTurn, readyAt: Date.now() },
      location.origin,
    );
    lastSent.current = reply.id;
  }, [ready, reply, userTurn]);
  return (
    <div className="shrink-0 bg-[#161b20] px-1">
      <iframe
        ref={frame}
        title="Alina i studion"
        src="/video/aida/presenter-v2/SCEN/index.html?embed=1"
        allow="autoplay"
        style={{ aspectRatio: ratio, width: `min(100%, ${40 * ratio}dvh)` }}
        className="mx-auto block border-0"
      />
    </div>
  );
}
