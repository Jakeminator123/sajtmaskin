"use client";

/**
 * TextUploader Component v2.0
 * ===========================
 *
 * Simplified text file upload with smart placement hints.
 *
 * Flow:
 * 1. User uploads text/PDF file
 * 2. Content is extracted and previewed
 * 3. User sees suggested placement based on content type
 * 4. One-click send to chat (with optional save to library)
 * 5. Orchestrator + Code Crawler determines best placement
 *
 * UX Improvements in v2.0:
 * - Single primary action button instead of 3 confusing options
 * - Smart content detection (looks like About Us? Services? Contact?)
 * - Checkbox for "save to library" instead of separate button
 * - Better visual preview with word count
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { FileText, Upload, Loader2, X, AlertCircle, Wand2, Save } from "lucide-react";
import { cn } from "@/lib/utils/utils";

// ============================================================================
// TYPES
// ============================================================================

interface TextUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onContentReady: (content: string, filename: string) => void;
  disabled?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Smart content type detection based on keywords
function detectContentType(content: string): { type: string; hint: string } {
  const lower = content.toLowerCase();

  if (
    lower.includes("om oss") ||
    lower.includes("about us") ||
    lower.includes("vår historia") ||
    lower.includes("vi är")
  ) {
    return {
      type: "about",
      hint: "Ser ut som 'Om oss'-text → Föreslår About-sektionen",
    };
  }
  if (
    lower.includes("kontakt") ||
    lower.includes("email") ||
    lower.includes("telefon") ||
    lower.includes("adress")
  ) {
    return {
      type: "contact",
      hint: "Ser ut som kontaktinfo → Föreslår Contact-sektionen",
    };
  }
  if (
    lower.includes("tjänst") ||
    lower.includes("service") ||
    lower.includes("vi erbjuder") ||
    lower.includes("våra tjänster")
  ) {
    return {
      type: "services",
      hint: "Ser ut som tjänstebeskrivning → Föreslår Services-sektionen",
    };
  }
  if (
    lower.includes("pris") ||
    lower.includes("kostnad") ||
    lower.includes("paket") ||
    lower.includes("pricing")
  ) {
    return {
      type: "pricing",
      hint: "Ser ut som prislista → Föreslår Pricing-sektionen",
    };
  }
  if (lower.includes("faq") || lower.includes("vanliga frågor") || lower.includes("?")) {
    return { type: "faq", hint: "Ser ut som FAQ → Föreslår FAQ-sektionen" };
  }
  if (
    lower.includes("testimonial") ||
    lower.includes("recensi") ||
    lower.includes("kund säger") ||
    lower.includes("omdöme")
  ) {
    return {
      type: "testimonials",
      hint: "Ser ut som kundrecensioner → Föreslår Testimonials",
    };
  }

  return { type: "general", hint: "AI:n hittar bästa platsen automatiskt" };
}

export function TextUploader({
  isOpen,
  onClose,
  onContentReady,
  disabled = false,
}: TextUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<{
    content: string;
    filename: string;
    file: File;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Detect content type for smart hints
  const contentHint = useMemo(() => {
    if (!pendingText) return null;
    return detectContentType(pendingText.content);
  }, [pendingText]);

  // Calculate word count for preview
  const wordCount = useMemo(() => {
    if (!pendingText) return 0;
    return pendingText.content.split(/\s+/).filter((w) => w.length > 0).length;
  }, [pendingText]);

  const readFileContent = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/text/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Kunde inte läsa PDF-filen");
      }

      const data = await response.json();
      return data.content || "";
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || "");
      reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
      reader.readAsText(file);
    });
  };

  const handleFile = async (file: File) => {
    const validTypes = ["text/plain", "text/markdown", "application/json", "application/pdf"];
    const validExtensions = [".txt", ".md", ".json", ".pdf"];

    const isValidType = validTypes.includes(file.type);
    const isValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!isValidType && !isValidExt) {
      setError("Endast textfiler (.txt, .md, .json) och PDF stöds");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setPendingText(null);

    try {
      const content = await readFileContent(file);

      if (!content || content.trim().length === 0) {
        setError("Filen verkar vara tom");
        return;
      }

      // Låt användaren välja vad som ska göras med texten
      setPendingText({ content, filename: file.name, file });
    } catch (err) {
      console.error("[TextUploader] Error processing file:", err);
      setError(err instanceof Error ? err.message : "Kunde inte bearbeta filen");
    } finally {
      setIsProcessing(false);
    }
  };

  // Unified action: send to chat (with optional save)
  const handleSendToChat = async () => {
    if (!pendingText) return;

    // Save to library first if checkbox is checked
    if (saveToLibrary) {
      setIsSaving(true);
      try {
        const formData = new FormData();
        formData.append("file", pendingText.file);

        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          console.warn("[TextUploader] Save to library failed:", data.error);
          // Don't block - continue to send to chat
        }
      } catch (err) {
        console.warn("[TextUploader] Save to library error:", err);
        // Don't block - continue to send to chat
      } finally {
        setIsSaving(false);
      }
    }

    // Send to chat
    onContentReady(pendingText.content, pendingText.filename);
    setPendingText(null);
    setSaveToLibrary(false);
    onClose();
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await handleFile(files[0]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled],
  );

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className={cn(
            "w-full max-w-sm rounded-xl border border-gray-800 bg-gray-950 shadow-2xl",
            "animate-in zoom-in-95 duration-200",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-800 p-4">
            <div className="flex items-center gap-2">
              <FileText className="text-brand-amber h-5 w-5" />
              <h2 className="text-lg font-semibold text-white">Lägg till text</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 p-4">
            {/* Drop zone */}
            {!isProcessing && !pendingText && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={cn(
                  "cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                  isDragging
                    ? "border-brand-amber bg-brand-amber/10"
                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-900/50",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <Upload className="mx-auto mb-3 h-10 w-10 text-gray-500" />
                <p className="mb-1 text-sm text-gray-300">Dra in en textfil eller PDF här</p>
                <p className="text-xs text-gray-500">.txt, .md, .json, .pdf stöds</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.pdf,text/plain,text/markdown,application/json,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Processing */}
            {isProcessing && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="text-brand-amber mb-3 h-8 w-8 animate-spin" />
                <p className="text-sm text-gray-300">Läser filen...</p>
              </div>
            )}

            {/* Actions after content extracted */}
            {pendingText && !isProcessing && (
              <div className="space-y-3">
                {/* Content preview */}
                <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-200">{pendingText.filename}</p>
                    <span className="text-xs text-gray-500">{wordCount} ord</span>
                  </div>
                  <p className="line-clamp-3 text-xs text-gray-500">
                    {pendingText.content.slice(0, 400)}
                    {pendingText.content.length > 400 ? "..." : ""}
                  </p>
                </div>

                {/* Smart content hint */}
                {contentHint && (
                  <div className="bg-brand-teal/10 border-brand-teal/30 flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Wand2 className="text-brand-teal h-4 w-4 shrink-0" />
                    <span className="text-brand-teal/80 text-xs">{contentHint.hint}</span>
                  </div>
                )}

                {/* Save to library checkbox */}
                <label className="group flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                    className="text-brand-teal focus:ring-brand-teal h-4 w-4 rounded border-gray-600 bg-gray-800 focus:ring-offset-0"
                  />
                  <Save className="h-3.5 w-3.5 text-gray-500 group-hover:text-gray-400" />
                  <span className="text-xs text-gray-400 group-hover:text-gray-300">
                    Spara också i mediabiblioteket
                  </span>
                </label>

                {/* Single primary action */}
                <button
                  onClick={handleSendToChat}
                  disabled={isSaving || disabled}
                  className={cn(
                    "bg-brand-teal hover:bg-brand-teal/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors",
                    (isSaving || disabled) && "cursor-not-allowed opacity-70",
                  )}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sparar...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Använd i chatten
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] text-gray-600">
                  Du kan ange var texten ska placeras i nästa meddelande
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="hover:text-red-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Help text */}
            {!pendingText && !isProcessing && (
              <p className="text-center text-xs text-gray-500">
                AI:n analyserar texten och föreslår bästa platsen
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
