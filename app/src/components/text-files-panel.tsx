"use client";

/**
 * TextFilesPanel Component
 * ========================
 *
 * A dedicated panel for text-based files (PDFs, TXT, MD, JSON).
 * When a user drops a file here:
 * 1. We read/extract the content
 * 2. Use a FAST/CHEAP AI model to analyze and suggest usage options
 * 3. User picks an option → generates a well-crafted prompt for v0
 *
 * This does NOT call v0 API directly - it's a "pre-processor" that
 * helps users formulate better prompts.
 *
 * Benefits:
 * - Cheaper than sending raw text to v0
 * - Smarter suggestions based on content type
 * - Better UX with actionable options
 */

import { useState, useCallback, useRef } from "react";
import {
  FileText,
  Upload,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  FileType,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface TextFilesPanelProps {
  onPromptGenerated: (prompt: string) => void;
  disabled?: boolean;
  className?: string;
}

interface TextSuggestion {
  id: string;
  label: string;
  description: string;
  prompt: string;
  isQuickAction?: boolean; // Special quick actions like "Create Full Site"
}

interface ProcessedFile {
  filename: string;
  content: string;
  contentType: "text" | "json" | "markdown" | "pdf";
  suggestions: TextSuggestion[];
  summary?: string;
}

interface PlacementOption {
  id: "auto" | "hero" | "about" | "cta" | "faq" | "blog" | "footer" | "custom";
  label: string;
  helper: string;
}

const PLACEMENT_OPTIONS: PlacementOption[] = [
  {
    id: "auto",
    label: "AI föreslår",
    helper: "AI väljer lämplig sektion automatiskt",
  },
  {
    id: "hero",
    label: "Hero/överst",
    helper: "Placera högt upp med tydlig CTA",
  },
  {
    id: "about",
    label: "Om oss",
    helper: "Sektion för beskrivande innehåll",
  },
  {
    id: "cta",
    label: "CTA/erbjudande",
    helper: "Kort sektion med knapp och budskap",
  },
  {
    id: "faq",
    label: "FAQ/accordion",
    helper: "Frågor och svar / accordion",
  },
  {
    id: "blog",
    label: "Blogg/innehåll",
    helper: "Placera i innehålls- eller artikelområde",
  },
  {
    id: "footer",
    label: "Footer",
    helper: "Kort info i sidfoten",
  },
  {
    id: "custom",
    label: "Eget val",
    helper: "Skriv exakt var texten ska ligga",
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TextFilesPanel({
  onPromptGenerated,
  disabled = false,
  className,
}: TextFilesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFile, setProcessedFile] = useState<ProcessedFile | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null
  );
  const [usageMode, setUsageMode] = useState<"place" | "store">("place");
  const [placement, setPlacement] = useState<PlacementOption["id"]>("auto");
  const [customPlacement, setCustomPlacement] = useState("");
  const [storageStatus, setStorageStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Map placement id to human readable label
   */
  const getPlacementLabel = (id: PlacementOption["id"]): string => {
    const option = PLACEMENT_OPTIONS.find((opt) => opt.id === id);
    return option?.label || "";
  };

  /**
   * Build a prompt that includes placement instructions or storage handling
   */
  const buildPromptWithPlacement = (prompt: string): string => {
    if (usageMode === "store") {
      const filename = processedFile?.filename || "textfil";
      const summary = processedFile?.summary;
      const rawText = processedFile?.content || "";
      return `Spara denna text i användarens textlager/lagring utan att rendera den på sidan ännu. Ange lagringsnyckel/slug och hur den kan återanvändas i en framtida prompt.\n\nFil: ${filename}\n${
        summary ? `Sammanfattning: ${summary}\n` : ""
      }Råtext:\n${rawText}`;
    }

    if (placement === "auto") return prompt;

    const target =
      placement === "custom"
        ? customPlacement.trim()
        : getPlacementLabel(placement);

    if (!target) return prompt;

    return `${prompt}\n\nPlaceringsinstruktion: Lägg innehållet i sektionen "${target}" på sidan och uppdatera navigation/CTA så att användaren hittar dit.`;
  };

  /**
   * Save current text to browser-local storage (lightweight text locker)
   */
  const handleSaveToStorage = () => {
    if (!processedFile) return;

    try {
      setStorageStatus("saving");
      const key = "sajtmaskin:text-storage";
      const existingRaw = localStorage.getItem(key);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const newEntry = {
        filename: processedFile.filename,
        summary: processedFile.summary,
        content: processedFile.content,
        contentType: processedFile.contentType,
        createdAt: Date.now(),
      };
      const next = [newEntry, ...existing].slice(0, 20);
      localStorage.setItem(key, JSON.stringify(next));
      setStorageStatus("saved");
      setStorageMessage("Sparat i din lokala textlagring (webbläsaren).");
    } catch (err) {
      console.error("[TextFilesPanel] Failed to save locally:", err);
      setStorageStatus("error");
      setStorageMessage("Kunde inte spara texten lokalt.");
    }
  };

  /**
   * Read file content based on type
   */
  const readFileContent = async (file: File): Promise<string> => {
    // For PDFs, we'd need server-side processing
    // For now, we'll handle text files client-side
    if (file.type === "application/pdf") {
      // Send to API for PDF extraction
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

    // Text files can be read directly
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || "");
      reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
      reader.readAsText(file);
    });
  };

  /**
   * Get AI suggestions for how to use the text
   */
  const getAISuggestions = async (
    content: string,
    filename: string,
    contentType: string
  ): Promise<{ suggestions: TextSuggestion[]; summary: string }> => {
    const response = await fetch("/api/text/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.substring(0, 8000), // Limit for API
        filename,
        contentType,
      }),
    });

    if (!response.ok) {
      // Fallback to default suggestions if API fails
      return {
        summary: `Fil: ${filename}`,
        suggestions: getDefaultSuggestions(content, contentType),
      };
    }

    const data = await response.json();
    return {
      summary: data.summary || `Fil: ${filename}`,
      suggestions:
        data.suggestions || getDefaultSuggestions(content, contentType),
    };
  };

  /**
   * Default suggestions when AI isn't available
   */
  const getDefaultSuggestions = (
    content: string,
    contentType: string
  ): TextSuggestion[] => {
    // Quick action: Create full site from document (always first)
    const createSiteAction: TextSuggestion = {
      id: "create-full-site",
      label: "🚀 Skapa hel sajt",
      description: "Generera en komplett webbplats baserad på dokumentet",
      isQuickAction: true,
      prompt: `Skapa en KOMPLETT, professionell webbplats baserad på följande dokument.

INSTRUKTIONER:
1. Analysera texten och identifiera:
   - Företagsnamn/projektnamn
   - Huvuderbjudande/tjänster
   - Målgrupp
   - Kontaktinfo (om finns)
   - Unika säljpunkter

2. Skapa en modern one-page sajt med:
   - Hero-sektion med slagkraftig rubrik och CTA
   - Om oss/tjänster-sektion
   - Features eller fördelar (3-4 punkter)
   - Testimonial eller social proof (hitta på om inget finns)
   - CTA-sektion
   - Footer med kontaktinfo

3. Designstil:
   - Modern, professionell
   - Mörkt tema med accentfärg
   - Responsiv för mobil och desktop
   - Smooth animations

DOKUMENTINNEHÅLL:
${content.substring(0, 5000)}

Skapa en imponerande sajt som representerar detta företag/projekt!`,
    };

    if (contentType === "json") {
      return [
        createSiteAction,
        {
          id: "json-table",
          label: "Visa som tabell",
          description: "Skapa en snygg tabell av JSON-datan",
          prompt: `Skapa en modern, responsiv tabell som visar följande data. Använd zebra-striping och hover-effekter:\n\n${content.substring(
            0,
            3000
          )}`,
        },
        {
          id: "json-cards",
          label: "Visa som kort",
          description: "Skapa ett grid av kort från datan",
          prompt: `Skapa ett responsivt grid av snygga kort som visar följande data. Varje kort ska ha en bild/ikon, titel och beskrivning:\n\n${content.substring(
            0,
            3000
          )}`,
        },
        {
          id: "json-list",
          label: "Visa som lista",
          description: "En ren lista med datan",
          prompt: `Skapa en snygg lista som visar följande data med bra typografi:\n\n${content.substring(
            0,
            3000
          )}`,
        },
      ];
    }

    if (contentType === "markdown") {
      return [
        createSiteAction,
        {
          id: "md-styled",
          label: "Med styling",
          description: "Behåll struktur, lägg till styling",
          prompt: `Lägg till följande markdown-innehåll i designen med snygg typografi och spacing. Behåll rubriker och struktur:\n\n${content.substring(
            0,
            3000
          )}`,
        },
        {
          id: "md-hero",
          label: "Som hero-sektion",
          description: "Förvandla till en hero med rubrik och CTA",
          prompt: `Använd följande text för att skapa en slagkraftig hero-sektion med stor rubrik, underrubrik och call-to-action knapp:\n\n${content.substring(
            0,
            1500
          )}`,
        },
      ];
    }

    // Default for plain text
    return [
      createSiteAction,
      {
        id: "text-about",
        label: "Om oss-sektion",
        description: "Skapa en About-sektion med texten",
        prompt: `Skapa en snygg "Om oss"-sektion med följande text. Använd bra typografi och eventuellt en bild/ikon:\n\n${content.substring(
          0,
          2000
        )}`,
      },
      {
        id: "text-content",
        label: "Innehållssektion",
        description: "En ren innehållssektion",
        prompt: `Lägg till följande text som en innehållssektion med bra typografi, läsbarhet och spacing:\n\n${content.substring(
          0,
          2000
        )}`,
      },
      {
        id: "text-summary",
        label: "Summera & lägg till",
        description: "AI summerar och lägger till det viktigaste",
        prompt: `Läs följande text, extrahera de viktigaste punkterna och skapa en snygg sektion med bullet points eller kort sammanfattning:\n\n${content.substring(
          0,
          3000
        )}`,
      },
      {
        id: "text-testimonial",
        label: "Som citat/testimonial",
        description: "Förvandla till ett snyggt citat",
        prompt: `Förvandla följande text till en snygg testimonial/citat-sektion med citattecken och eventuellt en avatar:\n\n${content.substring(
          0,
          1000
        )}`,
      },
    ];
  };

  /**
   * Determine content type from file
   */
  const getContentType = (file: File): "text" | "json" | "markdown" | "pdf" => {
    if (file.type === "application/json" || file.name.endsWith(".json")) {
      return "json";
    }
    if (file.type === "text/markdown" || file.name.endsWith(".md")) {
      return "markdown";
    }
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      return "pdf";
    }
    return "text";
  };

  /**
   * Handle file drop/selection
   */
  const handleFile = async (file: File) => {
    // Validate file type
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
    setProcessedFile(null);
    setSelectedSuggestion(null);
    setUsageMode("place");
    setPlacement("auto");
    setCustomPlacement("");
    setStorageStatus("idle");
    setStorageMessage(null);

    try {
      // Read file content
      const content = await readFileContent(file);

      if (!content || content.trim().length === 0) {
        setError("Filen verkar vara tom");
        return;
      }

      const contentType = getContentType(file);

      // Get AI suggestions
      const { suggestions, summary } = await getAISuggestions(
        content,
        file.name,
        contentType
      );

      setProcessedFile({
        filename: file.name,
        content,
        contentType,
        suggestions,
        summary,
      });
    } catch (err) {
      console.error("[TextFilesPanel] Error processing file:", err);
      setError(
        err instanceof Error ? err.message : "Kunde inte bearbeta filen"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle suggestion selection
   */
  const handleSuggestionSelect = (suggestion: TextSuggestion) => {
    setSelectedSuggestion(suggestion.id);
    const finalPrompt = buildPromptWithPlacement(suggestion.prompt);
    onPromptGenerated(finalPrompt);
  };

  /**
   * Drag & drop handlers
   */
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
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * Clear current file
   */
  const handleClear = () => {
    setProcessedFile(null);
    setSelectedSuggestion(null);
    setError(null);
    setUsageMode("place");
    setPlacement("auto");
    setCustomPlacement("");
    setStorageStatus("idle");
    setStorageMessage(null);
  };

  return (
    <div
      className={cn(
        "border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-white">
            Textfiler & PDF
          </span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            Smart
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Drop zone */}
          {!processedFile && !isProcessing && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !disabled && fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-gray-700 hover:border-gray-600",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Upload className="h-6 w-6 text-gray-500 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                Dra in en textfil eller PDF här
              </p>
              <p className="text-[10px] text-gray-600 mt-1">
                .txt, .md, .json, .pdf
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

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-amber-400 mb-2" />
              <p className="text-sm text-gray-400">Analyserar filen...</p>
              <p className="text-[10px] text-gray-600">
                AI föreslår hur du kan använda innehållet
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Processed file with suggestions */}
          {processedFile && (
            <div className="space-y-3">
              {/* File info */}
              <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                <div className="flex items-center gap-2">
                  <FileType className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-white truncate max-w-[150px]">
                    {processedFile.filename}
                  </span>
                </div>
                <button
                  onClick={handleClear}
                  className="text-gray-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Summary */}
              {processedFile.summary && (
                <p className="text-xs text-gray-400 italic">
                  {processedFile.summary}
                </p>
              )}

              {/* Action mode */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Vad vill du göra?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setUsageMode("place")}
                    className={cn(
                      "text-left p-2 rounded border transition-colors",
                      usageMode === "place"
                        ? "border-amber-500 bg-amber-500/10 text-white"
                        : "border-gray-700 hover:border-gray-600 text-gray-300"
                    )}
                  >
                    <span className="text-xs font-medium">
                      Placera på sidan
                    </span>
                    <p className="text-[10px] text-gray-500">
                      Skapa sektion och lägg in texten
                    </p>
                  </button>
                  <button
                    onClick={() => setUsageMode("store")}
                    className={cn(
                      "text-left p-2 rounded border transition-colors",
                      usageMode === "store"
                        ? "border-amber-500 bg-amber-500/10 text-white"
                        : "border-gray-700 hover:border-gray-600 text-gray-300"
                    )}
                  >
                    <span className="text-xs font-medium">
                      Spara i textlager
                    </span>
                    <p className="text-[10px] text-gray-500">
                      Lagra texten för senare
                    </p>
                  </button>
                </div>
                {usageMode === "store" && (
                  <p className="text-[10px] text-gray-500">
                    Texten sparas lokalt i din webbläsare tills vidare.
                  </p>
                )}
              </div>

              {/* Placement selection */}
              {usageMode === "place" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Var ska texten placeras?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PLACEMENT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setPlacement(option.id)}
                        className={cn(
                          "text-left p-2 rounded border transition-colors",
                          placement === option.id
                            ? "border-amber-500 bg-amber-500/10 text-white"
                            : "border-gray-700 hover:border-gray-600 text-gray-300"
                        )}
                      >
                        <span className="text-xs font-medium">
                          {option.label}
                        </span>
                        <p className="text-[10px] text-gray-500">
                          {option.helper}
                        </p>
                      </button>
                    ))}
                  </div>
                  {placement === "custom" && (
                    <Input
                      value={customPlacement}
                      onChange={(e) => setCustomPlacement(e.target.value)}
                      placeholder="Ex: Efter sektionen 'Tjänster'"
                      className="h-8 text-xs border-gray-700 bg-gray-800/50 text-white"
                    />
                  )}
                </div>
              )}

              {/* Quick Actions */}
              {processedFile.suggestions.some((s) => s.isQuickAction) &&
                usageMode === "place" && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                      Snabbåtgärd
                    </p>
                    {processedFile.suggestions
                      .filter((s) => s.isQuickAction)
                      .map((suggestion) => (
                        <button
                          key={suggestion.id}
                          onClick={() => handleSuggestionSelect(suggestion)}
                          disabled={disabled}
                          className={cn(
                            "w-full text-left p-3 rounded border-2 transition-colors",
                            selectedSuggestion === suggestion.id
                              ? "border-purple-500 bg-purple-500/20"
                              : "border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20",
                            disabled && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-white">
                              {suggestion.label}
                            </span>
                            {selectedSuggestion === suggestion.id && (
                              <Check className="h-4 w-4 text-purple-400" />
                            )}
                          </div>
                          <p className="text-xs text-gray-300 mt-1">
                            {suggestion.description}
                          </p>
                        </button>
                      ))}
                  </div>
                )}

              {/* Regular Suggestions */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {usageMode === "store"
                    ? "Använd ett spar-alternativ eller en prompt för lagring"
                    : "Eller välj hur du vill använda innehållet:"}
                </p>

                <div className="space-y-1.5">
                  {processedFile.suggestions
                    .filter((s) => !s.isQuickAction)
                    .map((suggestion) => (
                      <button
                        key={suggestion.id}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        disabled={disabled}
                        className={cn(
                          "w-full text-left p-2 rounded border transition-colors",
                          selectedSuggestion === suggestion.id
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/50",
                          disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-white">
                            {suggestion.label}
                          </span>
                          {selectedSuggestion === suggestion.id && (
                            <Check className="h-3 w-3 text-amber-400" />
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {suggestion.description}
                        </p>
                      </button>
                    ))}
                </div>
              </div>

              {/* Storage action */}
              {usageMode === "store" && (
                <div className="space-y-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-center border-amber-500 text-amber-100 hover:bg-amber-500/10"
                    onClick={handleSaveToStorage}
                    disabled={storageStatus === "saving"}
                  >
                    {storageStatus === "saving"
                      ? "Sparar..."
                      : "Spara texten i textlager"}
                  </Button>
                  {storageMessage && (
                    <p
                      className={cn(
                        "text-[10px]",
                        storageStatus === "error"
                          ? "text-red-400"
                          : "text-green-400"
                      )}
                    >
                      {storageMessage}
                    </p>
                  )}
                </div>
              )}

              {/* Selected prompt preview */}
              {selectedSuggestion && (
                <p className="text-[10px] text-green-400">
                  ✓ Prompten har lagts till i input-fältet
                </p>
              )}
            </div>
          )}

          {/* Help text */}
          {!processedFile && !isProcessing && !error && (
            <p className="text-[10px] text-gray-600 text-center">
              AI hjälper dig formatera texten för din sajt
            </p>
          )}
        </div>
      )}
    </div>
  );
}
