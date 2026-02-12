/**
 * Auth Store
 *
 * Client-side state management for authentication.
 * Uses Zustand for global auth state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  diamonds: number;
  emailVerified?: boolean;
  provider: "google" | "email" | "anonymous";
  github_token: string | null;
  github_username: string | null;
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
        set({ user: null, isLoading: false });
        // Call logout API
        fetch("/api/auth/logout", { method: "POST" }).catch(console.error);
      },

      // Fetch current user from API
      fetchUser: async () => {
        try {
          set({ isLoading: true });
          const response = await fetch("/api/auth/me");
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
          set({ user: null, isLoading: false, isInitialized: true });
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
    hasGitHub: !!(user?.github_token && user?.github_username),
    logout,
    fetchUser,
    refreshUser,
    updateDiamonds,
  };
}
