/**
 * Builder State Store (Zustand)
 * ==============================
 *
 * Central state management för hela Builder-vyn.
 *
 * VIKTIGA STATE-VÄRDEN:
 *
 * - demoUrl: v0's hostade preview-URL (visas i iframe)
 *   → Detta är PRIMÄRA sättet att visa preview
 *   → Sätts av generateCode/refineCode/generateFromTemplate
 *
 * - chatId: v0 konversations-ID
 *   → Behövs för refinement (fortsätta samma konversation)
 *   → Utan chatId skapas ny konversation vid varje prompt
 *
 * - currentCode: Huvudfilens kod (för kod-vyn och Sandpack-fallback)
 * - files: Alla genererade filer (för kod-vyn och download)
 * - versionId: Behövs för ZIP-download
 *
 * SPARNING (Database):
 * - FILES: Sparas automatiskt direkt vid generering (för takeover)
 * - hasUserSaved: Används för messages/chat auto-save
 * - testMode=true i URL: Skippar all sparning (för testning)
 *
 * PERSISTENCE:
 * - Använder localStorage som backup
 * - SQLite-databas för permanent lagring (via API)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { saveProjectData as apiSaveProjectData } from "./project-client";

// Helper to check if we're in test mode (skip database saves)
function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("testMode") === "true";
}

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
  quality: "standard" | "premium"; // 2 levels: standard (v0-1.5-md) or premium (v0-1.5-lg)

  // Saving state
  isSaving: boolean;
  lastSaved: Date | null;
  hasUserSaved: boolean; // User must explicitly save first before auto-save kicks in

  // Ownership state (for advanced features)
  isProjectOwned: boolean; // True when project is saved to Redis/GitHub (takeover)
  ownershipMode: "none" | "redis" | "github"; // Storage type

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
  setQuality: (quality: "standard" | "premium") => void;
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

  // Explicit save (user must save first)
  explicitSave: () => Promise<void>; // Force save and enable auto-save
  setHasUserSaved: (saved: boolean) => void;

  // Ownership actions (for advanced features)
  setProjectOwned: (owned: boolean, mode?: "redis" | "github") => void;
  checkProjectOwnership: (projectId: string) => Promise<boolean>;
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
      quality: "premium",
      isSaving: false,
      lastSaved: null,
      hasUserSaved: false, // Must be true for auto-save to work
      isProjectOwned: false, // Set to true after takeover
      ownershipMode: "none",

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
        // Trigger auto-save after message (fire-and-forget, debounced internally)
        get().saveToDatabase().catch((err) =>
          console.error("[Store] Failed to save message:", err)
        );
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setChatId: (id) => {
        set({ chatId: id });
        get().saveToDatabase().catch((err) =>
          console.error("[Store] Failed to save chatId:", err)
        );
      },

      setFiles: (files) => {
        set({ files });

        // IMPORTANT: Auto-save files immediately when generated
        // This ensures "Ta över" (takeover) works without requiring manual save
        const state = get();
        if (files.length > 0 && state.projectId && !isTestMode()) {
          // Save files directly without waiting for hasUserSaved
          apiSaveProjectData(state.projectId, {
            chatId: state.chatId || undefined,
            demoUrl: state.demoUrl || undefined,
            currentCode: state.currentCode || undefined,
            files: files,
            messages: state.messages.map((msg) => ({
              ...msg,
              timestamp: msg.timestamp.toISOString(),
            })),
          })
            .then(() => {
              console.log("[Store] Auto-saved files to database");
              set({ lastSaved: new Date() });
            })
            .catch((err) =>
              console.error("[Store] Failed to auto-save files:", err)
            );
        } else {
          // Still trigger normal saveToDatabase for other scenarios
          get().saveToDatabase();
        }
      },

      setCurrentCode: (code) => {
        set({ currentCode: code });
        get().saveToDatabase().catch((err) =>
          console.error("[Store] Failed to save code:", err)
        );
      },

      setDemoUrl: (url) => {
        set({ demoUrl: url });
        get().saveToDatabase().catch((err) =>
          console.error("[Store] Failed to save demoUrl:", err)
        );
      },

      setScreenshotUrl: (url) => {
        set({ screenshotUrl: url });
      },

      setVersionId: (id) => {
        set({ versionId: id });
        get().saveToDatabase().catch((err) =>
          console.error("[Store] Failed to save versionId:", err)
        );
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
      // IMPORTANT: This completely replaces current state to avoid duplicates
      // from localStorage persist + database load race condition
      loadFromProject: (data) => {
        // If we're loading saved data, user has previously saved this project
        const hasSavedData = !!(
          data.chatId ||
          data.demoUrl ||
          data.currentCode ||
          (data.files && data.files.length > 0)
        );

        // Parse messages from database format
        const parsedMessages = (data.messages || []).map((msg: any) => ({
          ...msg,
          id:
            msg.id ||
            `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp
              : new Date(msg.timestamp),
        }));

        // REPLACE state entirely (don't merge with localStorage)
        set({
          chatId: data.chatId || null,
          demoUrl: data.demoUrl || null,
          currentCode: data.currentCode || null,
          files: data.files || [],
          messages: parsedMessages,
          hasUserSaved: hasSavedData, // Enable auto-save if project has saved data
          isLoading: false, // Reset loading state
        });

        console.log("[Store] Loaded project, messages:", parsedMessages.length);
      },

      // Set hasUserSaved flag
      setHasUserSaved: (saved) => set({ hasUserSaved: saved }),

      // Save to database (debounced) - only works after user has explicitly saved
      saveToDatabase: async () => {
        // Skip silently if user hasn't saved yet (no need to log every time)
        if (!get().hasUserSaved || isTestMode() || !get().projectId) {
          return Promise.resolve();
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
            return Promise.resolve();
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
            throw error; // Re-throw so callers can catch if needed
          }
        }, 1000); // 1 second debounce
        
        // Return a promise that resolves when the timeout completes
        return Promise.resolve();
      },

      // Explicit save - bypasses hasUserSaved check and enables future auto-saves
      explicitSave: async () => {
        const state = get();

        if (isTestMode()) {
          console.log("[Store] Test mode - skipping explicit save");
          return;
        }

        if (!state.projectId) {
          console.warn("[Store] Cannot save - no project ID");
          return;
        }

        // Track previous state in case save fails
        const previousHasUserSaved = state.hasUserSaved;
        set({ isSaving: true, hasUserSaved: true });

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
        } catch (error) {
          console.error("[Store] Failed to save to database:", error);
          // Reset hasUserSaved to previous state on error - don't falsely indicate saved
          set({ isSaving: false, hasUserSaved: previousHasUserSaved });
        }
      },

      // Set project ownership state (called after takeover)
      setProjectOwned: (owned, mode = "redis") => {
        set({
          isProjectOwned: owned,
          ownershipMode: owned ? mode : "none",
        });
        console.log(`[Store] Project ownership set: ${owned} (${mode})`);
      },

      // Check if project is owned (exists in Redis/GitHub)
      checkProjectOwnership: async (projectId) => {
        try {
          const response = await fetch(`/api/projects/${projectId}/status`);
          if (response.ok) {
            const data = await response.json();
            if (data.isOwned) {
              set({
                isProjectOwned: true,
                ownershipMode: data.storageType || "redis",
              });
              return true;
            }
          }
          return false;
        } catch (error) {
          console.error("[Store] Failed to check ownership:", error);
          return false;
        }
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
