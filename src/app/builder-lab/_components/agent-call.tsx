"use client";

import { SmokeRing } from "@paper-design/shaders-react";
import { AnimatePresence, motion, useReducedMotion, type DragControls } from "framer-motion";
import { Captions, GripHorizontal, Mic, MicOff, Minimize2, PhoneOff } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { EXAMPLE_PROMPTS, SITE_THEMES } from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import { followUpSuggestions } from "./chat-dock";

type Line = { key: string; text: string };

/** Vad Sajtagenten säger just nu, härlett ur byggets läge. */
export function agentLine(studio: Studio): Line {
  const { state, activeVersion } = studio;
  const pending = state.pending;
  if (pending) {
    const step = pending.steps[pending.stepIndex];
    const theme = SITE_THEMES[pending.version.theme].label.toLowerCase();
    const lines: Record<string, string> = {
      understand: pending.first
        ? "Jag läser din beskrivning och tänker på vem som ska besöka sajten."
        : "Jag läser vad du vill ändra.",
      plan: "Nu planerar jag sektionerna, en sida räcker gott.",
      design: `Jag går på ${theme}, det passar känslan du beskrev.`,
      build: pending.first
        ? "Nu bygger jag. Titta, sektionerna växer fram!"
        : "Jag gör ändringen nu.",
      verify: "Sista koll: mobil, kontrast och sökmotorer.",
    };
    return { key: `p-${pending.version.id}-${step.id}`, text: lines[step.id] ?? step.label };
  }
  if (activeVersion) {
    const last = [...state.messages].reverse().find((m) => m.role === "assistant");
    if (last?.role === "assistant" && last.versionId === activeVersion.id) {
      return {
        key: `done-${activeVersion.id}`,
        text: `Klart! ${last.text} Vill du att jag gör något mer?`,
      };
    }
    return {
      key: `idle-${activeVersion.id}`,
      text: `Du tittar på version ${activeVersion.number}. Säg vad du vill ändra.`,
    };
  }
  return { key: "hello", text: "Hej! Berätta vad du vill bygga, så sätter jag igång direkt." };
}

function nextUtterance(studio: Studio) {
  if (!studio.activeVersion) return EXAMPLE_PROMPTS[0].prompt;
  return followUpSuggestions(studio)[0] ?? "Ny rubrik";
}

function useCallClock() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Videosamtal med Sajtagenten som flytande bild-i-bild. Avataren är en
 * levande rök-ring (shader) som andas när agenten pratar; textningen kommer
 * ord för ord och följer byggets faser.
 */
export function AgentCall({
  studio,
  onClose,
  constraintsRef,
  dragControls,
}: {
  studio: Studio;
  onClose: () => void;
  constraintsRef: RefObject<HTMLDivElement | null>;
  dragControls: DragControls;
}) {
  const reduceMotion = useReducedMotion();
  const line = agentLine(studio);
  const [spokenKey, setSpokenKey] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const clock = useCallClock();
  const speaking = spokenKey !== line.key;
  const busy = Boolean(studio.state.pending);

  const stopListening = () => {
    if (!listening) return;
    setListening(false);
    const utterance = nextUtterance(studio);
    setHeard(utterance);
    studio.submit(utterance);
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.08}
      initial={{ opacity: 0, scale: 0.6, y: -20, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.6, y: -20, filter: "blur(12px)" }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      style={{ transformOrigin: "top right" }}
      className="absolute top-3 right-3 z-40"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {minimized ? (
          <motion.button
            key="bubble"
            type="button"
            layoutId="lab-agent-shell"
            onClick={() => setMinimized(false)}
            aria-label="Visa Sajtagenten"
            className="relative flex size-16 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#05070c] shadow-[0_20px_60px_-10px_rgba(61,123,255,0.7)]"
            onPointerDown={(event) => dragControls.start(event)}
          >
            <Orb speaking={speaking || busy} reduceMotion={Boolean(reduceMotion)} small />
          </motion.button>
        ) : (
          <motion.div
            key="window"
            layoutId="lab-agent-shell"
            className="lab-root w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#05070c]/95 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.04)]"
          >
            <div
              className="flex cursor-grab touch-none items-center justify-between px-3 pt-3 active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
            >
              <span className="flex items-center gap-2 text-[12px] font-semibold">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff5f57] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#ff5f57]" />
                </span>
                Sajtagenten
                <span className="font-mono text-[11px] font-normal text-[var(--lab-muted)] tabular-nums">
                  {clock}
                </span>
              </span>
              <span className="flex items-center gap-0.5 text-[var(--lab-muted)]">
                <GripHorizontal className="size-4 opacity-50" aria-hidden />
                <button
                  type="button"
                  onClick={() => setMinimized(true)}
                  aria-label="Minimera"
                  className="flex size-7 items-center justify-center rounded-full hover:bg-white/[0.08] hover:text-white"
                >
                  <Minimize2 className="size-3.5" />
                </button>
              </span>
            </div>

            <div className="relative mx-3 mt-2 aspect-square overflow-hidden rounded-[1.2rem] bg-[radial-gradient(circle_at_50%_40%,#0d1430,#05070c_70%)]">
              <Orb speaking={speaking || busy} reduceMotion={Boolean(reduceMotion)} />
              <AnimatePresence>
                {listening ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-x-0 top-3 flex justify-center"
                  >
                    <span className="flex items-center gap-2 rounded-full bg-[var(--lab-teal)] px-3 py-1 text-[11px] font-semibold text-[#06231b]">
                      <Waveform /> Lyssnar…
                    </span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {captions ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pt-10 pb-3.5">
                  <AnimatePresence mode="wait">
                    {heard && busy ? (
                      <motion.p
                        key={`heard-${heard}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-1 truncate text-[11px] text-[#9eeed6]"
                      >
                        Du: {heard}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={line.key}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                      variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: reduceMotion ? 0 : 0.07 } },
                      }}
                      onAnimationComplete={() => setSpokenKey(line.key)}
                      className="text-[13px] leading-snug font-medium text-white"
                    >
                      {line.text.split(" ").map((word, index) => (
                        <motion.span
                          key={`${word}-${index}`}
                          variants={{
                            hidden: { opacity: 0, filter: "blur(4px)", y: 3 },
                            show: { opacity: 1, filter: "blur(0px)", y: 0 },
                          }}
                          className="inline-block pr-[0.28em]"
                        >
                          {word}
                        </motion.span>
                      ))}
                    </motion.p>
                  </AnimatePresence>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 p-3">
              <CallButton
                label={muted ? "Slå på mikrofonen" : "Stäng av mikrofonen"}
                onClick={() => setMuted((value) => !value)}
                active={muted}
              >
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </CallButton>
              <button
                type="button"
                disabled={muted || busy}
                onPointerDown={() => setListening(true)}
                onPointerUp={stopListening}
                onPointerLeave={stopListening}
                onKeyDown={(event) => {
                  if ((event.key === " " || event.key === "Enter") && !listening)
                    setListening(true);
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") stopListening();
                }}
                className={cn(
                  "flex h-11 flex-1 touch-none items-center justify-center gap-2 rounded-full text-[12.5px] font-semibold transition-all select-none disabled:opacity-40",
                  listening
                    ? "scale-[0.97] bg-[var(--lab-teal)] text-[#06231b] shadow-[0_0_40px_-6px_rgba(47,198,160,0.9)]"
                    : "bg-white/[0.08] text-white hover:bg-white/[0.12]",
                )}
              >
                {busy
                  ? "Agenten bygger…"
                  : listening
                    ? "Släpp för att skicka"
                    : "Håll inne och prata"}
              </button>
              <CallButton
                label="Textning"
                onClick={() => setCaptions((value) => !value)}
                active={!captions}
              >
                <Captions className="size-4" />
              </CallButton>
              <CallButton label="Avsluta samtalet" onClick={onClose} danger>
                <PhoneOff className="size-4" />
              </CallButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Orb({
  speaking,
  reduceMotion,
  small = false,
}: {
  speaking: boolean;
  reduceMotion: boolean;
  small?: boolean;
}) {
  return (
    <motion.div
      className="absolute inset-0"
      animate={speaking && !reduceMotion ? { scale: [1, 1.06, 0.98, 1.04, 1] } : { scale: 1 }}
      transition={
        speaking ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }
      }
    >
      <SmokeRing
        className="size-full"
        colorBack="#00000000"
        colors={["#3d7bff", "#2fc6a0", "#ff7a50", "#8b7bff"]}
        noiseScale={small ? 2.4 : 2.8}
        noiseIterations={8}
        radius={small ? 0.32 : 0.28}
        thickness={speaking ? 0.7 : 0.55}
        innerShape={0.7}
        scale={small ? 1.4 : 1}
        speed={reduceMotion ? 0 : speaking ? 1.4 : 0.45}
      />
    </motion.div>
  );
}

function Waveform() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((bar) => (
        <motion.span
          key={bar}
          className="w-[2px] rounded-full bg-current"
          animate={{ height: ["30%", "100%", "45%", "85%", "30%"] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

function CallButton({
  label,
  onClick,
  active = false,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={danger ? undefined : active}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
        danger
          ? "bg-[#ff4d4f] text-white hover:bg-[#ff6365]"
          : active
            ? "bg-white text-[#0b0f18]"
            : "bg-white/[0.08] text-white hover:bg-white/[0.14]",
      )}
    >
      {children}
    </button>
  );
}
