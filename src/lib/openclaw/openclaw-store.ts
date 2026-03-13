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
  updateAssistantMessage: (id: string, content: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

export const useOpenClawStore = create<OpenClawState>()((set) => ({
  isOpen: false,
  messages: [],
  isStreaming: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateAssistantMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((message) =>
        message.id === id && message.role === "assistant" ? { ...message, content } : message,
      ),
    })),

  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
}));
