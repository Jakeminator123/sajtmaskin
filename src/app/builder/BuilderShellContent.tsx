"use client";

import {
  ChatInterface,
  type VisualPlacementDecision,
  type VisualPlacementRequest,
} from "@/components/builder/ChatInterface";
import { getLatestPendingReply as getLatestPendingReplyFromTooling } from "@/components/builder/BuilderMessageTooling";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { IntakeWizard, type IntakeWizardResult, type WizardScrapeData } from "@/components/builder/IntakeWizard";
import { resolveScaffoldHintFromLabels } from "@/lib/builder/scaffold-hint";
import { buildWizardBrief, buildWizardCreativePrompt } from "@/lib/builder/wizard-brief";
import { MessageList } from "@/components/builder/MessageList";
import { PlacementConfirmDialog } from "@/components/builder/PlacementConfirmDialog";
import { PreviewPanel } from "@/components/builder/preview-panel/PreviewPanel";
import type { GenerationPhase } from "@/components/builder/preview-panel/GenerationProgress";
import type { ComposerAiFallbackPayload } from "@/components/builder/preview-panel/preview-panel-types";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { ModelTraceOverlay } from "@/components/builder/ModelTraceOverlay";
import { BuilderDetailsDrawer } from "@/components/builder/BuilderDetailsDrawer";
import { BuilderDisclosurePill } from "@/components/builder/BuilderDisclosurePill";
import { LaunchReadinessCard } from "@/components/builder/LaunchReadinessCard";
import { ProjectEnvVarsPanel } from "@/components/builder/ProjectEnvVarsPanel";
import { DeployNameDialog } from "@/components/builder/DeployNameDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DomainSearchDialog } from "@/components/builder/DomainSearchDialog";
import { DomainManager } from "@/components/builder/DomainManager";
import { TipCard } from "@/components/builder/TipCard";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { useAuthStore } from "@/lib/auth/auth-store";
import { postPreviewDestroy } from "@/lib/builder/preview-session/api";
import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import { analyzeSections } from "@/lib/builder/sectionAnalyzer";
import {
  buildNeedsAnalysisPrompt,
  buildNextNeedsAnalysisMessage,
  buildScrapeCompleteMessage,
  buildScrapeFailedMessage,
  buildScrapingMessage,
  chipToSiteType,
  deriveNeedsAnalysisState,
  detectSiteTypeFromText,
  extractUrlFromMessages,
  getCurrentQuestionField,
  isNeedsAnalysisActive,
  QUESTION_SUGGESTIONS,
  searchTemplatesForPicker,
  SITE_TYPE_LABELS,
  type ScrapeResult,
  type SelectedTemplateInfo,
  type SiteTypeKey,
  type TemplatePickerItem,
  type UploadedMediaInfo,
} from "@/lib/builder/needs-analysis";
import { getTemplateCatalogItemById } from "@/lib/templates/template-catalog";
import {
  buildPromptSourceMessage,
  type PromptSourceMeta,
} from "@/lib/builder/prompt-builder";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import { saveProjectData } from "@/lib/project-client";
import { resolveEngineVersionDisplayStatus } from "@/lib/db/engine-version-lifecycle";
import {
  MODEL_TIER_OPTIONS,
  getPromptAssistModelLabel,
} from "@/lib/builder/defaults";
import type { ChatMessage } from "@/lib/builder/types";
import type { CreateChatOptions } from "./types";
import type { V0UserFileAttachment } from "@/components/media/file-upload-zone";
import {
  readAutofixLocalStorageOnly,
  writeAutofixLocalStorage,
} from "@/lib/hooks/chat/useAutoFix";
import { useBuilderHelpChat } from "@/lib/hooks/chat/useBuilderHelpChat";
import {
  CHAT_TOOL_EVENT,
  type ChatToolEventDetail,
  type ToolActionAvailability,
} from "@/lib/builder/chat-tools";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Eye, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BuilderLayout } from "./BuilderLayout";
import type { BuilderViewModel } from "./useBuilderPageController";

const CONTEXT_RECENT_MESSAGE_COUNT = 5;
const CONTEXT_MESSAGE_MAX_CHARS = 3_000;
const TIP_USER_MESSAGE_MAX_CHARS = 5_000;
const TIP_ASSISTANT_MESSAGE_MAX_CHARS = 9_000;
const TIP_CODE_MAX_CHARS = 22_000;
const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 30_000;

type TipApiResponse = {
  success?: boolean;
  tip?: string;
  error?: string;
  cost?: number;
};

type ContextMessage = {
  role: ChatMessage["role"];
  content: string;
};

function toContextMessage(message: ChatMessage, maxChars: number): ContextMessage {
  return {
    role: message.role,
    content:
      typeof message.content === "string" ? message.content.slice(0, maxChars) : "[structured]",
  };
}

function buildRecentContextMessages(messages: ChatMessage[]): ContextMessage[] {
  return messages
    .filter((m) => !m.isHelpMessage)
    .slice(-CONTEXT_RECENT_MESSAGE_COUNT)
    .map((message) => toContextMessage(message, CONTEXT_MESSAGE_MAX_CHARS));
}

function getLatestCompletedAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      !message.isStreaming &&
      !message.isHelpMessage &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function getLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "user" &&
      !message.isHelpMessage &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

function buildPlacementPromptMessage(
  request: VisualPlacementRequest,
  placement: PlacementSelectEventDetail,
  customization: string,
): { message: string; meta: PromptSourceMeta } {
  const built = buildPromptSourceMessage(request.source, {
    placementLabel: placement.placementLabel,
    anchorLabel: placement.anchorSection?.label ?? null,
    customization,
  });
  return {
    message: built.message,
    meta: built.meta,
  };
}

async function classifyIntent(message: string): Promise<"build" | "help"> {
  try {
    const res = await fetch("/api/ai/classify-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 500) }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return "build";
    const data = await res.json();
    return data?.intent === "help" ? "help" : "build";
  } catch {
    return "build";
  }
}

function buildSelectedTemplateInfos(ids: string[]): SelectedTemplateInfo[] {
  return ids
    .map((id) => getTemplateCatalogItemById(id))
    .filter(Boolean)
    .map((t) => ({ title: t!.title, category: t!.category, previewImageUrl: t!.previewImageUrl }));
}

const NEEDS_ANALYSIS_MESSAGES_KEY = "sajtmaskin:needs-analysis-messages";

function saveNeedsAnalysisMessages(messages: ChatMessage[]) {
  try {
    const userAndHelp = messages.filter(
      (m) => m.role === "user" || m.isHelpMessage,
    );
    if (userAndHelp.length === 0) return;
    sessionStorage.setItem(
      NEEDS_ANALYSIS_MESSAGES_KEY,
      JSON.stringify(userAndHelp.map((m) => ({ id: m.id, role: m.role, content: m.content, isHelpMessage: m.isHelpMessage }))),
    );
  } catch {}
}


function pick(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function pickArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const filtered = v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

export function BuilderShellContent(vm: BuilderViewModel) {
  
  const scrapeDataRef = useRef<ScrapeResult | null>(null);
  const companyBriefRef = useRef<Record<string, unknown> | null>(null);

  // Model tier and thinking are now left at their defaults (not forced to "fast")
  // so first generations get full quality including proper image adherence.

  const wrappedRequestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      saveNeedsAnalysisMessages(vm.messages);
      return vm.requestCreateChat(message, options);
    },
    [vm.messages, vm.requestCreateChat],
  );

  const uploadedMediaRef = useRef<UploadedMediaInfo[] | null>(null);

  const triggerStarterGeneration = useCallback(
    (msgs: ChatMessage[], options?: Record<string, unknown>, promptOverride?: string) => {
      pendingGenerationRef.current = { messages: msgs, options, promptOverride };
      setShowImageUpload(true);
    },
    [],
  );

  const executeStarterGeneration = useCallback(
    (attachments?: V0UserFileAttachment[]) => {
      const pending = pendingGenerationRef.current;
      if (!pending) return;
      pendingGenerationRef.current = null;
      const tmplInfos = buildSelectedTemplateInfos(vm.selectedTemplateIds);
      const mediaInfos = uploadedMediaRef.current;
      const currentMessages = vm.messages.length > (pending.messages?.length ?? 0)
        ? vm.messages
        : pending.messages;
      const prompt = pending.promptOverride
        ?? buildNeedsAnalysisPrompt(
          currentMessages,
          scrapeDataRef.current,
          tmplInfos.length > 0 ? tmplInfos : null,
          mediaInfos && mediaInfos.length > 0 ? mediaInfos : null,
          companyBriefRef.current,
        );
      void wrappedRequestCreateChat(prompt, {
        ...pending.options,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      });
    },
    [vm.selectedTemplateIds, vm.messages, wrappedRequestCreateChat],
  );

  const handleImageUploadConfirm = useCallback(
    (attachments: V0UserFileAttachment[]) => {
      setShowImageUpload(false);
      uploadedMediaRef.current = attachments.map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType ?? "image/jpeg",
        url: a.url,
        purpose: a.purpose,
      }));
      executeStarterGeneration(attachments);
    },
    [executeStarterGeneration],
  );

  const handleImageUploadSkip = useCallback(() => {
    setShowImageUpload(false);
    uploadedMediaRef.current = null;
    executeStarterGeneration();
  }, [executeStarterGeneration]);

  const handleIntakeWizardComplete = useCallback(
    (result: IntakeWizardResult) => {
      setShowIntakeWizard(false);

      // Leave scaffold selection to orchestrate.ts (auto mode). Locking to a
      // specific family here collapses creative variant picking — the enriched
      // wizard brief gives orchestrate.ts enough signal on its own.
      const siteTypeField = result.fieldMessages.find((fm) => fm.field === "siteType");
      if (siteTypeField) {
        const labels = siteTypeField.text.split(", ").map((s) => s.trim());
        const hint = resolveScaffoldHintFromLabels(labels);
        if (hint.suggestedFamily) {
          vm.setScaffoldMode("auto");
          vm.setScaffoldId(hint.suggestedFamily);
        }
      }

      // Wire wizard brand colors into designTheme so they reach buildDynamicContext as locked theme
      const wizardColors = result.answers.brandColors;
      if (wizardColors && wizardColors.length > 0) {
        vm.setDesignTheme("custom");
        vm.setCustomThemeColors({
          primary: wizardColors[0] || "#1a1f36",
          secondary: wizardColors[1] || wizardColors[0] || "#4a5568",
          accent: wizardColors[2] || wizardColors[0] || "#f97316",
        });
      }

      const userMessages: ChatMessage[] = result.fieldMessages.map((fm, i) => ({
        id: `wizard-${fm.field}-${Date.now()}-${i}`,
        role: "user" as const,
        content: fm.text,
      }));
      vm.setMessages((prev) => [...prev, ...userMessages]);

      const allMessages = [...vm.messages, ...userMessages];

      // Structured brief seeded from wizard answers — overrides auto-generated
      // Deep Brief fields so canonical ids win over LLM extraction.
      const wizardBrief = buildWizardBrief(result.answers);
      const starterOptions: Record<string, unknown> = {
        meta: { brief: wizardBrief },
      };

      // Short, creative one-liner instead of the full needs-analysis dump.
      // All facts live in `meta.brief`; this prompt just asks the model to
      // build something opinionated, matching the raw-prompt flow's freedom.
      const wizardPrompt = buildWizardCreativePrompt(result.answers, wizardBrief);

      if (result.mediaFiles?.length) {
        pendingGenerationRef.current = { messages: allMessages, options: starterOptions, promptOverride: wizardPrompt };

        const uploadAll = async () => {
          const uploaded: UploadedMediaInfo[] = [];
          for (const mediaEntry of result.mediaFiles!) {
            const { file, context, purpose } = mediaEntry;
            try {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("context", context);
              formData.append("purpose", purpose);
              const res = await fetch("/api/media/upload", { method: "POST", body: formData });
              const data = await res.json().catch(() => null as unknown);
              if (!res.ok) {
                const code = (data as { code?: string } | null)?.code;
                const serverMsg = (data as { error?: string } | null)?.error;
                const payload = data as
                  | { counts?: { images?: number; videos?: number }; limits?: { maxImages?: number; maxVideos?: number } }
                  | null;
                const isVideo = file.type?.startsWith("video/");
                const have = isVideo ? payload?.counts?.videos : payload?.counts?.images;
                const cap = isVideo ? payload?.limits?.maxVideos : payload?.limits?.maxImages;
                const reason =
                  code === "unsupported_mime"
                    ? `Filtypen stöds inte (${file.type || "okänd"})`
                    : code === "too_large"
                      ? "Filen är för stor (max 20 MB)"
                      : code === "limit_reached"
                        ? have != null && cap != null
                          ? `Din bildbank är full (${have}/${cap}). Rensa några filer först.`
                          : "Din bildbank är full. Rensa några filer först."
                        : serverMsg || `Uppladdning misslyckades (HTTP ${res.status})`;
                toast.error(`${file.name}: ${reason}`);
                continue;
              }
              const rawUrl = (data as { media?: { url?: string }; url?: string } | null)?.media?.url ?? (data as { url?: string } | null)?.url;
              const mediaUrl = rawUrl && !rawUrl.startsWith("http") ? `${window.location.origin}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}` : rawUrl;
              if (mediaUrl) {
                uploaded.push({
                  filename: file.name,
                  mimeType: file.type || "image/jpeg",
                  url: mediaUrl,
                  purpose,
                  context,
                });
                vm.setMessages((prev) => [
                  ...prev,
                  { id: `media-${Date.now()}-${file.name}`, role: "user" as const, content: `[Uppladdad bild: ${context}](${mediaUrl})` },
                ]);
              }
            } catch (uploadErr) {
              console.error("[wizard] Media upload failed:", file.name, uploadErr);
              toast.error(`${file.name}: nätverksfel vid uppladdning`);
            }
          }
          if (uploaded.length > 0) {
            uploadedMediaRef.current = uploaded;
            const attachments: V0UserFileAttachment[] = uploaded.map((u) => ({
              type: "user_file" as const,
              url: u.url,
              filename: u.filename,
              mimeType: u.mimeType,
              purpose: u.purpose,
            }));
            executeStarterGeneration(attachments);
          } else {
            executeStarterGeneration();
          }
        };
        void uploadAll();
      } else {
        triggerStarterGeneration(allMessages, starterOptions, wizardPrompt);
      }
    },
    [vm.messages, vm.setMessages, vm.setDesignTheme, vm.setCustomThemeColors, vm.setScaffoldMode, vm.setScaffoldId, triggerStarterGeneration, executeStarterGeneration],
  );

  const handleIntakeWizardScrape = useCallback(
    async (url: string, companyName?: string): Promise<WizardScrapeData | null> => {
      try {
        const res = await fetch("/api/builder/company-intel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, synthesize: true, ...(companyName ? { companyName } : {}) }),
        });
        const json = await res.json();
        if (!json.success || !json.data) return null;
        const intel = json.data.intel;
        const brief = json.data.brief as Record<string, unknown> | null;
        const wizardFields = json.data.wizardFields as Record<string, unknown> | null;
        if (brief) {
          companyBriefRef.current = brief;
        }
        const sc = intel?.scrapedContent;
        const reg = intel?.registryInfo;

        scrapeDataRef.current = {
          title: sc?.title ?? "",
          description: sc?.description ?? "",
          headings: sc?.headings ?? [],
          wordCount: sc?.wordCount ?? 0,
          hasImages: (sc?.images ?? 0) > 0,
          textSummary: sc?.text?.slice(0, 500) ?? "",
        };

        const socialUrls = (intel?.socialSnippets as Array<{ url?: string }> | undefined)
          ?.map((s) => s.url)
          .filter((u): u is string => Boolean(u)) ?? [];

        const wf = wizardFields ?? {};
        const confidence = (wf.confidence ?? {}) as Record<string, string>;
        const isConfident = (key: string) => confidence[key] === "high" || confidence[key] === "medium";

        const colorPalette = (brief?.visualDirection as { colorPalette?: Record<string, string> } | undefined)?.colorPalette;
        const briefColors = colorPalette
          ? Object.values(colorPalette).filter((c) => typeof c === "string" && c.startsWith("#"))
          : [];
        const wfColors = Array.isArray(wf.brandColors) ? wf.brandColors.filter((c: unknown): c is string => typeof c === "string" && (c as string).startsWith("#")) : [];

        const result: WizardScrapeData = {
          title: pick(wf.companyName, brief?.brandName, reg?.companyName, sc?.title),
          metaDescription: pick(wf.offer, brief?.oneSentencePitch, sc?.description),
          description: pick(wf.offer),
          aboutUs: pick(wf.aboutUs),
          companyStory: pick(wf.companyStory),
          vision: pick(wf.vision),
          contactPageText: pick(wf.contactPageText),
          orgNr: reg?.orgNr || undefined,
          address: pick(wf.address, reg?.address ? `${reg.address}${reg.city ? `, ${reg.city}` : ""}` : undefined),
          industries: reg?.industries ?? undefined,
          employees: reg?.employees ?? undefined,
          phone: pick(wf.phone, sc?.meta?.phone),
          email: pick(wf.email, sc?.meta?.email),
          socialLinks: socialUrls.length > 0 ? socialUrls : undefined,
          brandColors: wfColors.length > 0 ? wfColors : briefColors.length > 0 ? briefColors : undefined,
          openingHours: pick(wf.openingHours),
          tagline: pick(wf.tagline, brief?.tagline),
          tone: pick(wf.tone),
          designStyle: pick(wf.designStyle),
          logoUrl: sc?.meta?.["og:image"] || undefined,
          callToAction: pick(brief?.primaryCallToAction),
          services: pickArr(wf.services),
          uniqueSellingPoints: pickArr(wf.uniqueSellingPoints),
          testimonials: pickArr(wf.testimonials),
          teamMembers: Array.isArray(wf.teamMembers) && wf.teamMembers.length > 0
            ? (wf.teamMembers as Array<{ name: string; role?: string }>)
            : undefined,
          menuItems: isConfident("menuItems") && Array.isArray(wf.menuItems) && wf.menuItems.length > 0
            ? (wf.menuItems as Array<{ name: string; description?: string; price?: string }>)
            : undefined,
          products: isConfident("products") && Array.isArray(wf.products) && wf.products.length > 0
            ? (wf.products as Array<{ name: string; price?: string; description?: string; image?: string }>)
            : undefined,
          treatments: isConfident("treatments") && Array.isArray(wf.treatments) && wf.treatments.length > 0
            ? (wf.treatments as Array<{ name: string; price?: string; duration?: string }>)
            : undefined,
          projects: Array.isArray(wf.projects) && wf.projects.length > 0
            ? (wf.projects as Array<{ name: string; description?: string; url?: string }>)
            : undefined,
          cuisine: pick(Array.isArray(wf.cuisine) && wf.cuisine.length > 0 ? wf.cuisine[0] : undefined),
          acceptsReservations: typeof wf.acceptsReservations === "boolean" ? wf.acceptsReservations : undefined,
          delivery: typeof wf.delivery === "boolean" ? wf.delivery : undefined,
          bookingUrl: pick(wf.bookingUrl),
          paymentMethods: pickArr(wf.paymentMethods),
          shippingInfo: pick(wf.shippingInfo),
          priceRange: pick(wf.priceRange),
          topics: pickArr(wf.topics),
          categorySpecific: wf.categorySpecific && typeof wf.categorySpecific === "object"
            ? (wf.categorySpecific as Record<string, string | string[] | boolean>)
            : undefined,
        };

        return result;
      } catch {
        return null;
      }
    },
    [],
  );

  const displayMessages = vm.messages;

  const needsAnalysisState = useMemo(() => {
    if (vm.chatId) return null;
    return deriveNeedsAnalysisState(vm.messages);
  }, [vm.chatId, vm.messages]);

  const generationPhase = useMemo((): GenerationPhase => {
    const isPreBuild = vm.isPreparingPrompt || vm.isCreatingChat;
    const lastAssistant = [...displayMessages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.uiParts) {
      if (vm.isAnyStreaming || isPreBuild) return "brief";
      return null;
    }
    const progressParts = lastAssistant.uiParts.filter(
      (p: Record<string, unknown>) => typeof p.type === "string" && (p.type as string).startsWith("tool:engine-"),
    );
    if (progressParts.length === 0) {
      if (vm.isAnyStreaming || isPreBuild) return "brief";
      return null;
    }
    const last = progressParts[progressParts.length - 1] as Record<string, unknown>;
    const toolType = typeof last.type === "string" ? (last.type as string).replace("tool:engine-", "") : "";
    const phaseMap: Record<string, GenerationPhase> = {
      generation: "generation",
      autofix: "autofix",
      "build-error": "autofix",
      verifier: "verifier",
      validate_syntax: "validate_syntax",
      parse_merge_preflight: "parse_merge_preflight",
      preview: "preview",
    };
    return phaseMap[toolType] ?? "generation";
  }, [displayMessages, vm.isAnyStreaming, vm.isPreparingPrompt, vm.isCreatingChat]);

  const currentField = useMemo(() => {
    if (!needsAnalysisState || needsAnalysisState.ready) return null;
    return getCurrentQuestionField(vm.messages);
  }, [needsAnalysisState, vm.messages]);

  const POST_GEN_SUGGESTIONS = [
    "Lägg till en undersida",
    "Ändra färgschema",
    "Mer innehåll",
    "Byt bilder",
    "Starkare CTA",
  ];

  const hasLivePreview = Boolean(
    vm.chatId && vm.currentPreviewUrl && !vm.previewPending && vm.previewLifecycle === "live",
  );

  const currentAnswerSuggestions = useMemo(() => {
    if (currentField) {
      const brief = companyBriefRef.current;
      if (brief) {
        const briefMap: Partial<Record<string, string>> = {
          offer: (brief.description as string) || undefined,
          audience: (brief.targetAudience as string) || undefined,
          goal: (brief.goals as string) || undefined,
        };
        const prefilled = briefMap[currentField];
        if (prefilled) {
          const defaults = QUESTION_SUGGESTIONS[currentField] ?? [];
          return [prefilled, ...defaults.filter((s) => s !== prefilled)];
        }
      }
      return QUESTION_SUGGESTIONS[currentField] ?? undefined;
    }
    if (!vm.chatId) return undefined;
    const advisorMsg = vm.messages.find((m) => m.id.startsWith("advisor-") && m.uiParts?.length);
    if (advisorMsg) {
      const part = advisorMsg.uiParts?.find(
        (p) => p.kind === "advisor-follow-up" && (p.output as Record<string, unknown>)?.suggestedPrompts,
      );
      if (part) {
        const prompts = (part.output as Record<string, string[]>).suggestedPrompts;
        const labels = (part.output as Record<string, string[]>).options;
        return labels.map((label, i) => prompts[i] ?? label);
      }
    }
    if (hasLivePreview && !vm.isAnyStreaming) {
      return POST_GEN_SUGGESTIONS;
    }
    return undefined;
  }, [currentField, vm.chatId, vm.messages, hasLivePreview, vm.isAnyStreaming]);

  const { isHelpStreaming, sendHelpMessage } = useBuilderHelpChat();
  const isBusy = vm.isCreatingChat || vm.isAnyStreaming || vm.isTemplateLoading || vm.isPreparingPrompt || isHelpStreaming;
  const isPreviewLoading =
    vm.isCreatingChat ||
    vm.isPreparingPrompt ||
    vm.previewPending ||
    vm.previewLifecycle === "recovering" ||
    (!vm.currentPreviewUrl && vm.isAnyStreaming);
  const activeVersionSummary = useMemo(() => {
    return vm.activeVersionId
      ? vm.effectiveVersionsList.find(
          (version) => version.versionId === vm.activeVersionId || version.id === vm.activeVersionId,
        ) ?? null
      : null;
  }, [vm.activeVersionId, vm.effectiveVersionsList]);
  const activeVersionStatus = useMemo(() => {
    if (!activeVersionSummary) return null;
    return resolveEngineVersionDisplayStatus(
      {
        versionId: activeVersionSummary.versionId,
        id: activeVersionSummary.id,
        createdAt: activeVersionSummary.createdAt,
        versionNumber: activeVersionSummary.versionNumber,
        releaseState: activeVersionSummary.releaseState,
        verificationState: activeVersionSummary.verificationState,
      },
      vm.effectiveVersionsList.map((entry) => ({
        versionId: entry.versionId,
        id: entry.id,
        createdAt: entry.createdAt,
        versionNumber: entry.versionNumber,
        releaseState: entry.releaseState,
        verificationState: entry.verificationState,
      })),
    );
  }, [activeVersionSummary, vm.effectiveVersionsList]);
  const activeVersionIsLatest =
    !vm.activeVersionId || !vm.latestVersionId || vm.activeVersionId === vm.latestVersionId;
  const sendMessage = vm.sendMessage;

  const handleComposerAiFallback = useCallback(
    async (payload: ComposerAiFallbackPayload) => {
      if (!vm.chatId) return;
      const block = getPageBlockById(payload.blockId);
      if (!block) {
        toast.error("Okänt sajblock.");
        return;
      }
      const sections = payload.homePageContent ? analyzeSections(payload.homePageContent) : [];
      const built = buildPromptSourceMessage(
        {
          kind: "page-block",
          label: block.label,
          description: block.description,
          implementationPrompt: block.implementationPrompt,
          placement: payload.placement,
          detectedSections: sections,
        },
        {
          placementLabel: payload.placementLabel,
          anchorLabel: payload.anchorSection?.label ?? null,
        },
      );
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage, vm.chatId],
  );
  const isDeployActionBusy =
    vm.isCreatingChat || vm.isAnyStreaming || vm.isDeploying || vm.isTemplateLoading;
  const deployReadinessBlocker = vm.deployReadiness?.blockers[0] ?? null;
  const canDeploy = Boolean(
    vm.chatId &&
      vm.activeVersionId &&
      !isDeployActionBusy &&
      (vm.deployReadiness?.canDeploy ?? true),
  );
  const baseDeployDisabledReason = !vm.chatId
    ? "Skapa eller öppna en chat först."
    : !vm.activeVersionId
      ? "Välj eller generera en version först."
      : vm.isCreatingChat || vm.isTemplateLoading
        ? "Vänta tills chatten och versionen är redo."
        : vm.isAnyStreaming
          ? "Vänta tills den pågående generationen är klar."
          : vm.isDeploying
            ? "Publicering pågår redan."
            : deployReadinessBlocker?.detail || deployReadinessBlocker?.title || null;
  const deployDisabledReason =
    deployReadinessBlocker?.action === "env" && baseDeployDisabledReason
      ? `${baseDeployDisabledReason} Lägg till nycklarna under Projektets miljövariabler (Lansering överst i chatpanelen).`
      : baseDeployDisabledReason;
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [chatCollapsed, setChatCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("builder:chatCollapsed") === "true";
    }
    return false;
  });
  const toggleChatCollapsed = useCallback(() => {
    setChatCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("builder:chatCollapsed", String(next));
      return next;
    });
  }, []);
  const [enableAutofix, setEnableAutofix] = useState(true);
  const [isFigmaInputOpen, setIsFigmaInputOpen] = useState(false);
  const [tipPanelOpen, setTipPanelOpen] = useState(false);
  const [tipText, setTipText] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);
  const [tipCost, setTipCost] = useState<number | null>(null);
  const [isTipLoading, setIsTipLoading] = useState(false);
  const previousStreamingRef = useRef(vm.isAnyStreaming);
  const hasAutoSwitchedToPreview = useRef(false);
  useEffect(() => {
    if (vm.currentPreviewUrl && !hasAutoSwitchedToPreview.current) {
      hasAutoSwitchedToPreview.current = true;
      setMobileTab("preview");
    }
  }, [vm.currentPreviewUrl]);
  const lastAutoTipAssistantIdRef = useRef<string | null>(null);
  const latestTipRequestIdRef = useRef(0);
  const [pendingPlacementRequest, setPendingPlacementRequest] =
    useState<VisualPlacementRequest | null>(null);
  const [placementSelection, setPlacementSelection] =
    useState<PlacementSelectEventDetail | null>(null);
  const [placementConfirmOpen, setPlacementConfirmOpen] = useState(false);
  const [isPlacementSubmitting, setIsPlacementSubmitting] = useState(false);
  const placementResolverRef = useRef<((decision: VisualPlacementDecision) => void) | null>(null);
  const [templatePickerItems, setTemplatePickerItems] = useState<TemplatePickerItem[]>([]);
  const [isTemplatePickerLoading, setIsTemplatePickerLoading] = useState(false);
  const [showSiteTypePicker, setShowSiteTypePicker] = useState(false);
  const siteTypePickerShownRef = useRef(false);
  const [showMustHavePicker, setShowMustHavePicker] = useState(false);
  const mustHavePickerShownRef = useRef(false);
  const pendingSiteTypeRef = useRef<SiteTypeKey | null>(null);
  const templatePickerMessagesRef = useRef<ChatMessage[] | null>(null);
  const templatePickerTriggeredRef = useRef(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showIntakeWizard, setShowIntakeWizard] = useState(!vm.chatId);
  useEffect(() => {
    if (vm.chatId) setShowIntakeWizard(false);
  }, [vm.chatId]);
  const pendingGenerationRef = useRef<{
    messages: ChatMessage[];
    options?: Record<string, unknown>;
    /**
     * When set, used as the user-facing prompt instead of the templated
     * buildNeedsAnalysisPrompt output. Wizard-driven runs use this to send
     * a short creative one-liner while keeping all facts in meta.brief.
     */
    promptOverride?: string;
  } | null>(null);

  useEffect(() => {
    if (vm.chatId) return;
    if (siteTypePickerShownRef.current) return;
    if (vm.messages.length < 1) return;

    const state = deriveNeedsAnalysisState(vm.messages);
    if (state.answeredFields.includes("siteType")) {
      siteTypePickerShownRef.current = true;
      return;
    }

    siteTypePickerShownRef.current = true;

    // Remove the siteType chat question -- the popup replaces it
    const lastMsg = vm.messages[vm.messages.length - 1];
    const isSiteTypeQuestion =
      lastMsg?.uiParts?.some(
        (p) => p.type === "tool:awaiting-input" && (p as Record<string, unknown>).analysisField === "siteType",
      );
    if (isSiteTypeQuestion) {
      vm.setMessages(vm.messages.slice(0, -1));
    }

    setShowSiteTypePicker(true);
  }, [vm.chatId, vm.messages, vm.setMessages]);

  const handleSiteTypeSelect = useCallback(
    (selectedIds: string[], labels: string[]) => {
      setShowSiteTypePicker(false);
      const answerText = labels.join(", ");

      const userMsg: ChatMessage = {
        id: `needs-analysis-user-${Date.now()}`,
        role: "user",
        content: answerText,
      };
      const nextMessages = [...vm.messages, userMsg];

      const detectedType = chipToSiteType(answerText) || detectSiteTypeFromText(answerText) || (selectedIds[0] as SiteTypeKey) || "other";
      templatePickerTriggeredRef.current = true;
      pendingSiteTypeRef.current = detectedType;

      const nextState = deriveNeedsAnalysisState(nextMessages);
      if (!nextState.ready) {
        const nextQ = buildNextNeedsAnalysisMessage(nextMessages);
        vm.setMessages(nextQ ? [...nextMessages, nextQ] : nextMessages);
      } else {
        vm.setMessages(nextMessages);
        triggerStarterGeneration(nextMessages);
      }
    },
    [vm.messages, vm.setMessages, triggerStarterGeneration],
  );

  const handleSiteTypeClose = useCallback(() => {
    setShowSiteTypePicker(false);
    const nextQ = buildNextNeedsAnalysisMessage(vm.messages);
    if (nextQ) {
      vm.setMessages([...vm.messages, nextQ]);
    }
  }, [vm.messages, vm.setMessages]);

  useEffect(() => {
    if (vm.chatId) return;
    if (mustHavePickerShownRef.current) return;
    if (showSiteTypePicker || vm.showTemplatePicker) return;
    if (vm.messages.length < 2) return;

    const field = getCurrentQuestionField(vm.messages);
    if (field !== "mustHave") return;

    const state = deriveNeedsAnalysisState(vm.messages);
    if (state.answeredFields.includes("mustHave")) {
      mustHavePickerShownRef.current = true;
      return;
    }

    mustHavePickerShownRef.current = true;

    const lastMsg = vm.messages[vm.messages.length - 1];
    const isMustHaveQuestion =
      lastMsg?.uiParts?.some(
        (p) => p.type === "tool:awaiting-input" && (p as Record<string, unknown>).analysisField === "mustHave",
      );
    if (isMustHaveQuestion) {
      vm.setMessages(vm.messages.slice(0, -1));
    }

    setShowMustHavePicker(true);
  }, [vm.chatId, vm.messages, vm.setMessages, showSiteTypePicker, vm.showTemplatePicker]);

  const handleMustHaveSelect = useCallback(
    (labels: string[]) => {
      setShowMustHavePicker(false);
      const answerText = labels.join(", ");

      const userMsg: ChatMessage = {
        id: `needs-analysis-user-${Date.now()}`,
        role: "user",
        content: answerText,
      };
      const nextMessages = [...vm.messages, userMsg];
      const nextState = deriveNeedsAnalysisState(nextMessages);

      if (!nextState.ready) {
        const nextQ = buildNextNeedsAnalysisMessage(nextMessages);
        vm.setMessages(nextQ ? [...nextMessages, nextQ] : nextMessages);
      } else {
        vm.setMessages(nextMessages);
        triggerStarterGeneration(nextMessages);
      }
    },
    [vm.messages, vm.setMessages, vm.selectedTemplateIds, vm.requestCreateChat, triggerStarterGeneration],
  );

  const handleMustHaveClose = useCallback(() => {
    setShowMustHavePicker(false);
    const nextQ = buildNextNeedsAnalysisMessage(vm.messages);
    if (nextQ) {
      vm.setMessages([...vm.messages, nextQ]);
    }
  }, [vm.messages, vm.setMessages]);

  const mustHaveContext = useMemo((): { siteType?: string; companyDescription?: string; scrapeText?: string } => {
    const siteType = pendingSiteTypeRef.current
      ? (SITE_TYPE_LABELS[pendingSiteTypeRef.current] ?? pendingSiteTypeRef.current)
      : undefined;
    const scrape = scrapeDataRef.current;
    const brief = companyBriefRef.current;
    const userMessages = vm.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
      .slice(0, 1000);
    const companyDesc = (brief?.description as string) || userMessages || undefined;
    return {
      siteType,
      companyDescription: companyDesc,
      scrapeText: scrape?.textSummary || undefined,
    };
  }, [vm.messages]);

  // Detect site type from messages for downstream use (scaffold matching etc.)
  // but do NOT auto-show the template picker — it interrupts the flow.
  useEffect(() => {
    if (vm.chatId) return;
    if (templatePickerTriggeredRef.current) return;
    if (vm.messages.length < 2) return;

    const state = deriveNeedsAnalysisState(vm.messages);
    if (!state.answeredFields.includes("siteType")) return;

    templatePickerTriggeredRef.current = true;

    const userTexts = vm.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");
    const detectedType = chipToSiteType(userTexts) || detectSiteTypeFromText(userTexts) || "other";
    pendingSiteTypeRef.current = detectedType;
  }, [vm.chatId, vm.messages]);

  const handleApproveBuildPlan = useCallback(
    async (plan: Record<string, unknown>) => {
      const built = buildPromptSourceMessage({ kind: "approved-plan", rawPlan: plan });
      await sendMessage(built.message, { promptSourceMeta: built.meta });
    },
    [sendMessage],
  );

  const requestTip = useCallback(
    async (assistantMessage: ChatMessage | null) => {
      if (!assistantMessage) {
        setTipText(null);
        setTipCost(null);
        setTipError("Inget AI-svar att hämta tips från ännu.");
        setTipPanelOpen(true);
        return;
      }

      const tipRequestId = latestTipRequestIdRef.current + 1;
      latestTipRequestIdRef.current = tipRequestId;
      setIsTipLoading(true);
      setTipError(null);
      try {
        const latestUser = getLatestUserMessage(vm.messages);
        const res = await fetch("/api/openclaw/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              page: "builder",
              projectId: vm.appProjectId,
              chatId: vm.chatId,
              activeVersionId: vm.activeVersionId,
              demoUrl: vm.currentPreviewUrl,
              uiSurfaces: [
                "vänster chatpanel",
                "Lanseringskortet",
                "previewpanelen",
                "sidchipsen under Preview",
                "Kodvy",
                "Elementregister",
                "versionspanelen till höger",
                "Projektets miljövariabler",
                "Publicera-knappen",
                "den genererade sidan/koden",
              ],
              recentMessages: buildRecentContextMessages(vm.messages),
              latestUserMessage: latestUser?.content?.slice(0, TIP_USER_MESSAGE_MAX_CHARS) || "",
              latestAssistantMessage: assistantMessage.content.slice(
                0,
                TIP_ASSISTANT_MESSAGE_MAX_CHARS,
              ),
              currentCode: vm.currentPageCode?.slice(0, TIP_CODE_MAX_CHARS) || "",
            },
          }),
        });

        const data = (await res.json().catch(() => null)) as TipApiResponse | null;
        if (latestTipRequestIdRef.current !== tipRequestId) return;

        if (!res.ok || !data?.success || typeof data.tip !== "string") {
          const message = data?.error || "Kunde inte hämta tips just nu.";
          setTipText(null);
          setTipCost(null);
          setTipError(message);
          setTipPanelOpen(true);
          return;
        }

        const trimmedTip = data.tip.trim();
        if (!trimmedTip) {
          setTipText(null);
          setTipCost(null);
          setTipError("Kunde inte hämta tips just nu.");
          setTipPanelOpen(true);
          return;
        }

        setTipText(trimmedTip);
        setTipCost(typeof data.cost === "number" ? data.cost : 2);
        setTipError(null);
        setTipPanelOpen(true);
      } catch {
        if (latestTipRequestIdRef.current !== tipRequestId) return;
        setTipText(null);
        setTipCost(null);
        setTipError("Kunde inte hämta tips just nu.");
        setTipPanelOpen(true);
      } finally {
        if (latestTipRequestIdRef.current === tipRequestId) {
          setIsTipLoading(false);
        }
      }
    },
    [
      vm.activeVersionId,
      vm.appProjectId,
      vm.chatId,
      vm.currentPreviewUrl,
      vm.currentPageCode,
      vm.messages,
    ],
  );

  const handleRefreshTip = useCallback(() => {
    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    void requestTip(latestAssistant);
  }, [requestTip, vm.messages]);

  useEffect(() => {
    if (!vm.chatId) {
      latestTipRequestIdRef.current += 1;
      setTipPanelOpen(false);
      setTipText(null);
      setTipError(null);
      setTipCost(null);
      setIsTipLoading(false);
      lastAutoTipAssistantIdRef.current = null;
    }
  }, [vm.chatId]);

  useEffect(() => {
    if (!vm.tipsEnabled) {
      latestTipRequestIdRef.current += 1;
      setIsTipLoading(false);
      setTipPanelOpen(false);
    }
  }, [vm.tipsEnabled]);

  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    previousStreamingRef.current = vm.isAnyStreaming;

    if (!vm.tipsEnabled) return;
    if (!wasStreaming || vm.isAnyStreaming) return;

    const latestAssistant = getLatestCompletedAssistantMessage(vm.messages);
    if (!latestAssistant) return;
    if (lastAutoTipAssistantIdRef.current === latestAssistant.id) return;

    lastAutoTipAssistantIdRef.current = latestAssistant.id;
    void requestTip(latestAssistant);
  }, [requestTip, vm.isAnyStreaming, vm.messages, vm.tipsEnabled]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const seen = new Set<string>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const imgs =
            node.tagName === "IMG"
              ? [node as HTMLImageElement]
              : Array.from(node.querySelectorAll<HTMLImageElement>("img[src]"));

          for (const img of imgs) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
            try {
              const url = new URL(src, window.location.origin);
              if (url.origin === window.location.origin) continue;
              if (seen.has(url.href)) continue;
              seen.add(url.href);

              const closestLabel =
                img.alt ||
                img.closest("[data-label]")?.getAttribute("data-label") ||
                img.closest("[aria-label]")?.getAttribute("aria-label") ||
                img.parentElement?.textContent?.trim().slice(0, 60) ||
                "(unknown)";

              console.info(`[ExtImg] ${closestLabel}`, url.href);
            } catch { /* invalid URL */ }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const selectedModelLabel =
      MODEL_TIER_OPTIONS.find((option) => option.value === vm.selectedModelTier)?.label ??
      vm.selectedModelTier;

    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      projectId: vm.appProjectId,
      chatId: vm.chatId,
      buildMethod: vm.buildMethod,
      activeVersionId: vm.activeVersionId,
      demoUrl: vm.currentPreviewUrl,
      selectedModelTier: vm.selectedModelTier,
      selectedModelLabel,
      promptAssistModel: vm.promptAssistModel,
      promptAssistLabel: getPromptAssistModelLabel(vm.promptAssistModel),
      promptAssistDeep: vm.promptAssistDeep,
      scaffoldMode: vm.scaffoldMode,
      scaffoldId: vm.scaffoldId,
      recentMessages: buildRecentContextMessages(vm.messages),
      currentCode: vm.currentPageCode?.slice(0, OPENCLAW_CONTEXT_CODE_MAX_CHARS) || null,
      isStreaming: vm.isAnyStreaming,
    };
    return () => {
      delete window.__SITEMASKIN_CONTEXT;
    };
  }, [
    vm.appProjectId,
    vm.chatId,
    vm.buildMethod,
    vm.activeVersionId,
    vm.currentPreviewUrl,
    vm.selectedModelTier,
    vm.promptAssistModel,
    vm.promptAssistDeep,
    vm.scaffoldMode,
    vm.scaffoldId,
    vm.messages,
    vm.currentPageCode,
    vm.isAnyStreaming,
  ]);

  const resolvePlacementFlow = useCallback((decision: VisualPlacementDecision) => {
    setPendingPlacementRequest(null);
    setPlacementSelection(null);
    setPlacementConfirmOpen(false);
    const resolver = placementResolverRef.current;
    placementResolverRef.current = null;
    if (resolver) {
      resolver(decision);
    }
  }, []);

  useEffect(() => {
    return () => {
      const resolver = placementResolverRef.current;
      placementResolverRef.current = null;
      if (resolver) resolver("cancelled");
    };
  }, []);

  useEffect(() => {
    if (!pendingPlacementRequest) return;
    if (vm.chatId && vm.currentPreviewUrl) return;
    resolvePlacementFlow("cancelled");
  }, [pendingPlacementRequest, resolvePlacementFlow, vm.chatId, vm.currentPreviewUrl]);

  const handleRequestPlacement = useCallback(
    async (request: VisualPlacementRequest) => {
      if (!vm.chatId || !vm.currentPreviewUrl) return "fallback";

      const existingResolver = placementResolverRef.current;
      if (existingResolver) {
        placementResolverRef.current = null;
        existingResolver("cancelled");
      }

      setPendingPlacementRequest(request);
      setPlacementSelection(null);
      setPlacementConfirmOpen(false);

      return await new Promise<VisualPlacementDecision>((resolve) => {
        placementResolverRef.current = resolve;
      });
    },
    [vm.chatId, vm.currentPreviewUrl],
  );

  const handlePlacementComplete = useCallback(
    (detail: PlacementSelectEventDetail) => {
      if (!pendingPlacementRequest) return;
      setPlacementSelection(detail);
      setPlacementConfirmOpen(true);
    },
    [pendingPlacementRequest],
  );

  const handlePlacementCancel = useCallback(() => {
    resolvePlacementFlow("cancelled");
  }, [resolvePlacementFlow]);

  const handlePlacementConfirm = useCallback(
    async (customization: string) => {
      if (!pendingPlacementRequest || !placementSelection || !vm.chatId) {
        resolvePlacementFlow("cancelled");
        return;
      }

      setIsPlacementSubmitting(true);
      try {
        const built = buildPlacementPromptMessage(
          pendingPlacementRequest,
          placementSelection,
          customization,
        );
        await vm.sendMessage(built.message, { promptSourceMeta: built.meta });
        resolvePlacementFlow("handled");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kunde inte skicka placeringsinstruktion";
        toast.error(message);
        resolvePlacementFlow("cancelled");
      } finally {
        setIsPlacementSubmitting(false);
      }
    },
    [
      pendingPlacementRequest,
      placementSelection,
      vm,
      resolvePlacementFlow,
    ],
  );

  const pendingPlacementItem = pendingPlacementRequest
    ? pendingPlacementRequest.kind === "ui"
      ? {
          title:
            pendingPlacementRequest.source.displayName ||
            pendingPlacementRequest.source.registryItem.name ||
            "Block",
          description:
            pendingPlacementRequest.source.description ||
            pendingPlacementRequest.source.registryItem.description ||
            null,
        }
      : {
          title: pendingPlacementRequest.source.item.label,
          description: pendingPlacementRequest.source.item.description,
        }
    : null;

  const latestPendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(vm.messages.map(toAIElementsFormat)),
    [vm.messages],
  );

  const persistPreviewOverride = useCallback(
    async (url: string | null, versionId: string | null) => {
      vm.setServerProjectPreviewOverrideUrl(url);
      vm.setServerProjectPreviewOverrideVersionId(versionId);
      if (!vm.appProjectId) return;
      try {
        await saveProjectData(vm.appProjectId, {
          meta: {
            previewOverride:
              url && versionId
                ? {
                    url,
                    versionId,
                    source: "preview",
                  }
                : null,
          },
        });
      } catch (error) {
        console.warn("[Builder] Failed to persist preview override:", error);
      }
    },
    [vm],
  );

  const handleClearPreview = useCallback(() => {
    void (async () => {
      const activeVersionId = vm.activeVersionId ?? null;
      const activePreviewSessionId = vm.activePreviewSessionId?.trim() || null;

      if (vm.chatId && activeVersionId && activePreviewSessionId) {
        const destroy = await postPreviewDestroy({
          chatId: vm.chatId,
          versionId: activeVersionId,
          previewSessionId: activePreviewSessionId,
        });
        if (!destroy || destroy.ok !== true) {
          toast.error(
            destroy?.message?.trim() || "Kunde inte stänga live-preview och frigöra VM-sessionen.",
          );
          return;
        }
      }

      vm.clearPreviewSessionState(activeVersionId);
      vm.setClearedPreviewVersionId(activeVersionId);
      vm.setCurrentPreviewUrl(null);
      void persistPreviewOverride(null, null);
      void vm.mutateVersions();
    })();
  }, [vm, persistPreviewOverride]);

  const handleVersionSelect = useCallback(
    (versionId: string, demoUrl?: string) => {
      vm.clearPreviewBuildError();
      vm.setClearedPreviewVersionId(null);
      if (vm.serverProjectPreviewOverrideVersionId === versionId) {
        void persistPreviewOverride(null, null);
      }
      vm.handleVersionSelect(versionId, demoUrl);
    },
    [vm, persistPreviewOverride],
  );

  const handleApplyAnthropicComparePreset = useCallback(() => {
    vm.setSelectedModelTier("anthropic");
  }, [
    vm,
  ]);

  useEffect(() => {
    setEnableAutofix(readAutofixLocalStorageOnly());
  }, []);


  const handleEnableAutofixChange = useCallback((next: boolean) => {
    writeAutofixLocalStorage(next);
    setEnableAutofix(next);
  }, []);

  // Post-generation suggestions are now in the Verktyg dropdown (PreviewPanelChrome).

  const handleTemplateSelect = useCallback(
    (templateIds: string[]) => {
      vm.setSelectedTemplateIds(templateIds);
      vm.setShowTemplatePicker(false);
      setTemplatePickerItems([]);
      setIsTemplatePickerLoading(false);

      const savedMessages = templatePickerMessagesRef.current;
      templatePickerMessagesRef.current = null;

      if (!savedMessages) return;

      const selectedTemplates = templateIds
        .map((id) => getTemplateCatalogItemById(id))
        .filter(Boolean);

      const confirmMsg: ChatMessage = {
        id: `template-pick-${Date.now()}`,
        role: "assistant",
        content:
          selectedTemplates.length > 0
            ? "Bra val! Nu vet jag vilken stil du föredrar. Vi fortsätter."
            : "Inga problem — vi bygger helt från grunden.",
        isHelpMessage: true,
      };

      const afterPick = [...savedMessages, confirmMsg];
      const nextState = deriveNeedsAnalysisState(afterPick);
      if (!nextState.ready) {
        const nextQ = buildNextNeedsAnalysisMessage(afterPick);
        vm.setMessages(nextQ ? [...afterPick, nextQ] : afterPick);
      } else {
        vm.setMessages(afterPick);
        triggerStarterGeneration(afterPick);
      }
    },
    [vm, triggerStarterGeneration],
  );

  const handleTemplatePickerClose = useCallback(() => {
    handleTemplateSelect([]);
  }, [handleTemplateSelect]);

  const smartSendMessage = useCallback(
    async (message: string, options?: Record<string, unknown>) => {
      const intent = await classifyIntent(message);
      if (intent === "help") {
        await sendHelpMessage(message, vm.setMessages, vm.messages);
        return;
      }

      await vm.sendMessage(message, options);
    },
    [sendHelpMessage, vm.sendMessage, vm.setMessages, vm.messages],
  );

  const smartCreateChat = useCallback(
    async (message: string, options?: Record<string, unknown>) => {
      if (isNeedsAnalysisActive(vm.messages, vm.chatId)) {
        const userMessage: ChatMessage = {
          id: `needs-analysis-user-${Date.now()}`,
          role: "user",
          content: message.trim(),
        };
        const nextMessages = [...vm.messages, userMessage];

        const urlMatch = extractUrlFromMessages([userMessage]);
        if (urlMatch) {
          const scrapingMsg = buildScrapingMessage();
          const scrapingPart = scrapingMsg.uiParts![0]!;
          (scrapingPart.output as Record<string, unknown>).url = urlMatch;
          vm.setMessages([...nextMessages, scrapingMsg]);

          try {
            const res = await fetch("/api/builder/company-intel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: urlMatch, synthesize: true }),
            });
            const json = await res.json();
            if (json.success && json.data) {
              const intel = json.data.intel;
              if (json.data.brief) {
                companyBriefRef.current = json.data.brief as Record<string, unknown>;
              }
              const scrapeCompat: ScrapeResult = {
                title: intel?.scrapedContent?.title ?? "",
                description: intel?.scrapedContent?.description ?? "",
                headings: intel?.scrapedContent?.headings ?? [],
                wordCount: intel?.scrapedContent?.wordCount ?? 0,
                hasImages: (intel?.scrapedContent?.images ?? 0) > 0,
                textSummary: intel?.scrapedContent?.text?.slice(0, 500) ?? "",
              };
              scrapeDataRef.current = scrapeCompat;
              const doneMsg = buildScrapeCompleteMessage(scrapeCompat);
              doneMsg.uiParts = [
                {
                  type: "tool:awaiting-input" as const,
                  toolName: "Webbanalys",
                  toolCallId: `scrape:done`,
                  state: "done" as const,
                  kind: "scrape-progress",
                  output: {
                    kind: "scrape-progress",
                    awaitingInput: false,
                    url: urlMatch,
                    title: scrapeCompat.title,
                  },
                },
              ];
              const afterScrape = [...nextMessages, doneMsg];
              const nextState = deriveNeedsAnalysisState(afterScrape);
              if (!nextState.ready) {
                const nextQ = buildNextNeedsAnalysisMessage(afterScrape);
                vm.setMessages(nextQ ? [...afterScrape, nextQ] : afterScrape);
              } else {
                vm.setMessages(afterScrape);
                triggerStarterGeneration(afterScrape, options);
                return true;
              }
            } else {
              const failMsg = buildScrapeFailedMessage();
              const afterFail = [...nextMessages, failMsg];
              const nextState = deriveNeedsAnalysisState(afterFail);
              if (!nextState.ready) {
                const nextQ = buildNextNeedsAnalysisMessage(afterFail);
                vm.setMessages(nextQ ? [...afterFail, nextQ] : afterFail);
              } else {
                vm.setMessages(afterFail);
                triggerStarterGeneration(afterFail, options);
                return true;
              }
            }
          } catch {
            const failMsg = buildScrapeFailedMessage();
            const afterFail = [...nextMessages, failMsg];
            const nextState = deriveNeedsAnalysisState(afterFail);
            if (!nextState.ready) {
              const nextQ = buildNextNeedsAnalysisMessage(afterFail);
              vm.setMessages(nextQ ? [...afterFail, nextQ] : afterFail);
            } else {
              vm.setMessages(afterFail);
              triggerStarterGeneration(afterFail, options);
              return true;
            }
          }
          return true;
        }

        const prevState = deriveNeedsAnalysisState(vm.messages);
        const nextState = deriveNeedsAnalysisState(nextMessages);

        const siteTypeJustAnswered =
          !prevState.answeredFields.includes("siteType") &&
          nextState.answeredFields.includes("siteType");

        if (siteTypeJustAnswered) {
          templatePickerTriggeredRef.current = true;
          const detectedType = chipToSiteType(message);
          pendingSiteTypeRef.current = detectedType;
        }

        if (!nextState.ready) {
          const nextQuestion = buildNextNeedsAnalysisMessage(nextMessages);
          vm.setMessages(nextQuestion ? [...nextMessages, nextQuestion] : nextMessages);
          return true;
        }

        vm.setMessages(nextMessages);
        triggerStarterGeneration(nextMessages, options);
        return true;
      }
      const intent = await classifyIntent(message);
      if (intent === "help") {
        await sendHelpMessage(message, vm.setMessages, vm.messages);
        return false;
      }
      return wrappedRequestCreateChat(message, options);
    },
    [sendHelpMessage, vm.chatId, vm.messages, wrappedRequestCreateChat, vm.selectedTemplateIds, vm.setMessages, vm.setShowTemplatePicker, triggerStarterGeneration],
  );

  const handleQuickReply = useCallback(
    async (text: string, options?: Record<string, unknown>) => {
      if (!vm.chatId) {
        await smartCreateChat(text, options);
        return;
      }
      await smartSendMessage(text, options);
    },
    [smartCreateChat, smartSendMessage, vm.chatId],
  );

  const toolAvailability = useMemo<ToolActionAvailability>(
    () => ({
      hasChat: Boolean(vm.chatId),
      hasVersion: Boolean(vm.activeVersionId),
      hasPreview: Boolean(vm.currentPreviewUrl),
      hasDeployment: Boolean(vm.deploymentUrl || vm.activeDeploymentId),
    }),
    [vm.activeDeploymentId, vm.activeVersionId, vm.chatId, vm.currentPreviewUrl, vm.deploymentUrl],
  );

  const handleOpenTip = useCallback(() => {
    if (!vm.tipsEnabled) {
      toast.info("Aktivera tips under Avancerat först.");
      return;
    }
    const latest = getLatestCompletedAssistantMessage(vm.messages);
    void requestTip(latest);
  }, [requestTip, vm.messages, vm.tipsEnabled]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ChatToolEventDetail>).detail;
      if (!detail?.id) return;

      switch (detail.id) {
        case "generate.new":
          vm.resetToNewChat();
          return;
        case "generate.regenerate": {
          const latestUser = getLatestUserMessage(vm.messages);
          if (!latestUser) {
            toast.info("Inget meddelande att generera om från.");
            return;
          }
          void vm.sendMessage(latestUser.content);
          return;
        }
        case "generate.stop":
          vm.cancelActiveGeneration();
          return;
        case "generate.deepBrief":
          vm.setPromptAssistDeep(true);
          toast.success("Djup brief aktiverad för nästa generation.");
          return;
        case "generate.polishPrompt":
          vm.setPromptAssistDeep(false);
          toast.success("Prompt-polish aktiverad (snabb).");
          return;
        case "generate.switchModel":
          vm.setDetailsDrawerOpen(true);
          toast.info("Välj modell i panelen.");
          return;
        case "preview.refresh":
          vm.bumpPreviewRefreshToken();
          return;
        case "preview.restart":
          void vm.handleFixPreview?.();
          toast.info("Startar om preview-VM…");
          return;
        case "preview.destroy":
          handleClearPreview();
          return;
        case "preview.openExternal":
          if (vm.currentPreviewUrl) {
            window.open(vm.currentPreviewUrl, "_blank", "noopener,noreferrer");
          }
          return;
        case "preview.status":
          toast.info(
            vm.previewLifecycle
              ? `Preview: ${vm.previewLifecycle}${vm.currentPreviewUrl ? " • live" : ""}`
              : "Ingen aktiv preview.",
          );
          return;
        case "preview.inspect":
          window.dispatchEvent(new CustomEvent("sajtmaskin:inspector:toggle"));
          return;
        case "versions.history":
          if (vm.isVersionPanelCollapsed) vm.handleToggleVersionPanel();
          return;
        case "publish.deploy":
          if (canDeploy) vm.handleOpenDeployDialog();
          else if (deployDisabledReason) toast.info(deployDisabledReason);
          return;
        case "publish.openDeployment":
          if (vm.deploymentUrl) {
            window.open(vm.deploymentUrl, "_blank", "noopener,noreferrer");
          } else {
            toast.info("Ingen publicerad version än.");
          }
          return;
        case "publish.domain":
          if (vm.lastDeployVercelProjectId) vm.setDomainManagerOpen(true);
          else vm.setDomainSearchOpen(true);
          return;
        case "publish.env":
          vm.setDetailsDrawerOpen(true);
          toast.info("Projektets miljövariabler är öppna i panelen.");
          return;
        case "publish.status":
          toast.info(
            vm.deploymentStatus ? `Bygg-status: ${vm.deploymentStatus}` : "Ingen aktiv build.",
          );
          return;
        case "quality.autofix":
          if (vm.chatId && vm.activeVersionId) {
            dispatchAutoFixEvent({
              chatId: vm.chatId,
              versionId: vm.activeVersionId,
              reasons: ["manual-tool-palette"],
            });
            toast.info("Autofix startad.");
          } else {
            toast.info("Saknar chat eller version.");
          }
          return;
        case "data.modelTrace":
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "M", altKey: true, shiftKey: true }),
          );
          return;
        case "data.saveProject":
          if (vm.chatId) void vm.handleSaveProject();
          else toast.info("Saknar projekt att spara.");
          return;
        case "help.openclaw":
          window.dispatchEvent(new CustomEvent("openclaw:open"));
          return;
        case "help.dailyTip":
          handleOpenTip();
          return;
        case "help.shortcuts":
          toast("⌘K öppnar verktyg", { description: "Alt+Shift+M: modellspår" });
          return;
        case "help.advanced":
        case "generate.switchScaffold":
          vm.setDetailsDrawerOpen(true);
          return;
        default:
          toast.info("Verktyget är inte kopplat än.");
      }
    };

    window.addEventListener(CHAT_TOOL_EVENT, handler as EventListener);
    return () => window.removeEventListener(CHAT_TOOL_EVENT, handler as EventListener);
  }, [vm, canDeploy, deployDisabledReason, handleClearPreview, handleOpenTip]);

  const autoReplyKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!latestPendingReply) return;
    if (autoReplyKeyRef.current === latestPendingReply.key) return;
    if (vm.isCreatingChat) return;
    if (!vm.isAnyStreaming) return;
    autoReplyKeyRef.current = latestPendingReply.key;

    const firstOption = latestPendingReply.options[0];
    if (firstOption) {
      void handleQuickReply(firstOption, {
        planMode: latestPendingReply.planMode,
      });
    }
  }, [latestPendingReply, vm.isCreatingChat, vm.isAnyStreaming, handleQuickReply]);

  return (
    <BuilderLayout chatId={vm.chatId} versionId={vm.activeVersionId}>
      <BuilderHeader
        
        selectedModelTier={vm.selectedModelTier}
        onSelectedModelTierChange={vm.setSelectedModelTier}
        onApplyAnthropicComparePreset={handleApplyAnthropicComparePreset}
        promptAssistModel={vm.promptAssistModel}
        promptAssistDeep={vm.promptAssistDeep}
        canUseDeepBrief={!vm.chatId}
        scaffoldMode={vm.scaffoldMode}
        scaffoldId={vm.scaffoldId}
        onScaffoldModeChange={vm.setScaffoldMode}
        onScaffoldIdChange={vm.setScaffoldId}
        customInstructions={vm.customInstructions}
        onCustomInstructionsChange={vm.setCustomInstructions}
        applyInstructionsOnce={vm.applyInstructionsOnce}
        onApplyInstructionsOnceChange={vm.setApplyInstructionsOnce}
        enableImageGenerations={vm.enableImageGenerations}
        onEnableImageGenerationsChange={vm.setEnableImageGenerations}
        enableThinking={vm.enableThinking}
        onEnableThinkingChange={vm.setEnableThinking}
        isImageGenerationsSupported={vm.isImageGenerationsSupported}
        isMediaEnabled={vm.isMediaEnabled}
        chatPrivacy={vm.chatPrivacy}
        onChatPrivacyChange={vm.setChatPrivacy}
        enableBlobMedia={vm.enableBlobMedia}
        onEnableBlobMediaChange={vm.setEnableBlobMedia}
        enableAutofix={enableAutofix}
        onEnableAutofixChange={handleEnableAutofixChange}
        showStructuredChat={vm.showStructuredChat}
        onShowStructuredChatChange={vm.setShowStructuredChat}
        tipsEnabled={vm.tipsEnabled}
        onTipsEnabledChange={vm.setTipsEnabled}
        isFigmaInputOpen={isFigmaInputOpen}
        onToggleFigmaInput={() => setIsFigmaInputOpen((value) => !value)}
        chatId={vm.chatId}
        activeVersionId={vm.activeVersionId}
        onOpenImport={() => {
          vm.setIsImportModalOpen(true);
        }}
        onDeployProduction={vm.handleOpenDeployDialog}
        onDomainSearch={() => {
          if (vm.lastDeployVercelProjectId) {
            vm.setDomainManagerOpen(true);
          } else {
            vm.setDomainSearchOpen(true);
          }
        }}
        onGoHome={vm.handleGoHome}
        onNewChat={vm.resetToNewChat}
        onSaveProject={vm.handleSaveProject}
        onCancelGeneration={vm.cancelActiveGeneration}
        isDeploying={vm.isDeploying}
        isCreatingChat={vm.isCreatingChat}
        isAnyStreaming={vm.isAnyStreaming}
        isSavingProject={vm.isSavingProject}
        canDeploy={canDeploy}
        canManageDomain={Boolean(vm.chatId && vm.activeVersionId && !isDeployActionBusy)}
        canSaveProject={Boolean(vm.chatId)}
        deploymentStatus={vm.deploymentStatus}
        deploymentUrl={vm.deploymentUrl}
        deployDisabledReason={deployDisabledReason}
        compact={vm.uiMode === "minimal"}
        onOpenDetailsDrawer={() => vm.setDetailsDrawerOpen(true)}
        onToggleUiMode={() => vm.setUiMode(vm.uiMode === "minimal" ? "expanded" : "minimal")}
      />
      {(vm.uiMode === "expanded" || vm.detailsDrawerOpen) && (
        <ModelTraceOverlay
          selectedModelTier={vm.selectedModelTier}
          promptAssistModel={vm.promptAssistModel}
          promptAssistDeep={vm.promptAssistDeep}
          enableThinking={vm.enableThinking}
          canUseDeepBrief={!vm.chatId}
        />
      )}

      {/* Mobile tab bar (visible < lg); chat first tills sajt finns.
          In minimal mode there's no inline chat panel — tapping "Chatt" opens
          the details drawer instead. */}
      <div
        className={cn(
          "border-border bg-background/95 shrink-0 border-b lg:hidden",
          vm.uiMode === "minimal" ? "hidden" : "flex",
        )}
        role="tablist"
        aria-label="Byggarvyer"
      >
        <button
          role="tab"
          aria-selected={mobileTab === "chat"}
          aria-controls="builder-chat-panel"
          aria-label="Chatt"
          onClick={() => setMobileTab("chat")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 px-3 min-h-11 py-2.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200",
            mobileTab === "chat"
              ? "border-primary text-primary border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          Chatt
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "preview"}
          aria-controls="builder-preview-panel"
          aria-label="Förhandsvisning"
          onClick={() => setMobileTab("preview")}
          className={cn(
            "relative flex flex-1 items-center justify-center gap-1.5 px-3 min-h-11 py-2.5 text-sm font-medium motion-safe:transition-colors motion-safe:duration-200",
            mobileTab === "preview"
              ? "border-primary text-primary border-b-2"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="h-4 w-4 shrink-0" />
          Sajt
          {vm.currentPreviewUrl && mobileTab !== "preview" && (
            <span className="bg-primary ring-background absolute top-1.5 right-[calc(50%-1.25rem)] h-1.5 w-1.5 rounded-full ring-2" />
          )}
        </button>
      </div>

      {/* Apple-minimal builder: pulse disclosure pill + Cmd/Ctrl+K. */}
      {vm.uiMode === "minimal" && !vm.detailsDrawerOpen && (
        <BuilderDisclosurePill
          onOpen={() => vm.setDetailsDrawerOpen(true)}
          pulsing={vm.isAnyStreaming}
          attention={Boolean(latestPendingReply)}
        />
      )}
      {/* Right column tooling: Apple-minimal builder keeps this hidden by default
          and only mounts it inside BuilderDetailsDrawer on demand. In expanded
          mode we keep the legacy inline chat panel for power users. */}
      {(() => {
        const rightColumnContent = (
          <>
            <LaunchReadinessCard
              readiness={vm.deployReadiness}
              isLoading={vm.isDeployReadinessLoading}
            />
            <ProjectEnvVarsPanel
              externalProjectId={vm.externalProjectId}
              appProjectId={vm.appProjectId}
              chatId={vm.chatId}
              activeVersionId={vm.activeVersionId}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <MessageList
                chatId={vm.chatId}
                versionId={vm.activeVersionId}
                messages={displayMessages}
                showStructuredParts={vm.showStructuredChat}
                onQuickReply={handleQuickReply}
                onApproveBuildPlan={handleApproveBuildPlan}
                quickReplyDisabled={isBusy}
              />
              <TipCard
                open={tipPanelOpen && vm.tipsEnabled}
                isLoading={isTipLoading}
                tip={tipText}
                error={tipError}
                cost={tipCost}
                onRefresh={handleRefreshTip}
                onClose={() => setTipPanelOpen(false)}
              />
            </div>
            <ChatInterface
              chatId={vm.chatId}
              initialPrompt={vm.initialPrompt}
              onCreateChat={smartCreateChat}
              onSendMessage={smartSendMessage}
              onRequestPlacement={handleRequestPlacement}
              onStartFromTemplate={vm.handleStartFromTemplate}
              onPaletteSelection={vm.handlePaletteSelection}
              paletteSelections={vm.paletteState.selections}
              designTheme={vm.designTheme}
              onDesignThemeChange={vm.setDesignTheme}
              onPromptAssistModeReset={vm.handlePromptAssistModeReset}
              isFigmaInputOpen={isFigmaInputOpen}
              onFigmaInputOpenChange={setIsFigmaInputOpen}
              isBusy={isBusy}
              isPreparingPrompt={vm.isPreparingPrompt}
              mediaEnabled={vm.mediaEnabled}
              currentCode={vm.currentPageCode}
              existingUiComponents={vm.existingUiComponents}
              continuePlanMode={Boolean(latestPendingReply?.planMode)}
              toolAvailability={toolAvailability}
            />
          </>
        );
        return (
          <>
            {vm.uiMode === "minimal" ? (
              <BuilderDetailsDrawer
                open={vm.detailsDrawerOpen}
                onOpenChange={vm.setDetailsDrawerOpen}
              >
                {rightColumnContent}
              </BuilderDetailsDrawer>
            ) : null}
          </>
        );
      })()}

      <div className="flex min-h-0 flex-1 overflow-hidden lg:flex-row-reverse">
        {/* ---------- Chat panel (desktop: right, expanded mode only) ---------- */}
        {vm.uiMode === "expanded" && chatCollapsed && (
          <div className="border-border hidden items-start border-l pt-2 lg:flex">
            <button
              onClick={toggleChatCollapsed}
              className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md px-1 py-3"
              aria-label="Visa chatt"
              title="Visa chatt"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
        {vm.uiMode === "expanded" && (
          <div
            id="builder-chat-panel"
            role="tabpanel"
            className={cn(
              "border-border bg-muted/20 text-foreground min-h-0 w-full flex-col border-r motion-safe:transition-[background-color,border-color,width,max-width] motion-safe:duration-200 lg:border-l lg:border-r-0",
              chatCollapsed ? "lg:hidden" : "lg:flex lg:w-80 lg:max-w-[20rem]",
              mobileTab === "chat" ? "flex" : "hidden",
            )}
          >
            <div className="hidden items-center justify-end px-2 pt-1 lg:flex">
              <button
                onClick={toggleChatCollapsed}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1"
                aria-label="Dölj chatt"
                title="Dölj chatt"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <LaunchReadinessCard
              readiness={vm.deployReadiness}
              isLoading={vm.isDeployReadinessLoading}
            />
            <ProjectEnvVarsPanel
              externalProjectId={vm.externalProjectId}
              appProjectId={vm.appProjectId}
              chatId={vm.chatId}
              activeVersionId={vm.activeVersionId}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <MessageList
                chatId={vm.chatId}
                versionId={vm.activeVersionId}
                messages={displayMessages}
                showStructuredParts={vm.showStructuredChat}
                onQuickReply={handleQuickReply}
                onApproveBuildPlan={handleApproveBuildPlan}
                quickReplyDisabled={isBusy}
              />
              <TipCard
                open={tipPanelOpen && vm.tipsEnabled}
                isLoading={isTipLoading}
                tip={tipText}
                error={tipError}
                cost={tipCost}
                onRefresh={handleRefreshTip}
                onClose={() => setTipPanelOpen(false)}
              />
            </div>
            <ChatInterface
              chatId={vm.chatId}
              initialPrompt={vm.initialPrompt}
              onCreateChat={smartCreateChat}
              onSendMessage={smartSendMessage}
              onRequestPlacement={handleRequestPlacement}
              onStartFromTemplate={vm.handleStartFromTemplate}
              onPaletteSelection={vm.handlePaletteSelection}
              paletteSelections={vm.paletteState.selections}
              designTheme={vm.designTheme}
              onDesignThemeChange={vm.setDesignTheme}
              onPromptAssistModeReset={vm.handlePromptAssistModeReset}
              isFigmaInputOpen={isFigmaInputOpen}
              onFigmaInputOpenChange={setIsFigmaInputOpen}
              isBusy={isBusy}
              isPreparingPrompt={vm.isPreparingPrompt}
              mediaEnabled={vm.mediaEnabled}
              currentCode={vm.currentPageCode}
              existingUiComponents={vm.existingUiComponents}
              continuePlanMode={Boolean(latestPendingReply?.planMode)}
              toolAvailability={toolAvailability}
            />
          </div>
        )}

        {showIntakeWizard && !vm.chatId && (
          <IntakeWizard
            onComplete={handleIntakeWizardComplete}
            onScrapeUrl={handleIntakeWizardScrape}
            initialPrompt={vm.initialPrompt ?? undefined}
          />
        )}

        {/* ---------- Dialogs (portal-based, shared by both modes) ---------- */}
        <DeployNameDialog
          open={vm.deployNameDialogOpen}
          deployName={vm.deployNameInput}
          deployNameError={vm.deployNameError}
          isDeploying={vm.isDeploying}
          isSaving={false}
          onDeployNameChange={(value) => {
            vm.setDeployNameInput(value);
            if (vm.deployNameError) vm.setDeployNameError(null);
          }}
          onCancel={() => vm.setDeployNameDialogOpen(false)}
          onConfirm={vm.handleConfirmDeploy}
        />

        <AlertDialog
          open={vm.templateSwitchDialog !== null}
          onOpenChange={(open) => {
            if (!open) vm.cancelTemplateSwitchDialog();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {vm.templateSwitchDialog?.kind === "new-chat"
                  ? "Starta ny chat från template?"
                  : "Avbryta pågående generering?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {vm.templateSwitchDialog?.kind === "new-chat"
                  ? "Du har redan en aktiv chat. En ny chat startas från vald template och nuvarande konversation finns kvar i historiken."
                  : "Generering pågår just nu. Vill du avbryta och starta från mallen istället?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Avbryt</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={() => vm.confirmTemplateSwitchDialog()}>
                Fortsätt
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DomainSearchDialog
          open={vm.domainSearchOpen}
          query={vm.domainQuery}
          results={vm.domainResults}
          isSearching={vm.isDomainSearching}
          onQueryChange={vm.setDomainQuery}
          onSearch={vm.handleDomainSearch}
          onClose={() => vm.setDomainSearchOpen(false)}
        />

        <DomainManager
          open={vm.domainManagerOpen}
          onClose={() => vm.setDomainManagerOpen(false)}
          projectId={vm.lastDeployVercelProjectId}
          deploymentId={vm.activeDeploymentId}
        />

        {/* ---------- Preview panel (desktop: left, primary) ---------- */}
        <div
          id="builder-preview-panel"
          role="tabpanel"
          className={cn(
            "bg-background min-h-0 flex-1 overflow-hidden motion-safe:transition-[background-color] motion-safe:duration-200",
            vm.uiMode === "minimal"
              ? "flex"
              : mobileTab === "preview"
                ? "flex"
                : "hidden lg:flex",
          )}
        >
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
            <PreviewPanel
              chatId={vm.chatId}
              versionId={vm.activeVersionId}
              previewUrl={vm.currentPreviewUrl}
              alternatePreviewUrls={vm.activeVersionAlternatePreview}
              previewBuildError={vm.previewBuildError}
              previewProdBuild={vm.previewProdBuild}
              previewPending={vm.previewPending}
              activePreviewSessionId={vm.activePreviewSessionId}
              previewLifecycle={vm.previewLifecycle}
              activeVersionStatus={activeVersionStatus}
              activeVersionSummary={activeVersionSummary?.verificationSummary ?? null}
              activeVersionIsLatest={activeVersionIsLatest}
              onPreviewSessionSuspect={vm.handlePreviewSessionSuspect}
              onNavigatePreviewUrl={(url) => {
                vm.setCurrentPreviewUrl(url);
                vm.bumpPreviewRefreshToken();
              }}
              isLoading={isPreviewLoading}
              imageGenerationsEnabled={vm.enableImageGenerations}
              imageGenerationsSupported={vm.isImageGenerationsSupported}
              isBlobConfigured={vm.isMediaEnabled}
              awaitingInput={vm.isAwaitingInput}
              awaitingInputQuestion={latestPendingReply?.question ?? null}
              awaitingInputOptions={latestPendingReply?.options ?? []}
              onClear={handleClearPreview}
              onFixPreview={vm.handleFixPreview}
              onFilesSaved={vm.handleFilesSaved}
              refreshToken={vm.previewRefreshToken}
              placementMode={Boolean(pendingPlacementRequest)}
              pendingPlacementItem={pendingPlacementItem}
              onPlacementComplete={handlePlacementComplete}
              simplified={false}
              onComposerAiFallback={async (payload) => {
                const prompt = `Lägg till en "${payload.placementLabel}"-sektion ${payload.placement === "after-hero" ? "efter hero" : `vid ${payload.placement}`} på startsidan.`;
                void vm.sendMessage(prompt);
              }}
              generationPhase={generationPhase}
              onInlineEditPrompt={(prompt, file) => {
                if (file) {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("context", "inline-edit-image");
                  void fetch("/api/media/upload", { method: "POST", body: formData })
                    .then((res) => res.json())
                    .then((data) => {
                      const imageRef = data?.url ? `\n[Bifogad bild](${data.url})` : "";
                      void vm.sendMessage(prompt + imageRef);
                    })
                    .catch(() => void vm.sendMessage(prompt));
                } else {
                  void vm.sendMessage(prompt);
                }
              }}
              onSuggestionClick={(prompt) => void vm.sendMessage(prompt)}
            />
          </div>
          <div
            className={cn(
              "border-border bg-muted/15 flex h-full flex-col border-l motion-safe:transition-[width,background-color,border-color] motion-safe:duration-200",
              vm.isVersionPanelCollapsed ? "w-10" : "w-80",
            )}
          >
            <VersionHistory
              chatId={vm.chatId}
              selectedVersionId={vm.activeVersionId}
              activePreviewSessionId={vm.activePreviewSessionId}
              onVersionSelect={handleVersionSelect}
              isCollapsed={vm.isVersionPanelCollapsed}
              onToggleCollapse={vm.handleToggleVersionPanel}
              versions={vm.effectiveVersionsList}
              mutateVersions={vm.mutateVersions}
            />
          </div>
        </div>
      </div>

      <PlacementConfirmDialog
        key={`${pendingPlacementItem?.title}-${placementSelection?.placementLabel}`}
        open={placementConfirmOpen && Boolean(pendingPlacementRequest) && Boolean(placementSelection)}
        elementName={pendingPlacementItem?.title || "Element"}
        elementDescription={pendingPlacementItem?.description}
        placementLabel={placementSelection?.placementLabel || "Vald placering"}
        onConfirm={handlePlacementConfirm}
        onCancel={handlePlacementCancel}
        isSubmitting={isPlacementSubmitting}
      />

      <InitFromRepoModal
        isOpen={vm.isImportModalOpen}
        onClose={() => vm.setIsImportModalOpen(false)}
        onSuccess={(newChatId, _v0ProjectInternalId) => {
          vm.setChatId(newChatId);
          if (vm.appProjectId) {
            vm.applyAppProjectId(vm.appProjectId, { chatId: newChatId });
          } else {
            const params = new URLSearchParams(vm.searchParams.toString());
            params.set("chatId", newChatId);
            vm.router.replace(`/builder?${params.toString()}`);
          }
          vm.setMessages([]);
          vm.setCurrentPreviewUrl(null);
        }}
      />

      <RequireAuthModal
        isOpen={Boolean(vm.authModalReason)}
        onClose={() => {
          const freshlyAuthed = useAuthStore.getState().user !== null;
          if (vm.authModalReason === "builder" && !freshlyAuthed) {
            vm.router.push("/");
          }
          vm.setAuthModalReason(null);
        }}
        reason={vm.authModalReason ?? "builder"}
      />

    </BuilderLayout>
  );
}
