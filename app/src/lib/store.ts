import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface GeneratedFile {
  name: string;
  content: string;
}

interface BuilderState {
  // Chat state
  messages: Message[];
  isLoading: boolean;
  chatId: string | null;

  // Generated content
  files: GeneratedFile[];
  currentCode: string | null;

  // UI state
  viewMode: "preview" | "code";
  deviceSize: "desktop" | "tablet" | "mobile";
  quality: "budget" | "standard" | "premium";

  // Actions
  addMessage: (role: "user" | "assistant", content: string) => void;
  setLoading: (loading: boolean) => void;
  setChatId: (id: string) => void;
  setFiles: (files: GeneratedFile[]) => void;
  setCurrentCode: (code: string) => void;
  setViewMode: (mode: "preview" | "code") => void;
  setDeviceSize: (size: "desktop" | "tablet" | "mobile") => void;
  setQuality: (quality: "budget" | "standard" | "premium") => void;
  clearChat: () => void;
}

export const useBuilderStore = create<BuilderState>((set) => ({
  // Initial state
  messages: [],
  isLoading: false,
  chatId: null,
  files: [],
  currentCode: null,
  viewMode: "preview",
  deviceSize: "desktop",
  quality: "standard",

  // Actions
  addMessage: (role, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role,
          content,
          timestamp: new Date(),
        },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setChatId: (id) => set({ chatId: id }),

  setFiles: (files) => set({ files }),

  setCurrentCode: (code) => set({ currentCode: code }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setDeviceSize: (size) => set({ deviceSize: size }),

  setQuality: (quality) => set({ quality: quality }),

  clearChat: () =>
    set({
      messages: [],
      isLoading: false,
      chatId: null,
      files: [],
      currentCode: null,
    }),
}));

