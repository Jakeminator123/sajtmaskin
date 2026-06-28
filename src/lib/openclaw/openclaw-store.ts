import { create } from "zustand";
import type { ArmedMandate } from "@/lib/openclaw/debug/armed-mandate";

export interface OpenClawMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface OpenClawState {
  isOpen: boolean;
  messages: OpenClawMessage[];
  isStreaming: boolean;
  scopeKey: string;
  avatarMode: boolean;
  /** Server-reported OC_DEBUG state (from /api/openclaw/health). Gates the
   * armed-autonomy auto-send path on the client. Default false. */
  debugEnabled: boolean;
  /** Active "armed autonomy" mandate (Mode A), or null when OpenClaw is passive. */
  armedMandate: ArmedMandate | null;

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
  setArmedMandate: (mandate: ArmedMandate | null) => void;
}

export const useOpenClawStore = create<OpenClawState>()((set) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,
  scopeKey: "global",
  avatarMode: true,
  debugEnabled: false,
  armedMandate: null,

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
  setArmedMandate: (mandate) => set({ armedMandate: mandate }),
}));
