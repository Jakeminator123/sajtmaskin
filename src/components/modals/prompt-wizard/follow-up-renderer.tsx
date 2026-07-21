"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { INPUT_CLASS } from "@/components/modals/prompt-wizard/constants";
import type { FollowUpQuestion } from "@/components/modals/prompt-wizard/types";

// ── FollowUpRenderer ──────────────────────────────────────────────

export function isFollowUpQuestionVisible(
  question: FollowUpQuestion,
  answers: Record<string, string>,
): boolean {
  if (!question.dependsOn) return true;
  const dep = question.dependsOn;
  const source = (answers[dep.answerId] || "").toLowerCase();
  if (dep.includes?.length) {
    const hasAny = dep.includes.some((token) => source.includes(token.toLowerCase()));
    if (!hasAny) return false;
  }
  if (dep.excludes?.length) {
    const hasExcluded = dep.excludes.some((token) => source.includes(token.toLowerCase()));
    if (hasExcluded) return false;
  }
  return true;
}

export function getVisibleFollowUpQuestions(
  questions: FollowUpQuestion[],
  answers: Record<string, string>,
): FollowUpQuestion[] {
  return questions.filter((q) => isFollowUpQuestionVisible(q, answers));
}

export function FollowUpRenderer({
  questions,
  answers,
  onAnswer,
}: {
  questions: FollowUpQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
}) {
  const visibleQuestions = useMemo(() => {
    return getVisibleFollowUpQuestions(questions, answers);
  }, [questions, answers]);

  if (!visibleQuestions.length) return null;

  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Anpassade frågor för ert sajtbygge
      </div>
      {visibleQuestions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="text-sm text-foreground">
            {q.text}
            {q.priority === "high" ? (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">Viktig</span>
            ) : null}
          </label>
          {q.type === "text" && (
            <input
              type="text"
              value={answers[q.id] || ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={q.placeholder || ""}
              className={INPUT_CLASS + " text-sm"}
            />
          )}
          {q.type === "select" && q.options && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onAnswer(q.id, opt)}
                  className={`rounded-full border px-3 py-1 text-xs transition-all ${
                    answers[q.id] === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {q.type === "chips" && q.options && (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const selected = (answers[q.id] || "").split(", ").filter(Boolean);
                const isActive = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      const next = isActive
                        ? selected.filter((s) => s !== opt)
                        : [...selected, opt];
                      onAnswer(q.id, next.join(", "));
                    }}
                    className={`rounded-full border px-3 py-1 text-xs transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {isActive ? "✓" : "+"} {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
