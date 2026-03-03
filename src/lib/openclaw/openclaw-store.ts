import { create } from "zustand";

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

  toggle: () => void;
  open: () => void;
  close: () => void;
  addMessage: (msg: OpenClawMessage) => void;
  updateLastAssistant: (content: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

export const useOpenClawStore = create<OpenClawState>()((set, get) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateLastAssistant: (content) => {
    const msgs = get().messages;
    const last = msgs[msgs.length - 1];
    if (last?.role === "assistant") {
      set({ messages: [...msgs.slice(0, -1), { ...last, content }] });
    }
  },

  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
}));
