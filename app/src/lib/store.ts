import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { saveProjectData as apiSaveProjectData } from "./project-client";

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
  // Project state
  projectId: string | null;

  // Chat state
  messages: Message[];
  isLoading: boolean;
  chatId: string | null;

  // Generated content
  files: GeneratedFile[];
  currentCode: string | null;
  demoUrl: string | null;
  screenshotUrl: string | null;
  versionId: string | null;

  // UI state
  viewMode: "preview" | "code";
  deviceSize: "desktop" | "tablet" | "mobile";
  quality: "budget" | "standard" | "premium";

  // Saving state
  isSaving: boolean;
  lastSaved: Date | null;

  // Actions
  setProjectId: (id: string | null) => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  setLoading: (loading: boolean) => void;
  setChatId: (id: string) => void;
  setFiles: (files: GeneratedFile[]) => void;
  setCurrentCode: (code: string) => void;
  setDemoUrl: (url: string) => void;
  setScreenshotUrl: (url: string) => void;
  setVersionId: (id: string) => void;
  setViewMode: (mode: "preview" | "code") => void;
  setDeviceSize: (size: "desktop" | "tablet" | "mobile") => void;
  setQuality: (quality: "budget" | "standard" | "premium") => void;
  clearChat: () => void;

  // Database operations
  loadFromProject: (data: {
    chatId?: string;
    demoUrl?: string;
    currentCode?: string;
    files?: GeneratedFile[];
    messages?: Message[];
  }) => void;
  saveToDatabase: () => Promise<void>;
}

// Debounce timer for auto-save
let saveTimeout: NodeJS.Timeout | null = null;

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get) => ({
      // Initial state
      projectId: null,
      messages: [],
      isLoading: false,
      chatId: null,
      files: [],
      currentCode: null,
      demoUrl: null,
      screenshotUrl: null,
      versionId: null,
      viewMode: "preview",
      deviceSize: "desktop",
      quality: "standard",
      isSaving: false,
      lastSaved: null,

      // Actions
      setProjectId: (id) => set({ projectId: id }),

      addMessage: (role, content) => {
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
        }));
        // Trigger auto-save after message
        get().saveToDatabase();
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setChatId: (id) => {
        set({ chatId: id });
        get().saveToDatabase();
      },

      setFiles: (files) => {
        set({ files });
        get().saveToDatabase();
      },

      setCurrentCode: (code) => {
        set({ currentCode: code });
        get().saveToDatabase();
      },

      setDemoUrl: (url) => {
        set({ demoUrl: url });
        get().saveToDatabase();
      },

      setScreenshotUrl: (url) => {
        set({ screenshotUrl: url });
      },

      setVersionId: (id) => {
        set({ versionId: id });
        get().saveToDatabase();
      },

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
          demoUrl: null,
          screenshotUrl: null,
          versionId: null,
        }),

      // Load project data from database
      loadFromProject: (data) => {
        set({
          chatId: data.chatId || null,
          demoUrl: data.demoUrl || null,
          currentCode: data.currentCode || null,
          files: data.files || [],
          messages: (data.messages || []).map((msg: any) => ({
            ...msg,
            timestamp:
              msg.timestamp instanceof Date
                ? msg.timestamp
                : new Date(msg.timestamp),
          })),
        });
      },

      // Save to database (debounced)
      saveToDatabase: async () => {
        // Quick check if we have a project (use current state)
        if (!get().projectId) {
          return;
        }

        // Clear existing timeout
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        // Debounce saves - get FRESH state inside the callback
        saveTimeout = setTimeout(async () => {
          const state = get(); // Get fresh state at save time!

          // Double-check projectId still exists
          if (!state.projectId) {
            return;
          }

          set({ isSaving: true });

          try {
            await apiSaveProjectData(state.projectId, {
              chatId: state.chatId || undefined,
              demoUrl: state.demoUrl || undefined,
              currentCode: state.currentCode || undefined,
              files: state.files,
              messages: state.messages.map((msg) => ({
                ...msg,
                timestamp: msg.timestamp.toISOString(),
              })),
            });
            set({ lastSaved: new Date(), isSaving: false });
            console.log("[Store] Saved to database");
          } catch (error) {
            console.error("[Store] Failed to save to database:", error);
            set({ isSaving: false });
          }
        }, 1000); // 1 second debounce
      },
    }),
    {
      name: "sajtmaskin-builder-state",
      // Only persist these fields locally (backup)
      partialize: (state) => ({
        projectId: state.projectId,
        messages: state.messages,
        chatId: state.chatId,
        files: state.files,
        currentCode: state.currentCode,
        demoUrl: state.demoUrl,
        quality: state.quality,
      }),
      // Custom storage with Date serialization
      storage: createJSONStorage(() => localStorage, {
        reviver: (key, value) => {
          if (
            value &&
            typeof value === "object" &&
            "__type" in value &&
            value.__type === "Date"
          ) {
            return new Date((value as unknown as { value: string }).value);
          }
          if (key === "timestamp" && typeof value === "string") {
            return new Date(value);
          }
          return value;
        },
        replacer: (key, value) => {
          if (value instanceof Date) {
            return { __type: "Date", value: value.toISOString() };
          }
          return value;
        },
      }),
    }
  )
);
