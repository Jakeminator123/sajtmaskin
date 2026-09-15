"use client";

import { useCallback, useState } from "react";
import {
  FOLLOWUP_QUESTION,
  currentFollowupId,
  type KostnadsfriFollowupId,
  type KostnadsfriFollowupSession,
} from "@/lib/kostnadsfri/agent-followups";
import {
  KOSTNADSFRI_FOLLOWUP_CONTINUE_LABEL,
  KOSTNADSFRI_FOLLOWUP_SKIP_LABEL,
} from "@/lib/kostnadsfri/agent-campaign-script";

interface FollowupStepProps {
  session: KostnadsfriFollowupSession;
  error?: string | null;
  onAnswer: (text: string) => void;
  onSkipCurrent: () => void;
  onSkipAll: () => void;
  onContinue: () => void;
}

export function FollowupStep({
  session,
  error,
  onAnswer,
  onSkipCurrent,
  onSkipAll,
  onContinue,
}: FollowupStepProps) {
  const [draft, setDraft] = useState("");
  const currentId: KostnadsfriFollowupId | null = currentFollowupId(session);
  const question = currentId ? FOLLOWUP_QUESTION[currentId] : null;
  const remaining = Math.max(0, session.questionIds.length - session.currentIndex);

  const submitAnswer = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onAnswer(text);
    setDraft("");
  }, [draft, onAnswer]);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        Följdfrågor
      </p>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">
        {question ?? "Sajtagenten är redo att bygga"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {question
          ? `Fråga ${session.currentIndex + 1} av ${session.questionIds.length}. Svara här, i chatten, eller hoppa över.`
          : "Inga extra frågor. Fortsätt när du vill — bygget startar inte av sig självt."}
      </p>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {question ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitAnswer();
            }
          }}
          rows={3}
          className="mb-4 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-brand-teal"
          placeholder="Skriv svaret, eller prata med Sajtagenten…"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {question ? (
          <button
            type="button"
            onClick={submitAnswer}
            disabled={!draft.trim()}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
          >
            Svara
          </button>
        ) : null}
        <button
          type="button"
          onClick={onContinue}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium"
        >
          {KOSTNADSFRI_FOLLOWUP_CONTINUE_LABEL}
        </button>
        {question ? (
          <button
            type="button"
            onClick={onSkipCurrent}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium"
          >
            Hoppa över denna
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSkipAll}
          className="rounded-full px-4 py-2 text-sm text-muted-foreground"
        >
          {KOSTNADSFRI_FOLLOWUP_SKIP_LABEL}
        </button>
      </div>
      {remaining > 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">{remaining} frågor kvar</p>
      ) : null}
    </div>
  );
}
