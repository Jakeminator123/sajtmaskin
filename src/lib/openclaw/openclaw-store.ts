import { create } from "zustand";
import type { ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";
import type {
  ArmedContinuationSendOutcome,
  ArmedContinuationWatch,
} from "@/lib/openclaw/debug/armed-continuation";
import type { OpenClawPreparedFill } from "@/lib/openclaw/prepared-prompt";
import {
  activeOpenClawPowerIds,
  resolveOpenClawPowers,
  toggleOpenClawPower,
  type OpenClawPowerId,
  type OpenClawPowers,
} from "@/lib/openclaw/powers";

export interface OpenClawMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Builder-mål (chatt + version) som var aktivt när turen SKICKADES — dvs.
   * den kontext modellen faktiskt såg. Quick-edit-kortet binder sina ops hit
   * så ett förslag aldrig tyst appliceras mot en annan version (Bugbot). */
  builderTarget?: { chatId: string; versionId: string } | null;
}

interface OpenClawState {
  isOpen: boolean;
  messages: OpenClawMessage[];
  isStreaming: boolean;
  scopeKey: string;
  avatarMode: boolean;
  /** Server-reported OC_DEBUG state (from /api/openclaw/health) — read side
   * (debug context). Default false. */
  debugEnabled: boolean;
  /** Server-reported OC_EDIT state (from /api/openclaw/health) — act side.
   * Gates the armed-autonomy auto-send path on the client. Default false. */
  editEnabled: boolean;
  /** The chat's "extra befogenheter" master toggle. Must be pressed before any
   * power is live, even with OC_EDIT on. Session-only and default off: a
   * reload always lands back on today's guide behaviour. */
  powersOn: boolean;
  /** Which powers the user ticked in the menu. Empty = nothing extra. */
  grantedPowers: OpenClawPowerId[];
  /** Active "armed autonomy" mandate (Mode A), or null when OpenClaw is passive. */
  armedMandate: ArmedMandate | null;
  /** Pending continuation watch: an armed auto-send fired and the builder turn
   * it started is being followed until it reaches a terminal state. Null when
   * nothing is awaited. See `debug/armed-continuation.ts`. */
  armedContinuation: ArmedContinuationWatch | null;
  /** Last successful OpenClaw `fill_text_field` against the builder composer.
   * Recorded only when `editEnabled` is true; the composer compares it against
   * the outgoing message to tag unedited sends as `openclaw-prepared` (see
   * `prepared-prompt.ts`). Cleared on scope change and after the draft that
   * carried it is sent. */
  preparedFill: OpenClawPreparedFill | null;

  toggle: () => void;
  open: () => void;
  close: () => void;
  setScope: (scopeKey: string) => void;
  addMessage: (msg: OpenClawMessage) => void;
  updateAssistantMessage: (id: string, content: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
  setAvatarMode: (v: boolean) => void;
  setDebugEnabled: (v: boolean) => void;
  setEditEnabled: (v: boolean) => void;
  /** Press/release the master toggle. Releasing it disarms (see below). */
  setPowersOn: (v: boolean) => void;
  /** Tick/untick one power. Unticking armed autonomy disarms (see below). */
  toggleGrantedPower: (id: OpenClawPowerId) => void;
  /** Restore a persisted grant after a chat/scope change. */
  hydratePowers: (next: { powersOn: boolean; grantedPowers: OpenClawPowerId[] }) => void;
  setArmedMandate: (mandate: ArmedMandate | null) => void;
  setArmedContinuation: (watch: ArmedContinuationWatch | null) => void;
  /** Let the builder send that an armed auto-send started name itself, so its
   * outcome can be matched to the exact turn. First claim wins. */
  bindArmedContinuationSend: (sendSeq: number) => void;
  /** Report how that named send ended (`SendMessageOutcome`). The handshake
   * resumes only on a send that says it ran, so this is what separates a
   * finished build from a refusal that left the old version standing. */
  settleArmedContinuationSend: (
    sendSeq: number,
    outcome: ArmedContinuationSendOutcome,
  ) => void;
  setPreparedFill: (fill: OpenClawPreparedFill | null) => void;
}

/**
 * Withdrawing a power must take the state it authorized with it. Releasing the
 * button (or unticking armed autonomy) while a mandate is running would
 * otherwise leave a live watch that keeps auto-sending under authority the user
 * just revoked — the same reasoning as `setArmedMandate` dropping its watch.
 * Clearing the prepared fill once nothing is granted keeps the composer from
 * tagging a later send with a fast lane the user no longer allows.
 */
function revokeStaleAutonomy(
  state: Pick<OpenClawState, "editEnabled" | "armedMandate" | "armedContinuation" | "preparedFill">,
  next: { powersOn: boolean; grantedPowers: OpenClawPowerId[] },
): Partial<OpenClawState> {
  const powers = resolveOpenClawPowers({
    editEnabled: state.editEnabled,
    powersOn: next.powersOn,
    granted: next.grantedPowers,
  });
  return {
    ...next,
    ...(powers.armedAutonomy ? {} : { armedMandate: null, armedContinuation: null }),
    ...(powers.any ? {} : { preparedFill: null }),
  };
}

export const useOpenClawStore = create<OpenClawState>()((set) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  scopeKey: "global",
  avatarMode: true,
  debugEnabled: false,
  editEnabled: false,
  powersOn: false,
  grantedPowers: [],
  armedMandate: null,
  armedContinuation: null,
  preparedFill: null,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setScope: (scopeKey) =>
    set((state) =>
      state.scopeKey === scopeKey
        ? state
        : {
            scopeKey,
            isOpen: false,
            messages: [],
            isStreaming: false,
            // A mandate is scoped to one builder context — drop it on scope change
            // so autonomy never leaks across chats/sites.
            armedMandate: null,
            armedContinuation: null,
            // Same scoping: a prepared fill belongs to one composer context.
            preparedFill: null,
            // Powers are granted for the context the user was looking at. Moving
            // to another chat/site must not carry the grant along silently — the
            // user re-presses the button where they actually want it.
            powersOn: false,
            grantedPowers: [],
          },
    ),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateAssistantMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((message) =>
        message.id === id && message.role === "assistant" ? { ...message, content } : message,
      ),
    })),

  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
  setAvatarMode: (v) => set({ avatarMode: v }),
  setDebugEnabled: (v) => set({ debugEnabled: v }),
  // Losing the env gate withdraws the grant with it. Otherwise a health check
  // that dips to false and back — a failed fetch is enough — would silently
  // restore powers the user pressed for earlier, without a fresh press.
  setEditEnabled: (v) =>
    set((s) =>
      v
        ? { editEnabled: true }
        : {
            editEnabled: false,
            ...revokeStaleAutonomy(
              { ...s, editEnabled: false },
              { powersOn: false, grantedPowers: [] },
            ),
          },
    ),
  setPowersOn: (v) =>
    set((s) => revokeStaleAutonomy(s, { powersOn: v, grantedPowers: s.grantedPowers })),
  toggleGrantedPower: (id) =>
    set((s) => {
      const grantedPowers = toggleOpenClawPower(s.grantedPowers, id);
      return revokeStaleAutonomy(s, { powersOn: s.powersOn, grantedPowers });
    }),
  hydratePowers: (next) => set((s) => revokeStaleAutonomy(s, next)),
  // Any mandate change cancels a pending continuation. Disarming ("stopp", the
  // stop button, a spent counter) must not leave a watch that outlives its
  // mandate — and a freshly armed mandate must not inherit the previous run's
  // watch (Bugbot). The auto-send card re-registers its watch after this call.
  setArmedMandate: (mandate) => set({ armedMandate: mandate, armedContinuation: null }),
  setArmedContinuation: (watch) => set({ armedContinuation: watch }),
  // Only the first send may claim the watch. The auto-send is the one that
  // registered it, so a later OpenClaw-prepared send the user posts by hand
  // during the same run cannot rename the turn out from under it.
  bindArmedContinuationSend: (sendSeq) =>
    set((s) =>
      s.armedContinuation && s.armedContinuation.sendSeq === null
        ? { armedContinuation: { ...s.armedContinuation, sendSeq } }
        : {},
    ),
  // Only the send that claimed the watch may report on it. Every other sender
  // in the builder — a manual retry, a catalogue insert, a plan decision — can
  // succeed or fail while the autonomous turn runs, and none of those outcomes
  // says anything about the mandate's own turn.
  settleArmedContinuationSend: (sendSeq, outcome) =>
    set((s) =>
      s.armedContinuation && s.armedContinuation.sendSeq === sendSeq
        ? { armedContinuation: { ...s.armedContinuation, sendOutcome: outcome } }
        : {},
    ),
  setPreparedFill: (fill) => set({ preparedFill: fill }),
}));

/**
 * Effective powers for callers outside React (event handlers, the builder
 * composer). Components use `useOpenClawPowers` so they re-render on a change.
 */
export function readOpenClawPowers(): OpenClawPowers {
  const { editEnabled, powersOn, grantedPowers } = useOpenClawStore.getState();
  return resolveOpenClawPowers({ editEnabled, powersOn, granted: grantedPowers });
}

/** The live grant as ids, for the chat request body. */
export function readActiveOpenClawPowerIds(): OpenClawPowerId[] {
  const { editEnabled, powersOn, grantedPowers } = useOpenClawStore.getState();
  return activeOpenClawPowerIds({ editEnabled, powersOn, granted: grantedPowers });
}
