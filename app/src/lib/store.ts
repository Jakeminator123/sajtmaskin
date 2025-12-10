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
import { createJSONStorage, persist } from "zustand/middleware";
import { debugLog } from "./debug";
import { saveProjectData as apiSaveProjectData } from "./project-client";

// ============================================================================
// TYPES
// ============================================================================

// Helper to check if we're in test mode (skip database saves)
function isTestMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("testMode") === "true";
}

// Attachment types for rich messages (orchestrator results)
export interface ImageAttachment {
  type: "image";
  base64: string;
  prompt: string;
  url?: string; // Public URL if saved to blob storage
}

export interface WebSearchAttachment {
  type: "web_search";
  results: Array<{ title: string; url: string; snippet: string }>;
}

export interface WorkflowAttachment {
  type: "workflow";
  steps: string[];
}

// User-uploaded file attachment (for including in prompts)
export interface UserFileAttachment {
  type: "user_file";
  url: string; // Public URL to the uploaded file
  filename: string; // Original filename
  mimeType: string; // File MIME type (image/png, etc.)
  size: number; // File size in bytes
  purpose?: string; // User-defined purpose (e.g., "hero image", "logo")
}

export type MessageAttachment =
  | ImageAttachment
  | WebSearchAttachment
  | WorkflowAttachment
  | UserFileAttachment;

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  // Optional attachments for rich content (images, search results, etc.)
  attachments?: MessageAttachment[];
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

  /**
   * Timestamp used to force iframe reload in code-preview.tsx
   * WHY: v0 sometimes returns the same demoUrl after refine (content changed but URL identical).
   * Browser/React won't re-render iframe if src is the same.
   * Solution: Append ?v={timestamp} to URL and use as part of React key.
   * Updated automatically in setDemoUrl() on every URL change.
   */
  lastRefreshTimestamp: number;

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
  addMessage: (
    role: "user" | "assistant",
    content: string,
    attachments?: MessageAttachment[]
  ) => void;
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
    files?: Array<Record<string, unknown>> | GeneratedFile[];
    messages?: Array<Record<string, unknown>> | Message[];
  }) => void;
  saveToDatabase: () => Promise<void>;

  // Explicit save (user must save first)
  explicitSave: () => Promise<void>; // Force save and enable auto-save
  setHasUserSaved: (saved: boolean) => void;

  // Ownership actions (for advanced features)
  setProjectOwned: (owned: boolean, mode?: "github" | "sqlite") => void;
  checkProjectOwnership: (projectId: string) => Promise<boolean>;
}

// Debounce management for auto-save
// Using a class to properly track pending saves and prevent race conditions
class SaveDebouncer {
  private timeout: NodeJS.Timeout | null = null;
  private pendingResolvers: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  debounce(saveFn: () => Promise<void>, delayMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to pending resolvers
      this.pendingResolvers.push({ resolve, reject });

      // Clear existing timeout
      if (this.timeout) {
        clearTimeout(this.timeout);
      }

      // Set new timeout
      this.timeout = setTimeout(async () => {
        this.timeout = null;
        const resolvers = [...this.pendingResolvers];
        this.pendingResolvers = [];

        try {
          await saveFn();
          // Resolve all pending promises
          resolvers.forEach((r) => r.resolve());
        } catch (error) {
          // Reject all pending promises
          resolvers.forEach((r) => r.reject(error as Error));
        }
      }, delayMs);
    });
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    // Resolve pending without saving
    this.pendingResolvers.forEach((r) => r.resolve());
    this.pendingResolvers = [];
  }
}

const saveDebouncer = new SaveDebouncer();

// Track if a save is currently in progress (prevents duplicate saves)
let saveInProgress = false;
let lastSaveTime = 0;
const MIN_SAVE_INTERVAL = 2000; // Minimum 2 seconds between saves

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
      lastRefreshTimestamp: Date.now(),
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

      addMessage: (role, content, attachments) => {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role,
              content,
              timestamp: new Date(),
              ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
        const prevChatId = get().chatId;
        set({ chatId: id });
        // Debug: Log chatId changes for troubleshooting stale context issues
        console.log("[Store] setChatId:", {
          previous: prevChatId,
          new: id,
          changed: prevChatId !== id,
          projectId: get().projectId,
        });
        // Note: Don't save here - setFiles will save everything together
        // This prevents race conditions where chatId is saved before demoUrl
      },

      setFiles: (files) => {
        set({ files });

        // IMPORTANT: Auto-save files immediately when generated
        // This ensures "Ta över" (takeover) works without requiring manual save
        if (typeof window !== "undefined" && files.length > 0) {
          // Use microtask to ensure state is updated before save
          queueMicrotask(() => {
            const state = get();

            // Guard: only save if we have a project and files
            if (!state.projectId || isTestMode()) {
              return;
            }

            // DEDUP: Skip if save was done recently
            const now = Date.now();
            if (saveInProgress || now - lastSaveTime < MIN_SAVE_INTERVAL) {
              debugLog("[Store] Skipping auto-save (recent save in progress)");
              return;
            }

            debugLog("[Store] Auto-saving generated files", {
              projectId: state.projectId,
              filesCount: files.length,
              hasDemoUrl: Boolean(state.demoUrl),
              hasChatId: Boolean(state.chatId),
            });

            // Enable auto-save for this project (generation = implicit save)
            set({ hasUserSaved: true });
            saveInProgress = true;

            // Save files directly - pass files as argument (not from state) to avoid stale data
            apiSaveProjectData(state.projectId, {
              chatId: state.chatId || undefined,
              demoUrl: state.demoUrl || undefined,
              currentCode: state.currentCode || undefined,
              files: files, // Use the files argument, not state.files
              messages: state.messages.map((msg) => ({
                ...msg,
                timestamp: msg.timestamp.toISOString(),
              })),
            })
              .then(() => {
                debugLog("[Store] Auto-save complete", {
                  projectId: state.projectId,
                });
                set({ lastSaved: new Date() });
                lastSaveTime = Date.now();
              })
              .catch((err) =>
                console.error("[Store] Failed to auto-save files:", err)
              )
              .finally(() => {
                saveInProgress = false;
              });
          });
        }
      },

      setCurrentCode: (code) => {
        set({ currentCode: code });
        // Note: Don't save here - setFiles will save everything together
      },

      setDemoUrl: (url) => {
        const prevUrl = get().demoUrl;
        const newTimestamp = Date.now();
        set({ demoUrl: url, lastRefreshTimestamp: newTimestamp });
        // Debug: Log demoUrl changes for troubleshooting preview issues
        console.log("[Store] setDemoUrl:", {
          previous:
            prevUrl?.slice(0, 60) +
            (prevUrl && prevUrl.length > 60 ? "..." : ""),
          new: url?.slice(0, 60) + (url && url.length > 60 ? "..." : ""),
          changed: prevUrl !== url,
          timestamp: newTimestamp,
          projectId: get().projectId,
          chatId: get().chatId,
        });
        // Note: Don't save here - setFiles will save everything together
        // This ensures all data (chatId, demoUrl, files) is saved atomically
        // lastRefreshTimestamp forces iframe reload even if URL is the same
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

        // Normalize files from database format
        const parsedFiles: GeneratedFile[] = Array.isArray(data.files)
          ? (data.files
              .map((file) => {
                const name =
                  file && typeof (file as { name?: unknown }).name === "string"
                    ? (file as { name: string }).name
                    : null;
                const content =
                  file &&
                  typeof (file as { content?: unknown }).content === "string"
                    ? (file as { content: string }).content
                    : null;

                if (!name || !content) {
                  return null;
                }

                return { name, content };
              })
              .filter(Boolean) as GeneratedFile[])
          : [];

        // Parse messages from database format
        const parsedMessages: Message[] = Array.isArray(data.messages)
          ? ((data.messages as Array<Record<string, unknown>>)
              .map((msg) => {
                const content =
                  typeof (msg as { content?: unknown }).content === "string"
                    ? (msg as { content: string }).content
                    : "";
                if (!content) {
                  return null;
                }

                const timestampValue = (msg as { timestamp?: unknown })
                  .timestamp;
                const timestamp =
                  timestampValue instanceof Date
                    ? timestampValue
                    : timestampValue
                    ? new Date(timestampValue as string)
                    : new Date();

                const id =
                  typeof (msg as { id?: unknown }).id === "string"
                    ? (msg as { id: string }).id
                    : `msg-${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2, 9)}`;

                const role =
                  (msg as { role?: unknown }).role === "assistant"
                    ? "assistant"
                    : "user";

                const attachments = Array.isArray(
                  (msg as { attachments?: unknown }).attachments
                )
                  ? ((
                      msg as { attachments?: MessageAttachment[] }
                    ).attachments?.filter(Boolean) as MessageAttachment[])
                  : undefined;

                return { id, role, content, timestamp, attachments };
              })
              .filter(Boolean) as Message[])
          : [];

        // Debug: Log what we're loading from database
        console.log("[Store] loadFromProject:", {
          chatId: data.chatId || "(none)",
          demoUrl:
            data.demoUrl?.slice(0, 60) +
              (data.demoUrl && data.demoUrl.length > 60 ? "..." : "") ||
            "(none)",
          hasCode: !!data.currentCode,
          filesCount: parsedFiles.length,
          messagesCount: parsedMessages.length,
          hasSavedData,
        });

        // REPLACE state entirely (don't merge with localStorage)
        set({
          chatId: data.chatId || null,
          demoUrl: data.demoUrl || null,
          currentCode: data.currentCode || null,
          files: parsedFiles,
          messages: parsedMessages,
          hasUserSaved: hasSavedData, // Enable auto-save if project has saved data
          isLoading: false, // CRITICAL: Reset loading state so preview shows
          lastRefreshTimestamp: Date.now(), // Force iframe refresh when loading project
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

        // DEDUP: Skip if save is in progress or was done very recently
        const now = Date.now();
        if (saveInProgress || now - lastSaveTime < MIN_SAVE_INTERVAL) {
          debugLog("[Store] Skipping saveToDatabase (recent save)");
          return Promise.resolve();
        }

        // Use debouncer to handle race conditions properly
        return saveDebouncer.debounce(async () => {
          const latestState = get(); // Get fresh state at save time!

          // Double-check projectId still exists
          if (!latestState.projectId) {
            return;
          }

          // Double-check dedup at execution time
          if (saveInProgress) {
            return;
          }

          saveInProgress = true;
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
            lastSaveTime = Date.now();
          } catch (error) {
            console.error("[Store] Failed to save to database:", error);
            set({ isSaving: false });
            throw error;
          } finally {
            saveInProgress = false;
          }
        }, 1000); // 1 second debounce
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
          debugLog("[Store] Save already in progress, skipping");
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
      migrate: (persistedState: unknown, version: number) => {
        const uiState = (persistedState ?? {}) as {
          deviceSize?: BuilderState["deviceSize"];
          quality?: BuilderState["quality"];
        };
        // Version 3: Only persist UI preferences, not project data
        if (version < 3) {
          return {
            deviceSize: uiState.deviceSize ?? "desktop",
            quality: uiState.quality ?? "premium",
            // Clear all project-specific data - will come from URL/database
          };
        }
        return uiState;
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
