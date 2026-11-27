"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CornerDownRight,
  Globe,
  HelpCircle,
  ListPlus,
  Loader2,
  Paperclip,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FOLLOW_UP_SUGGESTIONS,
  SECTION_LABELS,
  SITE_THEMES,
  type SectionId,
} from "../_lib/mock-data";
import type { ChatMessage, ComposerMode, Studio } from "../_lib/use-studio";
import { IconButton, Kbd, Segmented } from "./ui-bits";

const MODE_HINT: Record<ComposerMode, string> = {
  auto: "Auto: frågor besvaras, ändringar byggs",
  ask: "Fråga: Sajtagenten svarar, sajten ändras inte",
  build: "Bygg: varje meddelande blir en ny version",
};

export function ChatDock({
  studio,
  variant,
  onFocusSection,
  onStartCall,
}: {
  studio: Studio;
  variant: "side" | "sheet";
  onFocusSection: (id: SectionId) => void;
  onStartCall: () => void;
}) {
  const { state } = studio;
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.messages.length, state.pending?.stepIndex]);

  const messages = (
    <div
      ref={scrollRef}
      className="lab-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4 pb-6"
    >
      {state.messages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          studio={studio}
          isLast={index === state.messages.length - 1}
          onFocusSection={onFocusSection}
        />
      ))}
    </div>
  );

  if (variant === "sheet") {
    const latest = [...state.messages].reverse().find((m) => m.role !== "user");
    return (
      <motion.div
        layout
        className="lab-root absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[1.6rem] border-t border-white/10 bg-[#0b0f18]/95 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        style={{
          maxHeight: sheetOpen ? "78dvh" : undefined,
          height: sheetOpen ? "78dvh" : undefined,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 40 }}
      >
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          aria-expanded={sheetOpen}
          className="flex w-full flex-col items-center gap-1.5 px-4 pt-2 pb-1"
        >
          <span className="h-1 w-10 rounded-full bg-white/20" />
          <span className="flex w-full items-center justify-between gap-3 text-left text-[12px] text-[var(--lab-muted)]">
            <span className="truncate">
              {state.pending ? (
                <span className="lab-shimmer-text font-medium">
                  {state.pending.steps[state.pending.stepIndex]?.label}…
                </span>
              ) : latest?.role === "assistant" ? (
                latest.text
              ) : (
                "Konversation"
              )}
            </span>
            {sheetOpen ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronUp className="size-4 shrink-0" />
            )}
          </span>
        </button>
        {sheetOpen ? messages : null}
        <Composer studio={studio} compact />
      </motion.div>
    );
  }

  return (
    // Bredden animeras (inte en skalning), så förhandsvisningen bredvid
    // flyter ut mjukt utan att sträckas. Innehållet har fast bredd och klipps.
    <motion.aside
      initial={{ width: 0, marginRight: 0, opacity: 0 }}
      animate={{ width: 400, marginRight: 12, opacity: 1 }}
      exit={{ width: 0, marginRight: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 34, opacity: { duration: 0.25 } }}
      className="relative shrink-0 overflow-hidden rounded-[1.4rem] border border-white/[0.07] bg-[var(--lab-panel)] backdrop-blur-2xl"
      aria-label="Chatt"
    >
      <div className="flex h-full w-[398px] flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--lab-blue)] to-[var(--lab-teal)]">
              <Bot className="size-3.5 text-white" />
            </span>
            Sajtagenten
          </div>
          <button
            type="button"
            onClick={onStartCall}
            className="flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11.5px] font-medium text-[var(--lab-muted)] transition-colors hover:border-[var(--lab-teal)]/40 hover:text-white"
          >
            <Video className="size-3.5" /> Prata
          </button>
        </div>
        {messages}
        <Composer studio={studio} />
      </div>
    </motion.aside>
  );
}

export function MessageRow({
  message,
  studio,
  isLast,
  onFocusSection,
}: {
  message: ChatMessage;
  studio: Studio;
  isLast: boolean;
  onFocusSection: (id: SectionId) => void;
}) {
  if (message.role === "user") {
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: message.status === "dropped" ? 0.45 : 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      >
        {message.status ? (
          <span
            className={cn(
              "mr-1 mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
              message.status === "queued"
                ? "bg-[var(--lab-warm)]/15 text-[#ffc2ad]"
                : "bg-white/[0.06] text-[var(--lab-muted)]",
            )}
          >
            {message.status === "queued" ? (
              <Clock className="size-3" />
            ) : (
              <Ban className="size-3" />
            )}
            {message.status === "queued" ? "I kö, körs efter bygget" : "Skickades inte"}
          </span>
        ) : null}
        {message.target ? (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--lab-teal)]/15 px-2 py-0.5 text-[10.5px] font-medium text-[#9eeed6]">
            <Wand2 className="size-3" /> {SECTION_LABELS[message.target]}
          </span>
        ) : null}
        <p className={cn(message.status === "dropped" && "line-through decoration-white/30")}>
          {message.text}
        </p>
      </motion.div>
    );
  }
  if (message.role === "build") {
    return (
      <motion.div layout="position">
        <BuildCard studio={studio} versionId={message.versionId} cancelled={message.cancelled} />
      </motion.div>
    );
  }
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2.5"
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
        {message.versionId ? (
          <Sparkles className="size-3.5 text-[#c7d6ff]" />
        ) : (
          <HelpCircle className="size-3.5 text-[#c7d6ff]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-relaxed text-white/90">{message.text}</p>
        {message.changed.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.changed.slice(0, 6).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onFocusSection(id)}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[var(--lab-muted)] transition-colors hover:border-[var(--lab-blue)]/50 hover:text-white"
              >
                {SECTION_LABELS[id]}
              </button>
            ))}
          </div>
        ) : null}
        {isLast && !studio.state.pending ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {followUpSuggestions(studio).map((suggestion, index) => (
              <motion.button
                key={suggestion}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
                onClick={() => studio.submit(suggestion)}
                className="rounded-full border border-[var(--lab-blue)]/25 bg-[var(--lab-blue)]/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-[#c7d6ff] transition-colors hover:bg-[var(--lab-blue)]/20"
              >
                {suggestion}
              </motion.button>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Förslagen efter ett bygge, utan dem som redan är gjorda. */
export function followUpSuggestions(studio: Studio) {
  const version = studio.activeVersion;
  return FOLLOW_UP_SUGGESTIONS.filter((suggestion) => {
    if (!version) return true;
    if (suggestion === "Lägg till bokning") return !version.content.booking;
    if (suggestion === "Gör den mörkare") return version.theme !== "night";
    if (suggestion === "Grönare färger") return version.theme !== "forest";
    return true;
  });
}

export function BuildCard({
  studio,
  versionId,
  cancelled = false,
}: {
  studio: Studio;
  versionId: string;
  cancelled?: boolean;
}) {
  const { state } = studio;
  const pending = !cancelled && state.pending?.version.id === versionId ? state.pending : null;
  const version = cancelled
    ? null
    : (pending?.version ?? state.versions.find((v) => v.id === versionId) ?? null);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [pending]);

  if (!version) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12.5px] text-[var(--lab-muted)]">
        <span className="flex size-5 items-center justify-center rounded-full bg-white/[0.06]">
          <Ban className="size-3" />
        </span>
        Bygget avbröts
      </div>
    );
  }
  const steps = pending?.steps ?? [];
  const doneMs = state.lastBuildMs[versionId];

  if (!pending) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-[var(--lab-teal)]/15">
            <Check className="size-3 text-[var(--lab-teal)]" />
          </span>
          <span className="flex-1 text-[12.5px] text-[var(--lab-muted)]">
            <span className="font-medium text-white">v{version.number} byggd</span>
            {doneMs ? ` på ${(doneMs / 1000).toFixed(1).replace(".", ",")} s` : ""}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-[var(--lab-muted)] transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="px-3 pb-3 text-[12px] leading-relaxed text-[var(--lab-muted)]">
                Palett: {SITE_THEMES[version.theme].label}. Ändrat:{" "}
                {version.changed.map((id) => SECTION_LABELS[id]).join(", ")}.
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  const elapsed = Math.max(0, now - pending.startedAt);
  const total = steps.reduce((sum, step) => sum + step.ms, 0);
  const progress = Math.min(99, Math.round((elapsed / total) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="relative overflow-hidden rounded-2xl border border-[var(--lab-blue)]/25 bg-gradient-to-b from-[var(--lab-blue)]/[0.10] to-transparent p-3.5"
    >
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
        <motion.div
          className="h-px w-1/3 bg-gradient-to-r from-transparent via-[#9db8ff] to-transparent"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">
          {pending.first ? "Bygger din sajt" : `Bygger v${version.number}`}
        </p>
        <span className="font-mono text-[11px] text-[var(--lab-muted)] tabular-nums">
          {(elapsed / 1000).toFixed(1).replace(".", ",")} s
        </span>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--lab-blue)] via-[var(--lab-teal)] to-[var(--lab-warm)]"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ ease: "linear", duration: 0.1 }}
        />
      </div>
      <ol className="mt-3 space-y-2.5">
        {steps.map((step, index) => {
          const status =
            index < pending.stepIndex ? "done" : index === pending.stepIndex ? "active" : "todo";
          return (
            <li key={step.id} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
                  status === "done" && "bg-[var(--lab-teal)]/20 text-[var(--lab-teal)]",
                  status === "active" && "text-[#9db8ff]",
                  status === "todo" && "border border-white/15",
                )}
              >
                {status === "done" ? <Check className="size-2.5" strokeWidth={3} /> : null}
                {status === "active" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[12.5px] font-medium",
                    status === "active" && "lab-shimmer-text",
                    status === "todo" && "text-white/35",
                  )}
                >
                  {step.label}
                </p>
                <AnimatePresence initial={false}>
                  {status !== "todo" ? (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="overflow-hidden text-[11.5px] leading-snug text-[var(--lab-muted)]"
                    >
                      {step.detail(version)}
                      {step.id === "design" ? (
                        <span className="ml-1.5 inline-flex translate-y-0.5 gap-0.5">
                          {SITE_THEMES[version.theme].swatch.map((color) => (
                            <span
                              key={color}
                              className="size-2.5 rounded-full ring-1 ring-white/20"
                              style={{ background: color }}
                            />
                          ))}
                        </span>
                      ) : null}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}

export function Composer({
  studio,
  compact = false,
  layoutId = "lab-composer",
  showHint = !compact,
}: {
  studio: Studio;
  compact?: boolean;
  /** null stänger av den delade layoutanimationen (t.ex. i kuben). */
  layoutId?: string | null;
  showHint?: boolean;
}) {
  const { state, set, submit, activeVersion, latestVersion, selectVersion } = studio;
  const queued = state.queue.length;
  const editingOld = Boolean(
    activeVersion && latestVersion && activeVersion.id !== latestVersion.id && !state.pending,
  );
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const locked = Boolean(state.pending);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(160, Math.max(compact ? 24 : 44, el.scrollHeight))}px`;
  }, [text, compact]);

  const send = () => {
    if (!text.trim()) return;
    submit(text);
    setText("");
  };

  return (
    <div
      className={cn(
        "shrink-0",
        compact ? "px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "p-3",
      )}
    >
      <AnimatePresence initial={false}>
        {editingOld && activeVersion && latestVersion ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--lab-warm)]/25 bg-[var(--lab-warm)]/[0.08] px-3 py-1.5 text-[11.5px] text-[#ffc2ad]">
              <CornerDownRight className="size-3.5 shrink-0" />
              <span className="flex-1">Nästa ändring utgår från v{activeVersion.number}</span>
              <button
                type="button"
                onClick={() => selectVersion(latestVersion.id)}
                className="font-semibold text-white underline-offset-2 hover:underline"
              >
                Till v{latestVersion.number}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.div
        layoutId={layoutId ?? undefined}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
        className="lab-glow-border rounded-[1.25rem] bg-[#0b0f18]/90"
      >
        <label htmlFor={compact ? "lab-composer-sheet" : "lab-composer"} className="sr-only">
          Beskriv en ändring
        </label>
        <textarea
          id={compact ? "lab-composer-sheet" : "lab-composer"}
          ref={ref}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={
            locked
              ? "Skriv nästa ändring medan vi bygger…"
              : "Beskriv en ändring, eller fråga något…"
          }
          className="lab-scrollbar block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/35"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton
            icon={Paperclip}
            label="Bifoga"
            onClick={() => toast("Labbet: uppladdning är inte kopplad.")}
          />
          {compact ? null : (
            <IconButton
              icon={Globe}
              label="Läs en webbsida"
              onClick={() => toast("Labbet: läs en webbsida är inte kopplad.")}
            />
          )}
          <Segmented
            id={compact ? "mode-sheet" : "mode"}
            ariaLabel="Chattläge"
            size="sm"
            value={state.composerMode}
            onChange={(composerMode) => set({ composerMode })}
            options={[
              { value: "auto", label: "Auto", hint: MODE_HINT.auto },
              { value: "ask", label: "Fråga", hint: MODE_HINT.ask },
              { value: "build", label: "Bygg", hint: MODE_HINT.build },
            ]}
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim()}
            aria-label={locked ? "Lägg i kö" : "Skicka"}
            title={locked ? "Läggs i kö och körs när bygget är klart" : "Skicka (Enter)"}
            className={cn(
              "ml-auto flex size-8 items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none disabled:hover:translate-y-0",
              locked
                ? "bg-[var(--lab-warm)] shadow-[0_6px_20px_-6px_rgba(255,122,80,0.9)]"
                : "bg-[var(--lab-blue)] shadow-[0_6px_20px_-6px_rgba(61,123,255,0.9)]",
            )}
          >
            {locked ? <ListPlus className="size-4" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </motion.div>
      {showHint ? (
        <p className="mt-2 flex items-center justify-between px-1 text-[10.5px] text-white/30">
          <span>
            {locked
              ? queued > 0
                ? `${queued} ${queued === 1 ? "ändring" : "ändringar"} i kö`
                : "Skriv vidare, det du skickar läggs i kö"
              : MODE_HINT[state.composerMode]}
          </span>
          <span className="hidden items-center gap-1 xl:flex">
            <Kbd>E</Kbd> peka
          </span>
        </p>
      ) : null}
    </div>
  );
}
