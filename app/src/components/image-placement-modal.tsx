"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Image as ImageIcon,
  Layout,
  Grid3x3,
  Package,
  Sparkles,
  Layers,
  X,
} from "lucide-react";
import { analyzeImagePlacements } from "@/lib/image-placement-analyzer";

interface ImagePlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (option: string, customPrompt?: string) => void;
  imageUrl: string;
  currentCode?: string | null;
}

// Icon mapping for suggestions
const getIcon = (id: string) => {
  if (id.includes("background") || id.includes("bakgrund"))
    return <Layers className="h-5 w-5" />;
  if (id.includes("hero")) return <ImageIcon className="h-5 w-5" />;
  if (id.includes("gallery") || id.includes("galleri"))
    return <Grid3x3 className="h-5 w-5" />;
  if (id.includes("product") || id.includes("produkt"))
    return <Package className="h-5 w-5" />;
  if (id.includes("logo")) return <Sparkles className="h-5 w-5" />;
  if (id.includes("section") || id.includes("sektion"))
    return <Layout className="h-5 w-5" />;
  return <ImageIcon className="h-5 w-5" />;
};

export function ImagePlacementModal({
  isOpen,
  onClose,
  onConfirm,
  imageUrl,
  currentCode,
}: ImagePlacementModalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");

  // Analyze code to get dynamic suggestions
  const suggestions = useMemo(() => {
    return analyzeImagePlacements(currentCode || null, imageUrl);
  }, [currentCode, imageUrl]);

  // Handle cancel/close
  const handleCancel = useCallback(() => {
    setSelectedOption(null);
    setCustomPrompt("");
    onClose();
  }, [onClose]);

  // Listen for dialog close events (escape key, backdrop click)
  useEffect(() => {
    if (!isOpen) return;

    const handleClose = () => {
      handleCancel();
    };

    window.addEventListener("dialog-close", handleClose);
    return () => window.removeEventListener("dialog-close", handleClose);
  }, [isOpen, handleCancel]);

  // Handle confirm
  const handleConfirm = () => {
    if (!selectedOption) return;

    if (selectedOption === "custom") {
      if (!customPrompt.trim()) {
        return;
      }
      onConfirm(selectedOption, customPrompt);
    } else {
      const suggestion = suggestions.find((s) => s.id === selectedOption);
      if (suggestion) {
        onConfirm(selectedOption, suggestion.prompt);
      }
    }

    // Reset state
    setSelectedOption(null);
    setCustomPrompt("");
    onClose();
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[600px]">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute right-3 top-3 p-1 text-gray-500 hover:text-gray-300 transition-colors z-10"
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader>
          <DialogTitle>Var ska bilden placeras?</DialogTitle>
          <DialogDescription>
            Välj var och hur bilden ska användas i designen
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Image preview */}
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Preview"
              className="max-h-32 rounded-lg border border-gray-700"
            />
          </div>

          {/* Dynamic placement options based on code analysis */}
          <div className="grid grid-cols-2 gap-3">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => setSelectedOption(suggestion.id)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedOption === suggestion.id
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-gray-700 hover:border-gray-600 bg-gray-800/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 ${
                      selectedOption === suggestion.id
                        ? "text-teal-400"
                        : "text-gray-500"
                    }`}
                  >
                    {getIcon(suggestion.id)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-white mb-1">
                      {suggestion.label}
                    </div>
                    <div className="text-xs text-gray-400">
                      {suggestion.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* Custom option always available */}
            <button
              onClick={() => setSelectedOption("custom")}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                selectedOption === "custom"
                  ? "border-teal-500 bg-teal-500/10"
                  : "border-gray-700 hover:border-gray-600 bg-gray-800/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 ${
                    selectedOption === "custom"
                      ? "text-teal-400"
                      : "text-gray-500"
                  }`}
                >
                  <X className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-white mb-1">
                    Anpassat
                  </div>
                  <div className="text-xs text-gray-400">
                    Beskriv själv var bilden ska användas
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Custom prompt input */}
          {selectedOption === "custom" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Beskriv var och hur bilden ska användas:
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="T.ex. 'Använd som bakgrund i hero-sektionen' eller 'Lägg till som tredje bild i galleriet'"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                rows={3}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex justify-end gap-2 pt-4 border-t border-gray-800">
          <Button variant="ghost" onClick={handleCancel}>
            Avbryt
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !selectedOption ||
              (selectedOption === "custom" && !customPrompt.trim())
            }
            className="bg-teal-600 hover:bg-teal-500"
          >
            Lägg till
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
