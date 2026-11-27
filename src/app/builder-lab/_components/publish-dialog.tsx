"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, Globe, Loader2, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SiteVersion } from "../_lib/mock-data";

type Stage = "review" | "publishing" | "live";

const CHECKS = [
  { label: "Titel och beskrivning för Google", ok: true },
  { label: "Fungerar på mobil", ok: true },
  { label: "Läsbar kontrast", ok: true },
  { label: "Kontaktuppgifter syns", ok: true },
];

const PUBLISH_STEPS = [
  "Bygger produktionsversion",
  "Laddar upp till nätverket",
  "Kopplar adressen",
  "Säkrar med HTTPS",
];

export function PublishDialog({
  open,
  onOpenChange,
  version,
  slug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: SiteVersion | null;
  slug: string;
}) {
  const [stage, setStage] = useState<Stage>("review");
  const [step, setStep] = useState(0);
  const url = `${slug || "min-sajt"}.sajtmaskin.se`;

  // Bara medan dialogen är öppen: en stängd dialog ska inte fortsätta publicera
  // eller skjuta konfetti över arbetsytan. Varje öppning får nytt tillstånd
  // (nycklad i builder-lab.tsx).
  useEffect(() => {
    if (!open || stage !== "publishing") return;
    if (step >= PUBLISH_STEPS.length) {
      const timer = window.setTimeout(() => setStage("live"), 300);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), 750);
    return () => window.clearTimeout(timer);
  }, [open, stage, step]);

  useEffect(() => {
    if (!open || stage !== "live") return;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#3d7bff", "#2fc6a0", "#ff7a50", "#ffffff"];
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.55 },
        colors,
        disableForReducedMotion: true,
      });
      window.setTimeout(
        () =>
          confetti({
            particleCount: 60,
            spread: 110,
            origin: { y: 0.5 },
            colors,
            disableForReducedMotion: true,
          }),
        250,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, stage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lab-root overflow-hidden rounded-[1.6rem] border-white/10 bg-[#0b0f18]/95 p-0 text-white backdrop-blur-2xl sm:max-w-md">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(61,123,255,0.35),transparent)]" />
        <AnimatePresence mode="wait" initial={false}>
          {stage === "review" ? (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
                <Rocket className="size-5" />
              </span>
              <DialogTitle className="mt-4 text-xl font-semibold tracking-tight">
                Redo att gå live
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-[var(--lab-muted)]">
                Version {version?.number ?? 1} publiceras. Du kan alltid uppdatera eller backa
                senare.
              </DialogDescription>
              <ul className="mt-5 space-y-2">
                {CHECKS.map((check) => (
                  <li key={check.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className="flex size-5 items-center justify-center rounded-full bg-[var(--lab-teal)]/15">
                      <Check className="size-3 text-[var(--lab-teal)]" strokeWidth={3} />
                    </span>
                    {check.label}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <Globe className="size-4 shrink-0 text-[var(--lab-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px]">{url}</p>
                  <p className="text-[11px] text-[var(--lab-muted)]">
                    Gratis adress · egen domän kan kopplas efteråt
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  setStage("publishing");
                }}
                className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[14px] font-semibold text-[#0b0f18] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.7)] transition-transform hover:-translate-y-0.5"
              >
                <Rocket className="size-4" /> Publicera nu
              </button>
            </motion.div>
          ) : stage === "publishing" ? (
            <motion.div
              key="publishing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative p-6"
            >
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Publicerar…
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-[var(--lab-muted)]">
                Det tar bara en liten stund.
              </DialogDescription>
              <ol className="mt-6 space-y-3">
                {PUBLISH_STEPS.map((label, index) => (
                  <li key={label} className="flex items-center gap-3 text-[13.5px]">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full transition-colors",
                        index < step
                          ? "bg-[var(--lab-teal)]/15 text-[var(--lab-teal)]"
                          : "bg-white/[0.05] text-white/40",
                      )}
                    >
                      {index < step ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : index === step ? (
                        <Loader2 className="size-3.5 animate-spin text-white" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span
                      className={cn(
                        index > step && "text-white/40",
                        index === step && "lab-shimmer-text",
                      )}
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full bg-gradient-to-r from-[var(--lab-blue)] via-[var(--lab-teal)] to-[var(--lab-warm)]"
                  initial={false}
                  animate={{ width: `${(step / PUBLISH_STEPS.length) * 100}%` }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="live"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative p-6 text-center"
            >
              <motion.span
                initial={{ scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 14 }}
                className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--lab-teal)] text-[#06231b] shadow-[0_0_60px_-6px_rgba(47,198,160,0.9)]"
              >
                <Check className="size-7" strokeWidth={3} />
              </motion.span>
              <DialogTitle className="mt-4 text-2xl font-semibold tracking-tight">
                Din sajt är live!
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-[var(--lab-muted)]">
                Dela länken och börja ta emot besökare.
              </DialogDescription>
              <div className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 pl-4">
                <span className="min-w-0 flex-1 truncate text-left font-mono text-[13px]">
                  https://{url}
                </span>
                <button
                  type="button"
                  onClick={() => toast.success("Länk kopierad (labb)")}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-medium hover:bg-white/15"
                >
                  <Copy className="size-3.5" /> Kopiera
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toast("Labbet: sajten publiceras inte på riktigt.")}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-white text-[13px] font-semibold text-[#0b0f18]"
                >
                  <ExternalLink className="size-3.5" /> Öppna sajten
                </button>
                <button
                  type="button"
                  onClick={() => toast("Labbet: domänkoppling är inte kopplad.")}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/15 text-[13px] font-medium"
                >
                  <Globe className="size-3.5" /> Egen domän
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
