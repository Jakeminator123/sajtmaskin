"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Mascot } from "@/components/mascot/Mascot";
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
  const companyName = typeof rawCompanyName === "string" ? rawCompanyName.trim() : "";
  if (!companyName) return null;
  const config = normalizeKostnadsfriOpenClawConfig(rawSurface);
  return { companyName, ...(config ?? {}) };
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
  const starterPrompts = config?.starterPrompts?.length
    ? config.starterPrompts
    : [
        `Hur skulle en digital receptionist för ${companyName} kunna låta?`,
        `Vilka frågor borde Sajtagenten kunna svara på för ${companyName}?`,
        `Hur kan OpenClaw hjälpa ${companyName} att få fler leads?`,
      ];

  return {
    panel: {
      badgeLabel: "OpenClaw",
      assistantLabel: companyName,
      idleStatus: "",
      emptyTitle: `Fråga mig om ${companyName}.`,
      emptyBody: "",
      inputPlaceholder: `Fråga om ${companyName}...`,
      starterPrompts,
    },
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

  return { panel: DEFAULT_OPENCLAW_CHAT_PANEL_CONTENT };
}

export function OpenClawChat() {
  const pathname = usePathname();
  const { isOpen, toggle, close, setScope } = useOpenClawStore();
  const [contextSurface, setContextSurface] = useState<KostnadsfriOpenClawSurfaceContext | null>(null);
  const [scopeKey, setScopeKey] = useState(pathname);
  const content = useMemo(() => getSurfaceContent(pathname, contextSurface), [pathname, contextSurface]);

  useEffect(() => {
    const syncContext = () => {
      setContextSurface(readKostnadsfriSurfaceContext());
      setScopeKey(readOpenClawScopeKey(pathname));
    };
    syncContext();
    window.addEventListener("sajtmaskin:context-updated", syncContext);
    return () => window.removeEventListener("sajtmaskin:context-updated", syncContext);
  }, [pathname]);

  useEffect(() => {
    setScope(scopeKey);
  }, [scopeKey, setScope]);

  return (
    <>
      {/* Centered popup overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10">
            <OpenClawChatPanel onClose={close} content={content.panel} />
          </div>
        </div>
      )}

      {/* FAB — mascot headshot bubble */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition-all duration-200",
          isOpen
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:-translate-y-0.5",
        )}
        aria-label={isOpen ? "Stäng chatt" : "Öppna chatt"}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Mascot slot="headshot" size={56} decorative className="h-14 w-14 object-cover" />
        )}
      </button>
    </>
  );
}
