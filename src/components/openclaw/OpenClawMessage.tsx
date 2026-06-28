"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  applyOpenClawTextFieldAction,
  getOpenClawTextFieldContext,
  isOpenClawSendReady,
  parseOpenClawMessage,
  triggerOpenClawSend,
  type OpenClawFillTextFieldAction,
  type OpenClawRequestRepairAction,
  type OpenClawStartBugHuntAction,
} from "@/lib/openclaw/text-field-actions";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { sortEngineVersionsNewestFirst } from "@/lib/db/engine-version-lifecycle";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import {
  consumeMandateStep,
  createArmedMandate,
  DEFAULT_FOLLOWUP_COUNT,
  describeMandate,
  isMandateActive,
} from "@/lib/openclaw/debug/armed-mandate";

export function OpenClawMessage({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const debugEnabled = useOpenClawStore((s) => s.debugEnabled);
  const armedMandate = useOpenClawStore((s) => s.armedMandate);
  const parsed = parseOpenClawMessage(msg.content);
  const action = !isUser ? parsed.action : null;
  const shouldRenderBubble = Boolean(parsed.visibleContent) || !action;

  // Armed-autonomy gate (Mode A): only auto-send when OC_DEBUG is on AND the
  // user has armed a still-active mandate AND the action explicitly asked to
  // submit. Otherwise a `submit:true` action degrades to the normal manual fill
  // suggestion (fill but never send) — defense in depth.
  const canArmedSend =
    !isUser &&
    action?.type === "fill_text_field" &&
    action.submit === true &&
    debugEnabled &&
    isMandateActive(armedMandate);

  return (
    <div className={cn("flex w-full min-w-0", isUser ? "justify-end" : "justify-start")}>
      <div className="min-w-0 max-w-[85%] space-y-2">
        {shouldRenderBubble ? (
          <div
            className={cn(
              "min-w-0 overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word",
              isUser
                ? "rounded-br-md bg-cyan-400 text-slate-950"
                : "rounded-bl-md border border-white/10 bg-white/5 text-slate-100",
            )}
          >
            {parsed.visibleContent || (
              <span className="inline-flex items-center gap-1 opacity-60">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-200/70 [animation-delay:300ms]" />
              </span>
            )}
          </div>
        ) : null}

        {!isUser && action?.type === "fill_text_field" ? (
          canArmedSend ? (
            <OpenClawArmedSendCard
              key={`armed:${action.target}:${action.value}`}
              action={action}
            />
          ) : (
            <OpenClawFillTextFieldCard
              key={`${action.target}:${action.value}`}
              action={action}
            />
          )
        ) : null}

        {!isUser && action?.type === "request_repair" ? (
          <OpenClawRepairRequestCard key="request_repair" action={action} />
        ) : null}

        {!isUser && action?.type === "start_bug_hunt" ? (
          <OpenClawStartBugHuntCard
            key="start_bug_hunt"
            action={action}
            debugEnabled={debugEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}

function OpenClawFillTextFieldCard({
  action,
}: {
  action: OpenClawFillTextFieldAction;
}) {
  const [actionState, setActionState] = useState<
    "pending" | "approved" | "declined" | "failed"
  >("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const targetContext = getOpenClawTextFieldContext(action.target);
  const actionLabel = action.label || targetContext?.label || action.target;

  const handleApprove = () => {
    const result = applyOpenClawTextFieldAction(action);
    if (!result.ok) {
      setActionState("failed");
      setActionError(result.error ?? "Kunde inte fylla fältet.");
      return;
    }
    setActionState("approved");
    setActionError(null);
  };

  const handleDecline = () => {
    setActionState("declined");
    setActionError(null);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-200/80">
        Fältförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {targetContext?.canWrite === false
          ? "Fältet är låst just nu. Om det blir skrivbart kan du prova igen."
          : "Jag kan lägga in den här texten i fältet när du godkänner."}
      </p>
      <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 whitespace-pre-wrap wrap-break-word text-slate-200">
        {action.value}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actionState === "pending" ? (
          <>
            <button
              type="button"
              onClick={handleApprove}
              disabled={targetContext?.canWrite === false}
              className="rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Godkänn och fyll
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              Avvisa
            </button>
          </>
        ) : null}

        {actionState === "approved" ? (
          <p className="text-xs text-emerald-300">
            Texten lades in i {actionLabel.toLowerCase()}.
          </p>
        ) : null}

        {actionState === "declined" ? (
          <p className="text-xs text-slate-300">Förslaget avvisades.</p>
        ) : null}

        {actionState === "failed" ? (
          <p className="text-xs text-rose-300">
            {actionError ?? "Kunde inte fylla fältet."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Arming-handshake card (Mode A). When OC_DEBUG is on, OpenClaw's structured
 * `start_bug_hunt` confirmation arms a bounded mandate so the subsequent
 * auto-send steps are authorized. Outside debug it is inert (shows nothing
 * actionable). The user's own message already arms via the chat hook; this is
 * OpenClaw's explicit, visible confirmation of the mandate.
 */
function OpenClawStartBugHuntCard({
  action,
  debugEnabled,
}: {
  action: OpenClawStartBugHuntAction;
  debugEnabled: boolean;
}) {
  const armedMandate = useOpenClawStore((s) => s.armedMandate);
  const setArmedMandate = useOpenClawStore((s) => s.setArmedMandate);
  const armedRef = useRef(false);

  useEffect(() => {
    if (!debugEnabled || armedRef.current) return;
    armedRef.current = true;
    setArmedMandate(
      createArmedMandate({
        mode: action.mode ?? "followups",
        count: action.count ?? DEFAULT_FOLLOWUP_COUNT,
        reason: action.reason ?? "OpenClaw bug-hunt mandate",
      }),
    );
  }, [debugEnabled, action, setArmedMandate]);

  if (!debugEnabled) {
    return (
      <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-slate-100">
        <p className="text-xs leading-5 text-slate-300">
          Debug-läge är av — armerad autonomi är inaktiverad. (Aktivera OC_DEBUG.)
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-2xl border border-fuchsia-400/25 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fuchsia-200/80">
        Armerad bug-hunt
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{describeMandate(armedMandate)}</p>
      {action.reason ? (
        <p className="mt-1 text-xs leading-5 text-slate-300">{action.reason}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-slate-400">
        Skriv &quot;stopp&quot; när som helst för att avbryta.
      </p>
    </div>
  );
}

/**
 * Armed-autonomy auto-send card (Mode A). Rendered only when OC_DEBUG is on and
 * a user-armed mandate is active. On mount it fills the builder prompt, waits
 * for the real send button to become enabled, clicks it, and consumes one step
 * of the mandate. OpenClaw never writes files — it drives the same visible send
 * the user would click. Bounded by the mandate counter; no manual approval in
 * armed mode (the user already armed it), but it still respects a disabled/busy
 * composer and gives up after a short window.
 */
function OpenClawArmedSendCard({
  action,
}: {
  action: OpenClawFillTextFieldAction;
}) {
  const setArmedMandate = useOpenClawStore((s) => s.setArmedMandate);
  const [state, setState] = useState<"sending" | "sent" | "failed">("sending");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // ~2.5s waiting for React to enable the send button
    let timer: ReturnType<typeof setTimeout> | null = null;

    // All state updates run inside async callbacks (never synchronously in the
    // effect body) so we don't trigger cascading renders.
    const begin = () => {
      if (cancelled) return;
      const fill = applyOpenClawTextFieldAction(action);
      if (!fill.ok) {
        setState("failed");
        setError(fill.error ?? "Kunde inte fylla fältet.");
        return;
      }
      timer = setTimeout(trySend, 100);
    };

    const trySend = () => {
      if (cancelled) return;
      attempts += 1;
      if (isOpenClawSendReady(action.target)) {
        const result = triggerOpenClawSend(action.target);
        if (result.ok) {
          setState("sent");
          // Consume one authorized step; clears the mandate when exhausted.
          setArmedMandate(
            consumeMandateStep(useOpenClawStore.getState().armedMandate),
          );
          return;
        }
      }
      if (attempts >= MAX_ATTEMPTS) {
        setState("failed");
        setError("Send-knappen blev aldrig klar (composern kan vara upptagen).");
        return;
      }
      timer = setTimeout(trySend, 100);
    };

    timer = setTimeout(begin, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [action, setArmedMandate]);

  return (
    <div className="min-w-0 rounded-2xl border border-fuchsia-400/25 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fuchsia-200/80">
        Armerad autonomi · auto-send
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {action.label || "Skickar follow-up i buildern"}
      </p>
      <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 whitespace-pre-wrap wrap-break-word text-slate-200">
        {action.value}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "sending" ? (
          <p className="text-xs text-slate-300">Fyller fältet och skickar…</p>
        ) : null}
        {state === "sent" ? (
          <p className="text-xs text-emerald-300">
            Skickad. Jag läser resultatet och fortsätter enligt mandatet.
          </p>
        ) : null}
        {state === "failed" ? (
          <p className="text-xs text-rose-300">
            {error ?? "Kunde inte skicka automatiskt."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function readActiveBuilderTarget(): { chatId: string; versionId: string } | null {
  if (typeof window === "undefined") return null;
  const ctx = window.__SITEMASKIN_CONTEXT;
  const chatId = typeof ctx?.chatId === "string" ? ctx.chatId : null;
  const versionId =
    typeof ctx?.activeVersionId === "string" ? ctx.activeVersionId : null;
  if (!chatId || !versionId) return null;
  return { chatId, versionId };
}

/**
 * The client autofix flow only repairs the LATEST version (useAutoFix silently
 * no-ops on an older selected version). Check before dispatch so the card never
 * reports a false success when the user is viewing version history (Codex P2).
 * Fail-open on network/unknown: useAutoFix re-checks latest itself, so we only
 * hard-block the clear "not latest" case.
 */
async function isLatestChatVersion(
  chatId: string,
  versionId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${engineChatBaseUrl(chatId)}/versions`);
    if (!res.ok) return true;
    const data = (await res.json().catch(() => null)) as
      | {
          versions?: Array<{
            versionId?: string | null;
            id?: string | null;
            versionNumber?: number | null;
            createdAt?: string | null;
          }>;
        }
      | null;
    const versions = Array.isArray(data?.versions) ? data.versions : [];
    if (versions.length === 0) return true;
    const newest = sortEngineVersionsNewestFirst(versions)[0];
    const newestId = newest?.versionId || newest?.id || null;
    return !newestId || newestId === versionId;
  } catch {
    return true;
  }
}

function OpenClawRepairRequestCard({
  action,
}: {
  action: OpenClawRequestRepairAction;
}) {
  const [actionState, setActionState] = useState<
    "pending" | "working" | "approved" | "declined" | "failed"
  >("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const target = readActiveBuilderTarget();
  const actionLabel = action.label || "Starta reparation av den här versionen";

  const handleApprove = async () => {
    const current = readActiveBuilderTarget();
    if (!current) {
      setActionState("failed");
      setActionError(
        "Ingen aktiv version hittades. Öppna versionen i buildern och försök igen.",
      );
      return;
    }
    setActionState("working");
    setActionError(null);

    // Codex P2: only the latest version can be repaired — block (don't fake
    // success) when an older version is selected.
    if (!(await isLatestChatVersion(current.chatId, current.versionId))) {
      setActionState("failed");
      setActionError(
        "Reparation kan bara startas på den senaste versionen. Välj den senaste versionen i historiken och försök igen.",
      );
      return;
    }

    // Reuse the vetted client repair flow: the builder's useAutoFix listener
    // picks this up (manual trigger), enriches context, runs the lease-/base-
    // bound repair, and produces a new version awaiting acceptance. OC never
    // writes files itself.
    dispatchAutoFixEvent({
      chatId: current.chatId,
      versionId: current.versionId,
      manual: true,
      reasons: ["openclaw_requested_repair"],
    });
    setActionState("approved");
    setActionError(null);
  };

  const handleDecline = () => {
    setActionState("declined");
    setActionError(null);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-amber-400/20 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-200/80">
        Reparationsförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {target
          ? "Jag kan starta en reparation av den aktiva versionen när du godkänner. Den körs som ett vanligt fix-pass och skapar en ny version som du sedan godkänner — jag ändrar aldrig filer direkt."
          : "Öppna en version i buildern först — reparation kan bara startas där."}
      </p>
      {action.reason ? (
        <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 whitespace-pre-wrap wrap-break-word text-slate-200">
          {action.reason}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actionState === "pending" ? (
          <>
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={!target}
              className="rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Godkänn och starta reparation
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              Avvisa
            </button>
          </>
        ) : null}

        {actionState === "working" ? (
          <p className="text-xs text-slate-300">Startar reparation…</p>
        ) : null}

        {actionState === "approved" ? (
          <p className="text-xs text-emerald-300">
            Reparation startad på den senaste versionen. En ny version dyker upp
            för godkännande när den är klar.
          </p>
        ) : null}

        {actionState === "declined" ? (
          <p className="text-xs text-slate-300">Förslaget avvisades.</p>
        ) : null}

        {actionState === "failed" ? (
          <p className="text-xs text-rose-300">
            {actionError ?? "Kunde inte starta reparationen."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
