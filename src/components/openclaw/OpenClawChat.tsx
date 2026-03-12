"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { OpenClawChatPanel } from "./OpenClawChatPanel";

export function OpenClawChat() {
  const pathname = usePathname();
  const { isOpen, toggle, close } = useOpenClawStore();
  const [showTeaser, setShowTeaser] = useState(true);
  const isHomePage = pathname === "/";
  const showHomeTeaser = isHomePage && !isOpen && showTeaser;

  useEffect(() => {
    if (isOpen) {
      setShowTeaser(false);
    }
  }, [isOpen]);

  const handleOpen = () => {
    setShowTeaser(false);
    toggle();
  };

  return (
    <div className="fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3">
      {showHomeTeaser ? (
        <div className="w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/90 text-slate-50 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.26),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.22),transparent_38%)] px-4 py-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  OpenClaw live
                </div>
                <p className="text-sm font-semibold text-white">
                  Ge din sajt en digital receptionist
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Sajtagenten kan guida besokare, svara pa vanliga fragor och visa hur
                  hemsidan kan kannas mer levande direkt pa sajten.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTeaser(false)}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-300 transition-colors hover:text-white"
                aria-label="Dolj OpenClaw-intro"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-slate-200/90">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                FAQ
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                Lead capture
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                SMB tone
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpen}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.01]"
            >
              <MessageCircle className="h-4 w-4" />
              Prova Sajtagenten
            </button>
          </div>
        </div>
      ) : null}

      {/* Chat panel */}
      <div
        className={cn(
          "origin-bottom-right transition-all duration-200 ease-out",
          isOpen
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <OpenClawChatPanel onClose={close} />
      </div>

      {/* FAB toggle */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "group relative flex items-center gap-3 overflow-hidden rounded-full border px-4 py-3 shadow-lg transition-all duration-200",
          isOpen
            ? "border-border bg-muted text-muted-foreground hover:bg-muted/90"
            : "border-cyan-400/30 bg-slate-950 text-slate-50 shadow-cyan-950/40 hover:-translate-y-0.5",
        )}
        aria-label={isOpen ? "Stang chattrutan" : "Oppna chattrutan"}
      >
        {isOpen ? null : (
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.24),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_38%)]" />
        )}
        <MessageCircle className="h-5 w-5" />
        <span className="relative flex flex-col items-start leading-none">
          <span className="text-sm font-semibold">
            {isOpen ? "Stang" : "Sajtagenten"}
          </span>
          <span
            className={cn(
              "text-[11px]",
              isOpen ? "text-muted-foreground" : "text-cyan-200/90",
            )}
          >
            {isOpen ? "OpenClaw aktiv" : "AI-hjalp pa sajten"}
          </span>
        </span>
        {isOpen ? null : (
          <span className="relative ml-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.85)]" />
        )}
      </button>
    </div>
  );
}
