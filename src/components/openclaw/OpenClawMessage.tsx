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
import {
  describeOpenClawQuickEditOp,
  type OpenClawApplyQuickEditAction,
} from "@/lib/openclaw/quick-edit-action";
import {
  describeQuickEditHardError,
  quickEditChatFiles,
} from "@/lib/builder/engine-files-patch";
import { dispatchQuickEditAppliedEvent } from "@/lib/builder/quick-edit-applied-event";
import {
  readActiveBuilderTarget,
  readBuilderTurnSnapshot,
} from "@/lib/openclaw/builder-target";
import { createArmedContinuationWatch } from "@/lib/openclaw/debug/armed-continuation";
import { dispatchAutoFixEvent } from "@/lib/hooks/chat/auto-fix-events";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { sortEngineVersionsNewestFirst } from "@/lib/db/engine-version-lifecycle";
import { OPENCLAW_BUILDER_CHAT_TARGET } from "@/lib/openclaw/prepared-prompt";
import { useOpenClawStore, type OpenClawMessage as Msg } from "@/lib/openclaw/openclaw-store";
import {
  consumeMandateStep,
  describeMandate,
  isMandateActive,
} from "@/lib/openclaw/debug/armed-mandate";
import { useSmoothText } from "./useSmoothText";

/**
 * Per-message dedup for armed auto-send (Bugbot). The armed card auto-submits on
 * mount, but the card can remount (editEnabled flips after the health check, a
 * parent re-render, or the manual→armed card swap). A mount-scoped ref alone
 * would let the SAME assistant `submit:true` action fire again and spend extra
 * mandate steps. This module-scoped set records message ids that have already
 * auto-sent in this session, so each action auto-sends at most once.
 */
const consumedArmedSends = new Set<string>();

/**
 * Record a successful builder-composer fill so the composer can tag an
 * UNEDITED send of exactly this content as `promptSource: "openclaw-prepared"`
 * (see `prepared-prompt.ts`). Only when the act gate (OC_EDIT → store
 * `editEnabled`) is on — without it the fast-lane tag must never be set.
 */
function recordOpenClawPreparedFill(action: OpenClawFillTextFieldAction) {
  const { editEnabled, setPreparedFill } = useOpenClawStore.getState();
  if (!editEnabled) return;
  if (action.target !== OPENCLAW_BUILDER_CHAT_TARGET) return;
  setPreparedFill({ target: OPENCLAW_BUILDER_CHAT_TARGET, value: action.value });
}

export function OpenClawMessage({
  msg,
  streaming = false,
}: {
  msg: Msg;
  /** True only for the assistant message currently receiving SSE chunks. */
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  const editEnabled = useOpenClawStore((s) => s.editEnabled);
  const armedMandate = useOpenClawStore((s) => s.armedMandate);
  const parsed = parseOpenClawMessage(msg.content);
  const action = !isUser ? parsed.action : null;
  const rejectedActionReason = !isUser ? parsed.actionError : null;
  // Smooth typewriter reveal: gateway chunks arrive in bursts, so ease the
  // visible text toward the full content instead of jumping per chunk.
  const displayedContent = useSmoothText(parsed.visibleContent, streaming && !isUser);
  const isTyping = !isUser && (streaming || displayedContent.length < parsed.visibleContent.length);
  // Utan `!rejectedActionReason` skulle ett action-block som avvisats och som
  // saknar synlig text rendera väntprickarna för alltid bredvid felkortet.
  const shouldRenderBubble = Boolean(parsed.visibleContent) || (!action && !rejectedActionReason);

  // Armed-autonomy gate (Mode A): only auto-send when OC_EDIT (the act gate) is
  // on AND the user has armed a still-active mandate AND the action explicitly
  // asked to submit. Otherwise a `submit:true` action degrades to the normal
  // manual fill suggestion (fill but never send) — defense in depth.
  //
  // Bind to the CURRENT mandate (Codex P2): an older assistant action authored
  // BEFORE the active mandate was armed must never auto-send when the user later
  // arms a new mandate. Without this, re-arming remounts the armed card for every
  // prior `submit:true` message and replays stale follow-ups, consuming the new
  // mandate. Gate on the message being newer than the mandate's arming time.
  const canArmedSend =
    !isUser &&
    action?.type === "fill_text_field" &&
    action.submit === true &&
    editEnabled &&
    isMandateActive(armedMandate) &&
    !!armedMandate &&
    // Only a `followups` mandate authorizes auto-send (Bugbot). A `review_next`
    // mandate means "review my next MANUAL message" — it must never drive
    // builder generations via submit:true.
    armedMandate.mode === "followups" &&
    msg.timestamp >= armedMandate.createdAt;

  return (
    <div
      className={cn("animate-fadeIn flex w-full min-w-0", isUser ? "justify-end" : "justify-start")}
    >
      <div className="max-w-[85%] min-w-0 space-y-2">
        {shouldRenderBubble ? (
          <div
            className={cn(
              "min-w-0 overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed wrap-break-word whitespace-pre-wrap",
              isUser
                ? "rounded-br-md bg-cyan-400 text-slate-950"
                : "rounded-bl-md border border-white/10 bg-white/5 text-slate-100",
            )}
          >
            {parsed.visibleContent ? (
              // Gate on the FULL content (not the eased slice) so the waiting
              // dots never reappear after real text has already arrived.
              <>
                {displayedContent}
                {isTyping ? (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-cyan-300/80 align-text-bottom"
                  />
                ) : null}
              </>
            ) : (
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
            <OpenClawArmedSendCard key={`armed:${msg.id}`} action={action} messageId={msg.id} />
          ) : (
            <OpenClawFillTextFieldCard key={`${action.target}:${action.value}`} action={action} />
          )
        ) : null}

        {!isUser && action?.type === "request_repair" ? (
          <OpenClawRepairRequestCard key="request_repair" action={action} />
        ) : null}

        {!isUser && action?.type === "start_bug_hunt" ? (
          <OpenClawStartBugHuntCard
            key="start_bug_hunt"
            action={action}
            editEnabled={editEnabled}
          />
        ) : null}

        {!isUser && action?.type === "apply_quick_edit" ? (
          <OpenClawQuickEditCard
            key="apply_quick_edit"
            action={action}
            editEnabled={editEnabled}
            builderTarget={msg.builderTarget ?? null}
          />
        ) : null}

        {!isUser && !action && rejectedActionReason ? (
          <OpenClawRejectedActionCard key="rejected_action" reason={rejectedActionReason} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Kort för ett action-block som avvisades redan i parsningen. Det bär ingen
 * action och har inga knappar — rent informativt, så inget kan köras den här
 * vägen. Alternativet vore att blocket försvinner spårlöst ur texten.
 */
function OpenClawRejectedActionCard({ reason }: { reason: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-rose-400/20 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium tracking-[0.16em] text-rose-200/80 uppercase">
        Förslaget kunde inte tolkas
      </p>
      <p className="mt-1 text-xs leading-5 wrap-break-word text-rose-300">{reason}</p>
    </div>
  );
}

function OpenClawFillTextFieldCard({ action }: { action: OpenClawFillTextFieldAction }) {
  const [actionState, setActionState] = useState<"pending" | "approved" | "declined" | "failed">(
    "pending",
  );
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
    recordOpenClawPreparedFill(action);
    setActionState("approved");
    setActionError(null);
  };

  const handleDecline = () => {
    setActionState("declined");
    setActionError(null);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium tracking-[0.16em] text-cyan-200/80 uppercase">
        Fältförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {targetContext?.canWrite === false
          ? "Fältet är låst just nu. Om det blir skrivbart kan du prova igen."
          : "Jag kan lägga in den här texten i fältet när du godkänner."}
      </p>
      <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-slate-200">
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
          <p className="text-xs text-emerald-300">Texten lades in i {actionLabel.toLowerCase()}.</p>
        ) : null}

        {actionState === "declined" ? (
          <p className="text-xs text-slate-300">Förslaget avvisades.</p>
        ) : null}

        {actionState === "failed" ? (
          <p className="text-xs text-rose-300">{actionError ?? "Kunde inte fylla fältet."}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Arming-handshake card (Mode A). This card NEVER arms autonomy by itself — a
 * mandate is created only from the USER's explicit directive (handled in
 * useOpenClawChat). The assistant's `start_bug_hunt` action is treated purely as
 * a visible confirmation of an already-active, user-created mandate. This blocks
 * a hallucinated / prompt-injected assistant action from authorizing auto-sends
 * when the user never armed the run.
 */
function OpenClawStartBugHuntCard({
  action,
  editEnabled,
}: {
  action: OpenClawStartBugHuntAction;
  editEnabled: boolean;
}) {
  const armedMandate = useOpenClawStore((s) => s.armedMandate);

  if (!editEnabled) {
    return (
      <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-slate-100">
        <p className="text-xs leading-5 text-slate-300">
          Redigeringsläge är av — armerad autonomi är inaktiverad. (Aktivera OC_EDIT.)
        </p>
      </div>
    );
  }

  const active = isMandateActive(armedMandate);

  return (
    <div className="min-w-0 rounded-2xl border border-fuchsia-400/25 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium tracking-[0.16em] text-fuchsia-200/80 uppercase">
        {armedMandate?.mode === "review_next" ? "Armerad granskning" : "Armerad bug-hunt"}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {active
          ? describeMandate(armedMandate)
          : "Inget aktivt mandat — armera genom att uttryckligen be om det (t.ex. \u201dgör 5 follow-ups och buggranska\u201d)."}
      </p>
      {action.reason ? (
        <p className="mt-1 text-xs leading-5 text-slate-300">{action.reason}</p>
      ) : null}
      {active ? (
        <p className="mt-1 text-[11px] text-slate-400">
          Skriv &quot;stopp&quot; när som helst för att avbryta.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Armed-autonomy auto-send card (Mode A). Rendered only when OC_EDIT is on and
 * a user-armed mandate is active. On mount it fills the builder prompt, waits
 * for the real send button to become enabled, clicks it, and consumes one step
 * of the mandate. OpenClaw never writes files — it drives the same visible send
 * the user would click. Bounded by the mandate counter; no manual approval in
 * armed mode (the user already armed it), but it still respects a disabled/busy
 * composer and gives up after a short window.
 */
function OpenClawArmedSendCard({
  action,
  messageId,
}: {
  action: OpenClawFillTextFieldAction;
  messageId: string;
}) {
  const setArmedMandate = useOpenClawStore((s) => s.setArmedMandate);
  const setArmedContinuation = useOpenClawStore((s) => s.setArmedContinuation);
  const armedMandate = useOpenClawStore((s) => s.armedMandate);
  const [state, setState] = useState<"sending" | "sent" | "failed">(
    consumedArmedSends.has(messageId) ? "sent" : "sending",
  );
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Idempotency across remounts (Bugbot): if this message's action already
    // auto-sent in this session, never fire (or consume a mandate step) again.
    // Initial state is already "sent" in that case, so just bail without firing.
    if (consumedArmedSends.has(messageId)) return;
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
      recordOpenClawPreparedFill(action);
      timer = setTimeout(trySend, 100);
    };

    const trySend = () => {
      if (cancelled) return;
      attempts += 1;
      if (isOpenClawSendReady(action.target)) {
        // Read before the click: `nextSendSeq` still names the send this click
        // is about to start, so a later refusal can be matched to this turn and
        // an unrelated one cannot end the mandate.
        const preSend = readBuilderTurnSnapshot();
        const result = triggerOpenClawSend(action.target);
        if (result.ok) {
          // Mark consumed BEFORE state/mandate updates so a remount triggered by
          // the resulting re-render can't replay this same auto-send.
          consumedArmedSends.add(messageId);
          setState("sent");
          // Consume one authorized step; clears the mandate when exhausted.
          const nextMandate = consumeMandateStep(useOpenClawStore.getState().armedMandate);
          setArmedMandate(nextMandate);
          // Hand the builder turn over to the continuation handshake, but only
          // while the mandate still authorizes another step — an exhausted
          // mandate must end here, not wake OpenClaw one more time.
          if (nextMandate) {
            setArmedContinuation(createArmedContinuationWatch(preSend));
          }
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
  }, [action, setArmedMandate, setArmedContinuation, messageId]);

  return (
    <div className="min-w-0 rounded-2xl border border-fuchsia-400/25 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium tracking-[0.16em] text-fuchsia-200/80 uppercase">
        Armerad autonomi · auto-send
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {action.label || "Skickar follow-up i buildern"}
      </p>
      <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-slate-200">
        {action.value}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "sending" ? (
          <p className="text-xs text-slate-300">Fyller fältet och skickar…</p>
        ) : null}
        {state === "sent" ? (
          <p className="text-xs text-emerald-300">
            {armedMandate && armedMandate.remaining > 0
              ? `Skickad till buildern. Mandatet har ${armedMandate.remaining} steg kvar — jag fortsätter automatiskt när bygget är klart.`
              : "Skickad till buildern. Mandatet är slut, så jag stannar här."}
          </p>
        ) : null}
        {state === "failed" ? (
          <p className="text-xs text-rose-300">{error ?? "Kunde inte skicka automatiskt."}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The client autofix flow only repairs the LATEST version (useAutoFix silently
 * no-ops on an older selected version). Check before dispatch so the card never
 * reports a false success when the user is viewing version history (Codex P2).
 * Fail-open on network/unknown: useAutoFix re-checks latest itself, so we only
 * hard-block the clear "not latest" case.
 */
async function isLatestChatVersion(chatId: string, versionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${engineChatBaseUrl(chatId)}/versions`);
    if (!res.ok) return true;
    const data = (await res.json().catch(() => null)) as {
      versions?: Array<{
        versionId?: string | null;
        id?: string | null;
        versionNumber?: number | null;
        createdAt?: string | null;
      }>;
    } | null;
    const versions = Array.isArray(data?.versions) ? data.versions : [];
    if (versions.length === 0) return true;
    const newest = sortEngineVersionsNewestFirst(versions)[0];
    const newestId = newest?.versionId || newest?.id || null;
    return !newestId || newestId === versionId;
  } catch {
    return true;
  }
}

function OpenClawRepairRequestCard({ action }: { action: OpenClawRequestRepairAction }) {
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
      setActionError("Ingen aktiv version hittades. Öppna versionen i buildern och försök igen.");
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
      <p className="text-[11px] font-medium tracking-[0.16em] text-amber-200/80 uppercase">
        Reparationsförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {target
          ? "Jag kan starta en reparation av den aktiva versionen när du godkänner. Den körs som ett vanligt fix-pass och skapar en ny version som du sedan godkänner — jag ändrar aldrig filer direkt."
          : "Öppna en version i buildern först — reparation kan bara startas där."}
      </p>
      {action.reason ? (
        <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-slate-200">
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
            Reparation startad på den senaste versionen. En ny version dyker upp för godkännande när
            den är klar.
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

/**
 * Godkännandekort för `apply_quick_edit`: Sajtagenten föreslår små exakta
 * filändringar som körs genom den befintliga Fast Edit Lane-klienten
 * (`quickEditChatFiles`) FÖRST när användaren godkänner.
 *
 * Medveten v1-begränsning: kortet exekverar ALDRIG automatiskt — inte ens
 * när ett armerat mandat (Mode A) är aktivt. Mandatet auktoriserar bara
 * auto-send av builder-prompter genom den vanliga pipelinen; direkta
 * filändringar kräver alltid ett manuellt klick på Godkänn.
 */
function OpenClawQuickEditCard({
  action,
  editEnabled,
  builderTarget,
}: {
  action: OpenClawApplyQuickEditAction;
  editEnabled: boolean;
  /** Builder-mål bundet när turen SKICKADES (versionen modellen såg), eller null. */
  builderTarget: { chatId: string; versionId: string } | null;
}) {
  const [actionState, setActionState] = useState<
    "pending" | "working" | "applied" | "declined" | "failed"
  >("pending");
  const [actionError, setActionError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ versionId: string; changedFiles: string[] } | null>(
    null,
  );
  // Bind förslaget till versionen som var aktiv när TUREN SKICKADES — det är
  // den kod modellen faktiskt såg (Bugbot rond 7+8). Ett godkännande senare
  // får inte tyst appliceras mot en annan bas: ops:en skickas med förslagets
  // version som bas + engineLatestKnownVersionId, så serverns stale-base-guard
  // svarar 409 om huvudet hunnit flytta (samma svenska copy som kodvyn).
  //
  // Fallback utan send-tidens mål (Bugbot rond 9): builder-kontexten muterar
  // window utan att OpenClaw-panelen re-renderar, så en render-ögonblicksbild
  // vore både för pessimistisk (knappen fastnar avstängd) och för optimistisk
  // (stale bas vid klick). Därför: hint-texten använder render-läsningen, men
  // knappen är alltid klickbar och SJÄLVA målet löses om vid klicktillfället —
  // samma mönster som reparationskortet. Saknas mål då: tydligt fel, inget körs.
  const renderTarget = builderTarget ?? readActiveBuilderTarget();
  const actionLabel = action.label || "Liten kodändring på sajten";
  // Synkron dubbelklicksvakt (Bugbot): setActionState döljer knapparna först
  // efter re-render, så två snabba klick kan annars starta överlappande
  // POST:ar mot samma bas (forkad historik / förvirrande stale_base_version).
  const approveInFlightRef = useRef(false);

  if (!editEnabled) {
    return (
      <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-slate-100">
        <p className="text-xs leading-5 text-slate-300">
          Redigeringsläge är av — aktivera OC_EDIT för att kunna godkänna snabbändringar.
        </p>
      </div>
    );
  }

  const handleApprove = async () => {
    if (approveInFlightRef.current) return;
    approveInFlightRef.current = true;
    try {
      // Send-tidens mål vinner; annars klicktidens live-läsning (rond 9).
      const effectiveTarget = builderTarget ?? readActiveBuilderTarget();
      if (!effectiveTarget) {
        setActionState("failed");
        setActionError("Ingen aktiv version hittades. Öppna versionen i buildern och försök igen.");
        return;
      }
      setActionState("working");
      setActionError(null);

      await runApprovedOps(effectiveTarget);
    } finally {
      approveInFlightRef.current = false;
    }
  };

  const runApprovedOps = async (current: { chatId: string; versionId: string }) => {
    // Kontraktsvakt (Bugbot): replace_content på en okänd path skulle SKAPA en
    // ny fil server-side, men OC-kontraktet lovar "endast befintliga filer".
    // Verifiera därför mot versionens fillista innan något skrivs. Fail-closed:
    // kan listan inte hämtas genomförs ingen ändring.
    const replaceContentPaths = action.ops
      .filter((op) => op.kind === "replace_content")
      .map((op) => op.path);
    if (replaceContentPaths.length > 0) {
      let existingPaths: Set<string> | null = null;
      try {
        const res = await fetch(
          `${engineChatBaseUrl(current.chatId)}/files?versionId=${encodeURIComponent(current.versionId)}`,
        );
        const data = (await res.json().catch(() => null)) as {
          files?: Array<{ name?: unknown }>;
        } | null;
        if (res.ok && Array.isArray(data?.files)) {
          existingPaths = new Set(
            data.files
              .map((f) => (typeof f.name === "string" ? f.name : ""))
              .filter(Boolean),
          );
        }
      } catch {
        // fail-closed nedan
      }
      if (!existingPaths) {
        setActionState("failed");
        setActionError("Kunde inte verifiera versionens filer — försök igen om en stund.");
        return;
      }
      const missing = replaceContentPaths.filter((path) => !existingPaths.has(path));
      if (missing.length > 0) {
        setActionState("failed");
        setActionError(
          `Filen finns inte i versionen: ${missing.join(", ")}. Nya filer kan inte skapas via snabbändring — använd en vanlig follow-up-prompt i stället.`,
        );
        return;
      }
    }

    // Kör ops:en genom Fast Edit Lane med FÖRSLAGETS version som bas.
    // `engineLatestKnownVersionId` = samma version så serverns stale-base-
    // guard avvisar med 409 när chatten hunnit få en nyare version sedan
    // förslaget skrevs (samma trade-off som patchEngineChatFile dokumenterar).
    const result = await quickEditChatFiles({
      chatId: current.chatId,
      baseVersionId: current.versionId,
      engineLatestKnownVersionId: current.versionId,
      ops: action.ops,
      summary: action.label,
    });

    if (!result.ok) {
      setActionState("failed");
      setActionError(describeQuickEditHardError(result));
      return;
    }
    // Sync the builder (Bugbot P1): without this the builder keeps the
    // superseded base selected — the version list misses the new v.x row and
    // the NEXT quick edit gets a stale_base_version 409. The controller's
    // handleFilesSaved listener selects the new version and threads the
    // preview-session meta (no-restart fast path).
    dispatchQuickEditAppliedEvent({
      chatId: current.chatId,
      versionId: result.versionId,
      previewUrl: result.previewUrl,
      previewSessionId: result.previewSessionId,
      previewMode: result.previewMode,
    });
    setApplied({ versionId: result.versionId, changedFiles: result.changedFiles });
    setActionState("applied");
  };

  const handleDecline = () => {
    setActionState("declined");
    setActionError(null);
  };

  return (
    <div className="min-w-0 rounded-2xl border border-emerald-400/20 bg-slate-900/70 p-3 text-slate-100">
      <p className="text-[11px] font-medium tracking-[0.16em] text-emerald-200/80 uppercase">
        Snabbändringsförslag
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{actionLabel}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {renderTarget
          ? "Jag genomför ändringen först när du godkänner. Den skapar en ny version och uppdaterar förhandsvisningen."
          : "Kräver en öppen version i buildern — godkännandet kontrollerar detta."}
      </p>
      {action.reason ? (
        <div className="mt-2 max-h-32 overflow-x-hidden overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 wrap-break-word whitespace-pre-wrap text-slate-200">
          {action.reason}
        </div>
      ) : null}
      {/* Full payload-transparens (Bugbot): användaren ska se exakt VAD som
          skrivs innan godkännande — inte bara op-typ + fil. Fill-kortet visar
          hela texten; samma princip här, avgränsat och scrollbart. */}
      <ul className="mt-2 space-y-2 rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-200">
        {action.ops.map((op, index) => (
          <li key={`${op.kind}:${op.path}:${index}`} className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                {describeOpenClawQuickEditOp(op)}
              </span>
              <span className="min-w-0 truncate font-mono text-[11px] text-slate-100">
                {op.path}
              </span>
            </div>
            {op.kind === "replace_text" ? (
              <div className="mt-1 max-h-32 overflow-x-hidden overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] leading-5 wrap-break-word whitespace-pre-wrap">
                <span className="text-rose-300/90 line-through">{op.find}</span>
                <span className="text-slate-400"> → </span>
                <span className="text-emerald-300/90">{op.replace}</span>
              </div>
            ) : null}
            {op.kind === "replace_content" ? (
              <details className="mt-1 rounded-lg border border-white/10 bg-black/30 p-2">
                <summary className="cursor-pointer text-[11px] text-slate-300 select-none">
                  Visa nytt filinnehåll ({op.content.length} tecken)
                </summary>
                <pre className="mt-1 max-h-40 overflow-x-hidden overflow-y-auto font-mono text-[11px] leading-5 wrap-break-word whitespace-pre-wrap text-slate-200">
                  {op.content}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actionState === "pending" ? (
          <>
            <button
              type="button"
              onClick={() => void handleApprove()}
              className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Godkänn och genomför
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              Avböj
            </button>
          </>
        ) : null}

        {actionState === "working" ? (
          <p className="text-xs text-slate-300">Genomför ändringen…</p>
        ) : null}

        {actionState === "applied" ? (
          <p className="text-xs text-emerald-300">
            Klart — ny version skapad ({applied?.versionId}).{" "}
            {applied && applied.changedFiles.length > 0
              ? `Ändrade filer: ${applied.changedFiles.join(", ")}`
              : "Inga filer rapporterades ändrade."}
          </p>
        ) : null}

        {actionState === "declined" ? (
          <p className="text-xs text-slate-300">Förslaget avböjdes.</p>
        ) : null}

        {actionState === "failed" ? (
          <p className="text-xs text-rose-300">
            {actionError ?? "Kunde inte genomföra ändringen."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
