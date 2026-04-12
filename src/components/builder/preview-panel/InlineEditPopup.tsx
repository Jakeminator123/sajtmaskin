"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ImageIcon, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ElementMapItem } from "@/lib/builder/types";
import { cn } from "@/lib/utils";

interface InlineEditPopupProps {
  element: ElementMapItem;
  /** Position relative to the preview container */
  posX: number;
  posY: number;
  containerWidth: number;
  containerHeight: number;
  onSave: (prompt: string, file?: File) => void;
  onClose: () => void;
}

const IMAGE_TAGS = new Set(["img"]);
const POPUP_W = 320;
const POPUP_MAX_H = 300;

export function InlineEditPopup({
  element,
  posX,
  posY,
  containerWidth,
  containerHeight,
  onSave,
  onClose,
}: InlineEditPopupProps) {
  const isImage = IMAGE_TAGS.has(element.tag.toLowerCase());
  const popupRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [newText, setNewText] = useState(element.text?.trim() ?? "");
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Position: try to place near click, but keep within bounds
  const left = Math.min(Math.max(8, posX - POPUP_W / 2), containerWidth - POPUP_W - 8);
  const top = Math.min(Math.max(8, posY + 12), containerHeight - POPUP_MAX_H - 8);

  useEffect(() => {
    if (!isImage) textareaRef.current?.focus();
  }, [isImage]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside as EventListener);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside as EventListener);
    };
  }, [onClose]);

  const handleTextSave = useCallback(() => {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === (element.text?.trim() ?? "")) {
      onClose();
      return;
    }
    const oldSnippet = (element.text?.trim() ?? "").slice(0, 80);
    const sectionHint = element.selector
      ? ` (element: <${element.tag}>)`
      : "";
    const prompt = `Ändra texten "${oldSnippet}" till "${trimmed}"${sectionHint}`;
    onSave(prompt);
  }, [newText, element, onSave, onClose]);

  const handleFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) setDroppedFile(file);
  }, []);

  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) setDroppedFile(file);
  }, []);

  const handleImageSave = useCallback(() => {
    const locationHint = element.className
      ? ` i närheten av "${element.className.split(/\s+/).slice(0, 2).join(" ")}"`
      : "";
    const prompt = droppedFile
      ? `Byt ut bilden${locationHint} mot den bifogade bilden`
      : `Byt ut bilden${locationHint} mot en annan passande bild`;
    onSave(prompt, droppedFile ?? undefined);
  }, [element, droppedFile, onSave]);

  return (
    <div
      ref={popupRef}
      className="absolute z-40 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left,
        top,
        width: POPUP_W,
        maxHeight: POPUP_MAX_H,
      }}
    >
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            {isImage ? (
              <><ImageIcon className="h-3.5 w-3.5 text-primary" /> Byt bild</>
            ) : (
              <><Pencil className="h-3.5 w-3.5 text-primary" /> Redigera text</>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Stäng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-3">
          {isImage ? (
            /* Image mode */
            <div className="space-y-2">
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : droppedFile
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/40",
                )}
              >
                {droppedFile ? (
                  <div className="flex items-center gap-2 text-xs text-foreground">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <span className="max-w-[200px] truncate">{droppedFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setDroppedFile(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Dra en bild hit eller{" "}
                      <label className="cursor-pointer font-medium text-primary hover:underline">
                        välj fil
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileInput}
                        />
                      </label>
                    </p>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
                  Avbryt
                </Button>
                <Button size="sm" onClick={handleImageSave} className="h-7 text-xs">
                  Byt bild
                </Button>
              </div>
            </div>
          ) : (
            /* Text mode */
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleTextSave();
                }}
                rows={Math.min(Math.max(2, Math.ceil((element.text?.length ?? 0) / 40)), 6)}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="Skriv ny text..."
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {newText.length} tecken · ⌘↵ spara
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
                    Avbryt
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleTextSave}
                    disabled={!newText.trim() || newText.trim() === (element.text?.trim() ?? "")}
                    className="h-7 text-xs"
                  >
                    Spara
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
