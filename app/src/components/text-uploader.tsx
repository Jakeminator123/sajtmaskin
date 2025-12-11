"use client";

/**
 * TextUploader Component (Simplified)
 * ====================================
 *
 * Simplified text file upload that integrates with the orchestrator pipeline.
 * Replaces the complex TextProcessorModal with a streamlined flow.
 *
 * Flow:
 * 1. User uploads text/PDF file
 * 2. Content is extracted
 * 3. Content is sent to orchestrator with a simple instruction
 * 4. Orchestrator + Code Crawler determines the best placement
 * 5. If unclear, Smart Clarify asks user which section
 *
 * This approach uses the new agent pipeline instead of custom placement logic.
 */

import { useState, useRef, useCallback } from "react";
import { FileText, Upload, Loader2, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function TextUploader({
  isOpen,
  onClose,
  onContentReady,
  disabled = false,
}: TextUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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
    const validTypes = [
      "text/plain",
      "text/markdown",
      "application/json",
      "application/pdf",
    ];
    const validExtensions = [".txt", ".md", ".json", ".pdf"];

    const isValidType = validTypes.includes(file.type);
    const isValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );

    if (!isValidType && !isValidExt) {
      setError("Endast textfiler (.txt, .md, .json) och PDF stöds");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const content = await readFileContent(file);

      if (!content || content.trim().length === 0) {
        setError("Filen verkar vara tom");
        return;
      }

      // Send content to parent - orchestrator will handle placement
      onContentReady(content, file.name);
      onClose();
    } catch (err) {
      console.error("[TextUploader] Error processing file:", err);
      setError(
        err instanceof Error ? err.message : "Kunde inte bearbeta filen"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
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
    [disabled]
  );

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className={cn(
            "w-full max-w-sm bg-gray-950 border border-gray-800 rounded-xl shadow-2xl",
            "animate-in zoom-in-95 duration-200"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">
                Lägg till text
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Drop zone */}
            {!isProcessing && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  isDragging
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-gray-700 hover:border-gray-600 hover:bg-gray-900/50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-10 w-10 text-gray-500 mx-auto mb-3" />
                <p className="text-sm text-gray-300 mb-1">
                  Dra in en textfil eller PDF här
                </p>
                <p className="text-xs text-gray-500">
                  .txt, .md, .json, .pdf stöds
                </p>
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
                <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-3" />
                <p className="text-sm text-gray-300">Läser filen...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Help text */}
            <p className="text-xs text-gray-500 text-center">
              AI:n placerar innehållet automatiskt på rätt ställe
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
