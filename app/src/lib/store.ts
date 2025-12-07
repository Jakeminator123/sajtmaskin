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
import { debugLog } from "./debug";

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
  isProjectOwned: boolean; // True when project är sparat för takeover
  ownershipMode: "none" | "github" | "sqlite"; // Storage type (sqlite is default)

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
  setProjectOwned: (owned: boolean, mode?: "github" | "sqlite") => void;
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
        get()
          .saveToDatabase()
          .catch((err) =>
            console.error("[Store] Failed to save message:", err)
          );
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setChatId: (id) => {
        set({ chatId: id });
        // Note: Don't save here - setFiles will save everything together
        // This prevents race conditions where chatId is saved before demoUrl
      },

      setFiles: (files) => {
        set({ files });

        // IMPORTANT: Auto-save files immediately when generated
        // This ensures "Ta över" (takeover) works without requiring manual save
        // Use setTimeout(0) to ensure other state updates (demoUrl, chatId) are applied first
        setTimeout(() => {
          const state = get();
          if (files.length > 0 && state.projectId && !isTestMode()) {
            console.log("[Store] Auto-saving generated files", {
              projectId: state.projectId,
              files: files.length,
              hasDemoUrl: Boolean(state.demoUrl),
              demoUrl: state.demoUrl?.substring(0, 50),
              hasChatId: Boolean(state.chatId),
            });

            // Enable auto-save for this project (generation = implicit save)
            set({ hasUserSaved: true });

            // Save files directly
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
                console.log(
                  "[Store] Auto-save complete for project:",
                  state.projectId
                );
                set({ lastSaved: new Date() });
              })
              .catch((err) =>
                console.error("[Store] Failed to auto-save files:", err)
              );
          }
        }, 0);
      },

      setCurrentCode: (code) => {
        set({ currentCode: code });
        // Note: Don't save here - setFiles will save everything together
      },

      setDemoUrl: (url) => {
        set({ demoUrl: url });
        // Note: Don't save here - setFiles will save everything together
        // This ensures all data (chatId, demoUrl, files) is saved atomically
      },

      setScreenshotUrl: (url) => {
        set({ screenshotUrl: url });
      },

      setVersionId: (id) => {
        set({ versionId: id });
        // Note: Don't save here - setFiles will save everything together
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
          isLoading: false, // CRITICAL: Reset loading state so preview shows
        });
      },

      // Set hasUserSaved flag
      setHasUserSaved: (saved) => set({ hasUserSaved: saved }),

      // Save to database (debounced) - only works after user has explicitly saved
      saveToDatabase: async () => {
        // Skip silently if user hasn't saved yet (no need to log every time)
        const state = get();
        if (!state.hasUserSaved || isTestMode() || !state.projectId) {
          return Promise.resolve();
        }

        // Clear existing timeout
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        // Debounce saves - get FRESH state inside the callback
        return new Promise<void>((resolve, reject) => {
          saveTimeout = setTimeout(async () => {
            const latestState = get(); // Get fresh state at save time!

            // Double-check projectId still exists
            if (!latestState.projectId) {
              resolve();
              return;
            }

            set({ isSaving: true });

            try {
              await apiSaveProjectData(latestState.projectId, {
                chatId: latestState.chatId || undefined,
                demoUrl: latestState.demoUrl || undefined,
                currentCode: latestState.currentCode || undefined,
                files: latestState.files,
                messages: latestState.messages.map((msg) => ({
                  ...msg,
                  timestamp: msg.timestamp.toISOString(),
                })),
              });
              set({ lastSaved: new Date(), isSaving: false });
              resolve();
            } catch (error) {
              console.error("[Store] Failed to save to database:", error);
              set({ isSaving: false });
              reject(error);
            }
          }, 1000); // 1 second debounce
        });
      },

      // Explicit save - bypasses hasUserSaved check and enables future auto-saves
      // Includes deduplication to prevent double saves
      explicitSave: async () => {
        const state = get();

        if (isTestMode()) {
          // Test mode: skipping explicit save
          return;
        }

        if (!state.projectId) {
          console.warn("[Store] Cannot save - no project ID");
          return;
        }

        // DEDUPLICATION: Skip if already saving
        if (state.isSaving) {
          console.log("[Store] Save already in progress, skipping duplicate");
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
      setProjectOwned: (owned, mode = "sqlite") => {
        set({
          isProjectOwned: owned,
          ownershipMode: owned ? mode : "none",
        });
        // Project ownership updated
      },

      // Check if project is owned (exists in takeover storage or GitHub)
      checkProjectOwnership: async (projectId) => {
        try {
          const response = await fetch(`/api/projects/${projectId}/status`);
          if (response.ok) {
            const data = await response.json();
            if (data.isOwned) {
              const storageMode =
                data.storageType === "github" || data.storageType === "sqlite"
                  ? data.storageType
                  : "sqlite";
              set({
                isProjectOwned: true,
                ownershipMode: storageMode,
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
      /**
       * Persist ONLY lightweight UI/context fields.
       * Heavy payloads (files/currentCode/messages) must come from backend/Redis,
       * not localStorage, to avoid bloat and stale state.
       */
      // ONLY persist UI preferences, NOT project-specific data
      // Project data (projectId, chatId, demoUrl) comes from URL params + database
      // This prevents stale project IDs from causing duplicate projects
      partialize: (state) => ({
        // UI preferences only - reset to defaults on new session
        deviceSize: state.deviceSize,
        quality: state.quality,
        // viewMode NOT persisted - always start with "preview"
        // projectId, chatId, demoUrl NOT persisted - comes from URL/database
      }),
      version: 3,
      migrate: (persistedState: any, version) => {
        // Version 3: Only persist UI preferences, not project data
        if (version < 3) {
          return {
            deviceSize: persistedState?.deviceSize ?? "desktop",
            quality: persistedState?.quality ?? "premium",
            // Clear all project-specific data - will come from URL/database
          };
        }
        return persistedState;
      },
      // Custom storage with Date serialization
      storage: createJSONStorage(() => localStorage, {
        reviver: (key, value) => {
          try {
            if (
              value &&
              typeof value === "object" &&
              "__type" in value &&
              value.__type === "Date"
            ) {
              const dateValue = (value as unknown as { value: string }).value;
              const date = new Date(dateValue);
              // Validate date
              if (isNaN(date.getTime())) {
                console.warn(
                  "[Store] Invalid date in storage, using current date:",
                  dateValue
                );
                return new Date();
              }
              return date;
            }
            if (key === "timestamp" && typeof value === "string") {
              const date = new Date(value);
              if (isNaN(date.getTime())) {
                console.warn(
                  "[Store] Invalid timestamp in storage, using current date:",
                  value
                );
                return new Date();
              }
              return date;
            }
            return value;
          } catch (error) {
            console.error("[Store] Error reviving storage value:", error);
            return value;
          }
        },
        replacer: (key, value) => {
          try {
            if (value instanceof Date) {
              // Validate date before serializing
              if (isNaN(value.getTime())) {
                console.warn(
                  "[Store] Invalid date being serialized, using current date"
                );
                return { __type: "Date", value: new Date().toISOString() };
              }
              return { __type: "Date", value: value.toISOString() };
            }
            return value;
          } catch (error) {
            console.error("[Store] Error replacing storage value:", error);
            return value;
          }
        },
      }),
    }
  )
);
