"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const FEEDBACK_CATEGORIES: { key: string; label: string }[] = [
  { key: "wrong-style", label: "Fel stil" },
  { key: "wrong-structure", label: "Fel struktur" },
  { key: "wrong-content", label: "Fel innehåll" },
  { key: "wrong-integration", label: "Fel integration" },
  { key: "preview-broken", label: "Förhandsgranskning trasig" },
];

type VersionFeedbackProps = {
  chatId: string;
  versionId: string;
  className?: string;
};

export function VersionFeedback({ chatId, versionId, className }: VersionFeedbackProps) {
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCategory = (key: string) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canSubmit =
    rating === "positive" || (rating === "negative" && categories.size > 0);

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating,
            categories: rating === "negative" ? Array.from(categories) : undefined,
            comment: comment.trim() || undefined,
          }),
        },
      );

      if (!res.ok) throw new Error("Failed to submit feedback");
      setSubmitted(true);
    } catch (err) {
      console.error("[VersionFeedback] Submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center gap-2 text-sm",
          className,
        )}
      >
        <span className="font-medium">Tack för din feedback!</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Hur blev resultatet?</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className={cn(
              "border-zinc-600 hover:bg-emerald-500/20 hover:border-emerald-500/50",
              rating === "positive" && "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
            )}
            onClick={() => setRating("positive")}
            aria-label="Bra resultat"
            title="Bra resultat"
          >
            <ThumbsUp className="size-3" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className={cn(
              "border-zinc-600 hover:bg-red-500/20 hover:border-red-500/50",
              rating === "negative" && "bg-red-500/20 border-red-500/50 text-red-400",
            )}
            onClick={() => setRating("negative")}
            aria-label="Dåligt resultat"
            title="Dåligt resultat"
          >
            <ThumbsDown className="size-3" />
          </Button>
        </div>
      </div>

      {rating === "negative" && (
        <>
          <div className="flex flex-wrap gap-1">
            {FEEDBACK_CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  categories.has(key)
                    ? "border-red-500/50 bg-red-500/20 text-red-400"
                    : "border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Beskriv problemet (valfritt)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px] resize-none border-zinc-600 bg-zinc-900/60 text-sm"
          />

          <Button
            type="button"
            size="sm"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            className="h-7"
          >
            {isSubmitting ? "Skickar..." : "Skicka feedback"}
          </Button>
        </>
      )}

      {rating === "positive" && (
        <Button
          type="button"
          size="sm"
          disabled={isSubmitting}
          onClick={handleSubmit}
          className="h-7"
        >
          {isSubmitting ? "Skickar..." : "Skicka feedback"}
        </Button>
      )}
    </div>
  );
}
