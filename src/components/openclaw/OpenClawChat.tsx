"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { companyNameFromSlug } from "@/lib/kostnadsfri/company-name";
import {
  normalizeKostnadsfriOpenClawConfig,
  type KostnadsfriOpenClawSurfaceContext,
} from "@/lib/kostnadsfri/openclaw-config";
import { cn } from "@/lib/utils";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import {
  DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT,
  OpenClawChatPanel,
  type OpenClawChatPanelContent,
} from "./OpenClawChatPanel";

interface OpenClawSurfaceContent {
  panel: OpenClawChatPanelContent;
  teaserTitle: string;
  teaserBody: string;
  teaserTags: readonly string[];
  teaserCta: string;
  fabTitle: string;
  fabSubtitle: string;
  showTeaser: boolean;
}

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

function safeDecodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function readKostnadsfriSurfaceContext(): KostnadsfriOpenClawSurfaceContext | null {
  if (typeof window === "undefined") return null;

  const context = window.__SITEMASKIN_CONTEXT;
  if (!context || context.page !== "kostnadsfri") return null;

  const rawSurface = context.openclawSurface;
  if (!rawSurface || typeof rawSurface !== "object") return null;

  const rawCompanyName = (rawSurface as Record<string, unknown>).companyName;
  const companyName =
    typeof rawCompanyName === "string"
      ? rawCompanyName.trim()
      : "";

  if (!companyName) return null;

  const config = normalizeKostnadsfriOpenClawConfig(rawSurface);
  return {
    companyName,
    ...(config ?? {}),
  };
}

function readOpenClawScopeKey(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  const context = window.__SITEMASKIN_CONTEXT;
  const page = typeof context?.page === "string" ? context.page.trim() : "";
  const chatId = typeof context?.chatId === "string" ? context.chatId.trim() : "";
  return [pathname, page, chatId].filter(Boolean).join("::") || pathname;
}

function getKostnadsfriSurfaceContent(
  companyName: string,
  config?: KostnadsfriOpenClawSurfaceContext | null,
): OpenClawSurfaceContent {
  const roleLabel = config?.roleLabel || "en digital receptionist";
  const introTitle = config?.introTitle || `Hej! Jag kan bli ${companyName}s Sajtagent.`;
  const introBody =
    config?.introBody ||
    `Jag kan skissa pa hur en OpenClaw-agent for ${companyName} kan ta emot fragor, guida besokare och driva fler forfragningar direkt pa sajten.`;
  const starterPrompts = config?.starterPrompts?.length
    ? config.starterPrompts
    : [
        `Hur skulle en digital receptionist for ${companyName} kunna lata?`,
        `Vilka fragor borde Sajtagenten kunna svara pa for ${companyName}?`,
        `Hur kan OpenClaw hjalpa ${companyName} att fa fler leads?`,
      ];

  return {
    panel: {
      badgeLabel: "OpenClaw forhandsvisning",
      assistantLabel: companyName,
      idleStatus: roleLabel,
      emptyTitle: introTitle,
      emptyBody: introBody,
      inputPlaceholder: `Fraga om agenten for ${companyName}...`,
      starterPrompts,
    },
    teaserTitle: `Visa ${companyName} med ${roleLabel}`,
    teaserBody: introBody,
    teaserTags: ["Foretagston", "FAQ", "Lead capture"],
    teaserCta: `Prova Sajtagenten for ${companyName}`,
    fabTitle: "Sajtagenten",
    fabSubtitle: `For ${companyName}`,
    showTeaser: true,
  };
}

function getSurfaceContent(
  pathname: string,
  contextSurface: KostnadsfriOpenClawSurfaceContext | null,
): OpenClawSurfaceContent {
  const kostnadsfriMatch = pathname.match(/^\/kostnadsfri\/([^/]+)/);
  if (kostnadsfriMatch) {
    const slug = safeDecodePathSegment(kostnadsfriMatch[1]);
    const companyName = contextSurface?.companyName || companyNameFromSlug(slug);
    return getKostnadsfriSurfaceContent(companyName, contextSurface);
  }

  return {
    panel: DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT,
    teaserTitle: "Ge din sajt en digital receptionist",
    teaserBody:
      "Sajtagenten kan guida besokare, svara pa vanliga fragor och visa hur hemsidan kan kannas mer levande direkt pa sajten.",
    teaserTags: ["FAQ", "Lead capture", "SMB tone"],
    teaserCta: "Prova Sajtagenten",
    fabTitle: "Sajtagenten",
    fabSubtitle: "AI-hjalp pa sajten",
    showTeaser: pathname === "/",
  };
}

export function OpenClawChat() {
  const pathname = usePathname();
  const { isOpen, toggle, close, setScope } = useOpenClawStore();
  const [showTeaser, setShowTeaser] = useState(true);
  const [contextSurface, setContextSurface] = useState<KostnadsfriOpenClawSurfaceContext | null>(
    null,
  );
  const [scopeKey, setScopeKey] = useState(pathname);
  const content = useMemo(
    () => getSurfaceContent(pathname, contextSurface),
    [pathname, contextSurface],
  );
  const showRouteTeaser = content.showTeaser && !isOpen && showTeaser;

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      setShowTeaser(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShowTeaser(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const syncContext = () => {
      setContextSurface(readKostnadsfriSurfaceContext());
      setScopeKey(readOpenClawScopeKey(pathname));
    };

    syncContext();
    window.addEventListener("sajtmaskin:context-updated", syncContext);
    return () => {
      window.removeEventListener("sajtmaskin:context-updated", syncContext);
    };
  }, [pathname]);

  useEffect(() => {
    setScope(scopeKey);
  }, [scopeKey, setScope]);

  const handleOpen = () => {
    setShowTeaser(false);
    toggle();
  };

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end">
      {showRouteTeaser ? (
        <div className="pointer-events-auto w-full max-w-88 self-end overflow-hidden rounded-[1.75rem] border border-cyan-400/20 bg-slate-950/90 text-slate-50 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.26),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.22),transparent_38%)] px-4 py-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  {content.panel.badgeLabel}
                </div>
                <p className="text-sm font-semibold text-white">
                  {content.teaserTitle}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {content.teaserBody}
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
              {content.teaserTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
                >
                  {tag}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={handleOpen}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition-transform hover:scale-[1.01]"
            >
              <MessageCircle className="h-4 w-4" />
              {content.teaserCta}
            </button>
          </div>
        </div>
      ) : null}

      {/* Chat panel */}
      <div
        className={cn(
          "self-end overflow-hidden origin-bottom-right transition-all duration-200 ease-out",
          isOpen
            ? "pointer-events-auto max-h-[min(500px,calc(100vh-7rem))] scale-100 opacity-100"
            : "max-h-0 scale-95 opacity-0",
        )}
      >
        <OpenClawChatPanel onClose={close} content={content.panel} />
      </div>

      {/* FAB toggle */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "pointer-events-auto group relative flex self-end items-center gap-3 overflow-hidden rounded-full border px-4 py-3 shadow-lg transition-all duration-200",
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
            {isOpen ? "Stang" : content.fabTitle}
          </span>
          <span
            className={cn(
              "text-[11px]",
              isOpen ? "text-muted-foreground" : "text-cyan-200/90",
            )}
          >
            {isOpen ? "OpenClaw aktiv" : content.fabSubtitle}
          </span>
        </span>
        {isOpen ? null : (
          <span className="relative ml-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.85)]" />
        )}
      </button>
    </div>
  );
}
