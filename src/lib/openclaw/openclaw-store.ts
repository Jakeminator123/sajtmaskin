import { create } from "zustand";
import type { ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";
import type { ArmedContinuationWatch } from "@/lib/openclaw/debug/armed-continuation";
import type { OpenClawPreparedFill } from "@/lib/openclaw/prepared-prompt";

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
  setArmedMandate: (mandate: ArmedMandate | null) => void;
  setArmedContinuation: (watch: ArmedContinuationWatch | null) => void;
  setPreparedFill: (fill: OpenClawPreparedFill | null) => void;
}

export const useOpenClawStore = create<OpenClawState>()((set) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  scopeKey: "global",
  avatarMode: true,
  debugEnabled: false,
  editEnabled: false,
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
  setEditEnabled: (v) => set({ editEnabled: v }),
  // Disarming always cancels a pending continuation: "stopp", the stop button
  // and a spent counter all route through here, so the watch can never outlive
  // the mandate that authorized it.
  setArmedMandate: (mandate) =>
    set(mandate ? { armedMandate: mandate } : { armedMandate: null, armedContinuation: null }),
  setArmedContinuation: (watch) => set({ armedContinuation: watch }),
  setPreparedFill: (fill) => set({ preparedFill: fill }),
}));
