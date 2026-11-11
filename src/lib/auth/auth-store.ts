/**
 * Auth Store
 *
 * Client-side state management for authentication.
 * Uses Zustand for global auth state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { writeCampaignClaimPending } from "@/lib/kostnadsfri/campaign-account";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  diamonds: number;
  freeGenerationAvailable?: boolean;
  emailVerified?: boolean;
  /** `kostnadsfri*`: kampanjkonto från en inbjudningslänk (lib/kostnadsfri/campaign-account). */
  provider: "google" | "email" | "anonymous" | "kostnadsfri" | "kostnadsfri_claimed";
  /** GitHub login when connected. The OAuth token never reaches the browser. */
  github_username: string | null;
  /** Server-computed: a token and a login are both stored for this user. */
  github_connected: boolean;
}

export interface GuestInfo {
  sessionId: string;
  generationsUsed: number;
  refinesUsed: number;
  canGenerate: boolean;
  canRefine: boolean;
}

interface AuthState {
  // State
  user: AuthUser | null;
  guest: GuestInfo | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setUser: (user: AuthUser | null) => void;
  setGuest: (guest: GuestInfo | null) => void;
  setLoading: (loading: boolean) => void;
  updateDiamonds: (diamonds: number) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      guest: null,
      isLoading: true,
      isInitialized: false,

      // Set user
      setUser: (user) => set({ user, isLoading: false, isInitialized: true }),

      // Set guest info
      setGuest: (guest) => set({ guest }),

      // Set loading state
      setLoading: (isLoading) => set({ isLoading }),

      // Update diamonds balance
      updateDiamonds: (diamonds) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, diamonds } });
        }
      },

      // Logout
      logout: () => {
        writeCampaignClaimPending(null);
        set({ user: null, isLoading: false });
        fetch("/api/auth/logout", { method: "POST" }).catch(console.error);
      },

      // Fetch current user from API
      fetchUser: async () => {
        try {
          set({ isLoading: true });
          const response = await fetch("/api/auth/me");
          if (
            !response.ok ||
            !response.headers.get("content-type")?.includes("application/json")
          ) {
            set({ user: null, guest: null, isLoading: false, isInitialized: true });
            return;
          }
          const data = await response.json();

          if (data.success) {
            if (data.authenticated && data.user) {
              set({
                user: data.user,
                guest: null,
                isLoading: false,
                isInitialized: true,
              });
            } else {
              set({
                user: null,
                guest: data.guest || null,
                isLoading: false,
                isInitialized: true,
              });
            }
          } else {
            set({
              user: null,
              guest: null,
              isLoading: false,
              isInitialized: true,
            });
          }
        } catch (error) {
          console.error("[AuthStore] Failed to fetch user:", error);
          set({ user: null, guest: null, isLoading: false, isInitialized: true });
        }
      },
    }),
    {
      name: "sajtmaskin-auth",
      partialize: (state) => ({
        // Only persist user data, not loading states
        user: state.user,
      }),
    },
  ),
);

// Hook to get auth status
export function useAuth() {
  const { user, guest, isLoading, isInitialized, logout, fetchUser, updateDiamonds } =
    useAuthStore();

  // Function to refresh user data from server
  const refreshUser = async () => {
    await fetchUser();
  };

  return {
    user,
    guest,
    isLoading,
    isInitialized,
    isAuthenticated: !!user,
    diamonds: user?.diamonds ?? 0,
    hasGitHub: Boolean(user?.github_connected && user?.github_username),
    logout,
    fetchUser,
    refreshUser,
    updateDiamonds,
  };
}
