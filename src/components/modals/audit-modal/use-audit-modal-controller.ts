import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditModalProps, TabId } from "./types";
import { tabs } from "./helpers";
import { buildSuperPrompt as buildSuperPromptCore } from "./build-super-prompt";

function useAuditModalController({
  result,
  auditedUrl,
  isOpen,
  onClose,
  onBuildFromAudit,
  alreadySaved,
}: AuditModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  const [showBuildOverlay, setShowBuildOverlay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(Boolean(alreadySaved));
  const [saveError, setSaveError] = useState<string | null>(null);
  // a11y: the dialog surface (focus trap target) + the element that had focus
  // before the modal opened, so focus can be returned to the trigger on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset state when modal opens with new result. An already-persisted audit
  // (opened from /audits) starts as "Sparad" so it cannot POST a duplicate row.
  useEffect(() => {
    if (isOpen && result) {
      setActiveTab("overview");
      setIsSaved(Boolean(alreadySaved));
      setSaveError(null);
      setShowBuildConfirm(false);
    }
  }, [isOpen, result, alreadySaved]);

  // Auto-offer build overlay when audit opens
  useEffect(() => {
    if (isOpen && result && onBuildFromAudit) {
      setShowBuildOverlay(true);
    } else {
      setShowBuildOverlay(false);
    }
  }, [isOpen, result, onBuildFromAudit]);

  // Save audit to user's storage
  const handleSaveAudit = useCallback(async () => {
    if (!result || isSaving || isSaved) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const canonicalAuditUrl =
        (typeof auditedUrl === "string" && auditedUrl.trim()) ||
        (result.domain ? `https://${result.domain}` : "");
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: canonicalAuditUrl,
          domain: result.domain || "unknown",
          auditResult: result,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Kunde inte spara audit");
      }

      setIsSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsSaving(false);
    }
  }, [auditedUrl, result, isSaving, isSaved]);

  // Build a super prompt from the audit to kick off generation
  const buildSuperPrompt = useCallback(() => {
    return buildSuperPromptCore(result, auditedUrl);
  }, [result, auditedUrl]);

  const launchBuildFromAudit = useCallback(() => {
    if (!result || !onBuildFromAudit) return;
    const prompt = buildSuperPrompt();
    if (!prompt.trim()) return;
    onBuildFromAudit(prompt);
    setShowBuildOverlay(false);
    onClose();
  }, [buildSuperPrompt, onBuildFromAudit, onClose, result]);

  // Esc-to-close + a focus trap so keyboard focus stays inside the dialog while
  // it is open (Tab/Shift+Tab cycle through the visible focusable elements).
  useEffect(() => {
    if (!isOpen) return;
    // Cycle Tab/Shift+Tab through the visible focusables of `container` so
    // keyboard focus stays within the topmost dialog surface.
    const trapTabWithin = (container: HTMLElement, e: KeyboardEvent) => {
        // Only visible focusables — inactive tab panels are display:none.
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        // Focus outside the trapped surface (e.g. still on the button that
        // opened a stacked dialog): pull it inside instead of letting Tab
        // walk through obscured controls underneath.
        if (!active || !container.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey) {
          if (active === first || active === container) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || active === container) {
          e.preventDefault();
          first.focus();
        }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nested dialogs (PDF report / build confirmation) render outside
      // dialogRef. While one is stacked on top, Escape dismisses the topmost
      // dialog and the Tab trap retargets to it, so keyboard focus can neither
      // get stuck in nor slip down to the underlying audit surface.
      if (showPdfModal || showBuildConfirm) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (showBuildConfirm) setShowBuildConfirm(false);
          else setShowPdfModal(false);
          return;
        }
        if (e.key === "Tab") {
          const nested = document.querySelector<HTMLElement>("[data-audit-nested-dialog]");
          if (nested) trapTabWithin(nested, e);
        }
        return;
      }
      if (e.key === "Escape") {
        // Don't close if user is typing in an input field
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        if (isInput || target.isContentEditable) return;

        e.preventDefault();
        e.stopPropagation();
        // The auto-shown build-CTA overlay stacks inside the dialog — Escape
        // dismisses it first; a second Escape closes the audit itself.
        if (showBuildOverlay) {
          setShowBuildOverlay(false);
          return;
        }
        onClose();
        return;
      }
      if (e.key === "Tab") {
        // While the build-CTA overlay covers the dialog, confine Tab to it so
        // focus cannot reach the covered audit controls underneath.
        const container =
          (showBuildOverlay
            ? document.querySelector<HTMLElement>("[data-audit-build-overlay]")
            : null) ?? dialogRef.current;
        if (!container) return;
        trapTabWithin(container, e);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, showPdfModal, showBuildConfirm, showBuildOverlay]);

  // Move focus into a stacked dialog (PDF report / build confirmation) when
  // it opens — otherwise focus stays on the triggering button under the
  // overlay and Tab starts from the obscured audit surface.
  useEffect(() => {
    if (!showPdfModal && !showBuildConfirm && !showBuildOverlay) return;
    const raf = requestAnimationFrame(() => {
      // Nested dialogs (z-60) stack above the build-CTA overlay (z-40) —
      // focus the topmost surface that is actually in the DOM.
      const target =
        document.querySelector<HTMLElement>("[data-audit-nested-dialog]") ??
        document.querySelector<HTMLElement>("[data-audit-build-overlay]");
      target?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [showPdfModal, showBuildConfirm, showBuildOverlay]);

  // Move focus into the dialog on open and return it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    const raf = requestAnimationFrame(() => {
      // When the build-CTA overlay auto-opens on top, it is the active prompt
      // — send initial focus there instead of the covered dialog surface.
      const buildOverlay = document.querySelector<HTMLElement>("[data-audit-build-overlay]");
      (buildOverlay ?? dialogRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      const trigger = previouslyFocusedRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [isOpen]);

  const downloadJSON = useCallback(() => {
    if (!result) return;

    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${result.domain || "result"}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const navigateTab = (direction: "prev" | "next") => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (direction === "prev" && currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
    } else if (direction === "next" && currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id);
    }
  };

  return {
    activeTab,
    setActiveTab,
    showPdfModal,
    setShowPdfModal,
    showBuildConfirm,
    setShowBuildConfirm,
    showBuildOverlay,
    setShowBuildOverlay,
    isSaving,
    isSaved,
    saveError,
    dialogRef,
    handleSaveAudit,
    launchBuildFromAudit,
    downloadJSON,
    navigateTab,
  };
}

export { useAuditModalController };
