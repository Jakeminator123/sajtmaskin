"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AppWindow,
  ArrowUp,
  Coffee,
  Command as CommandIcon,
  Globe,
  Hammer,
  LayoutTemplate,
  Paperclip,
  Scissors,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { EXAMPLE_PROMPTS, SITE_THEMES, type ThemeKey } from "../_lib/mock-data";
import type { Studio } from "../_lib/use-studio";
import { IconButton, Kbd, LogoMark, Segmented, ThemeDots } from "./ui-bits";

const EXAMPLE_ICONS = { coffee: Coffee, scissors: Scissors, hammer: Hammer } as const;

const TYPEWRITER_LINES = [
  "En hemsida för mitt kafé i Göteborg, varm och mysig…",
  "En stilren sajt för min frisörsalong med onlinebokning…",
  "En sida för mitt snickeri med tjänster och offertförfrågan…",
];

function useTypewriter(lines: string[], enabled: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let line = 0;
    let char = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const current = lines[line];
      if (!deleting) {
        char += 1;
        setText(current.slice(0, char));
        if (char === current.length) {
          deleting = true;
          timer = window.setTimeout(tick, 2200);
          return;
        }
        timer = window.setTimeout(tick, 34);
      } else {
        char -= 2;
        setText(current.slice(0, Math.max(0, char)));
        if (char <= 0) {
          deleting = false;
          line = (line + 1) % lines.length;
          timer = window.setTimeout(tick, 350);
          return;
        }
        timer = window.setTimeout(tick, 14);
      }
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [lines, enabled]);
  return enabled ? text : "";
}

export function LaunchStage({
  studio,
  onOpenPalette,
}: {
  studio: Studio;
  onOpenPalette: () => void;
}) {
  const { state, set, submit } = studio;
  const reduceMotion = useReducedMotion();
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useTypewriter(
    TYPEWRITER_LINES,
    !reduceMotion && !focused && prompt.length === 0,
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(220, Math.max(76, el.scrollHeight))}px`;
  }, [prompt]);

  const send = () => {
    if (prompt.trim().length < 4) {
      textareaRef.current?.focus();
      return;
    }
    submit(prompt);
  };

  return (
    <motion.div
      key="launch"
      className="relative flex min-h-dvh flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <MeshGradient
          className="absolute inset-0 size-full"
          colors={["#060912", "#13306e", "#0d5e57", "#a3401f", "#2a1f5c"]}
          distortion={0.85}
          swirl={0.6}
          speed={reduceMotion ? 0 : 0.22}
          grainOverlay={0.12}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_45%,rgba(7,9,14,0.35)_0%,rgba(7,9,14,0.92)_70%,#07090e_100%)]" />
        <div className="lab-grid absolute inset-0" />
        <div className="lab-noise absolute inset-0" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">Sajtmaskin</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tracking-wider text-[var(--lab-muted)] uppercase">
            Studio · labb
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pr-1.5 pl-3 text-xs text-[var(--lab-muted)] backdrop-blur transition-colors hover:text-white"
        >
          <CommandIcon className="size-3.5" />
          <span className="hidden sm:inline">Kommandon</span>
          <Kbd>⌘K</Kbd>
        </button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11.5px] text-[var(--lab-muted)] backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--lab-teal)] opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[var(--lab-teal)]" />
            </span>
            Från idé till publicerad sajt på några minuter
          </span>
          <h1 className="mt-5 text-[2.4rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-6xl">
            Vad ska vi <span className="lab-gradient-text">bygga</span> idag?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--lab-muted)] sm:text-base">
            Beskriv din idé med egna ord. Du ser sajten ritas, byggas och granskas live, och kan
            peka på vad som helst för att ändra det.
          </p>
        </motion.div>

        <motion.div
          layoutId="lab-composer"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="lab-glow-border mt-9 rounded-[1.6rem] bg-[#0b0f18]/80 shadow-[0_40px_120px_-30px_rgba(61,123,255,0.45)] backdrop-blur-2xl"
        >
          <label htmlFor="lab-launch-prompt" className="sr-only">
            Beskriv din sajt
          </label>
          <textarea
            id="lab-launch-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={placeholder || "Beskriv din sajt…"}
            className="lab-scrollbar block w-full resize-none bg-transparent px-5 pt-5 pb-2 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/35"
          />
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1 pb-3">
            <IconButton
              icon={Paperclip}
              label="Bifoga bild eller fil"
              onClick={() => toast("Labbet: uppladdning är inte kopplad.")}
            />
            <IconButton
              icon={Globe}
              label="Utgå från en befintlig webbsida"
              onClick={() => toast("Labbet: läs en webbsida är inte kopplad.")}
            />
            <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
            <PalettePicker
              value={state.preferredTheme}
              onChange={(theme) => set({ preferredTheme: theme })}
            />
            <Segmented
              id="launch-type"
              ariaLabel="Hemsida eller app"
              size="sm"
              value={state.siteType}
              onChange={(siteType) => set({ siteType })}
              options={[
                { value: "auto", label: "Auto", icon: Sparkles },
                { value: "site", label: "Hemsida", icon: LayoutTemplate },
                { value: "app", label: "App", icon: AppWindow },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[11px] text-white/30 sm:inline">
                <Kbd>⏎</Kbd> bygg · <Kbd>⇧⏎</Kbd> ny rad
              </span>
              <button
                type="button"
                onClick={send}
                disabled={prompt.trim().length < 4}
                className="group inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#3d7bff] to-[#5b8cff] pr-2 pl-4 text-sm font-semibold text-white shadow-[0_8px_30px_-6px_rgba(61,123,255,0.8)] transition-all hover:shadow-[0_8px_40px_-4px_rgba(61,123,255,1)] disabled:from-white/10 disabled:to-white/10 disabled:text-white/40 disabled:shadow-none"
              >
                Bygg
                <span className="flex size-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:-translate-y-0.5">
                  <ArrowUp className="size-4" />
                </span>
              </button>
            </div>
          </div>
        </motion.div>

        <motion.ul
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
          }}
          className="mt-6 grid gap-2.5 sm:grid-cols-3"
        >
          {EXAMPLE_PROMPTS.map((example) => {
            const Icon = EXAMPLE_ICONS[example.icon];
            return (
              <motion.li
                key={example.title}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPrompt(example.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.06]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/80 transition-colors group-hover:text-white">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{example.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-[var(--lab-muted)]">
                      {example.prompt}
                    </span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      </main>
    </motion.div>
  );
}

function PalettePicker({
  value,
  onChange,
}: {
  value: ThemeKey | "auto";
  onChange: (value: ThemeKey | "auto") => void;
}) {
  const [open, setOpen] = useState(false);
  const label = value === "auto" ? "AI väljer färger" : SITE_THEMES[value].label;
  const options: (ThemeKey | "auto")[] = ["auto", "amber", "forest", "slate", "night"];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] pr-3 pl-2 text-[12px] font-medium text-[var(--lab-muted)] transition-colors hover:text-white"
        >
          <ThemeDots theme={value} />
          <span className="max-w-[9rem] truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 rounded-2xl border-white/10 bg-[#0e121b]/95 p-1.5 text-white backdrop-blur-xl"
      >
        <p className="px-2.5 pt-1.5 pb-2 text-[11px] text-[var(--lab-muted)]">
          Färgerna gäller sajten du bygger, inte arbetsytan.
        </p>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              onChange(option);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.06]",
              option === value && "bg-white/[0.08]",
            )}
          >
            <ThemeDots theme={option} />
            {option === "auto" ? "AI väljer utifrån beskrivningen" : SITE_THEMES[option].label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
