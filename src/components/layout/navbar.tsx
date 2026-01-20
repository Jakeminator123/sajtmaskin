"use client";

/**
 * Navbar Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Main navigation bar with:
 * - Responsive design (desktop/mobile)
 * - User authentication state handling
 * - Diamond counter with low-balance warning animation
 * - Smooth dropdown animations
 *
 * ACCESSIBILITY:
 * - Proper ARIA labels for dropdowns
 * - Keyboard navigation support
 * - Focus management
 */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import rocketLogo from "../../../rocket_style_40.png";
import {
  Diamond,
  FolderOpen,
  LogIn,
  LogOut,
  User,
  ChevronDown,
  Sparkles,
  Menu,
  X,
  AlertCircle,
  Settings,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Diamond threshold for low-balance warning animation */
const LOW_DIAMOND_THRESHOLD = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface NavbarProps {
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
  onSettingsClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function Navbar({ onLoginClick, onRegisterClick, onSettingsClick }: NavbarProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, diamonds, logout, fetchUser, isInitialized } =
    useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Check if diamonds are running low (for warning animation)
  const isLowBalance = useMemo(() => {
    return diamonds !== null && diamonds <= LOW_DIAMOND_THRESHOLD;
  }, [diamonds]);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount, fetchUser is stable

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) {
        setShowUserMenu(false);
      }
      if (!target.closest("[data-mobile-menu]")) {
        setShowMobileMenu(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/80 backdrop-blur-xl border-b border-gray-800">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="p-1.5">
            <Image
              src={rocketLogo}
              alt="SajtMaskin logotyp"
              width={24}
              height={24}
              className="h-6 w-6"
              priority
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-bold text-white tracking-tight">
              SajtMaskin
            </span>
            <span className="text-[10px] sm:text-xs text-gray-400">
              En sajt av SajtStudio.se
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${isActive("/")
                  ? "text-white bg-gray-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Skapa
            </Button>
          </Link>
          <Link href="/projects">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${isActive("/projects")
                  ? "text-white bg-gray-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
            >
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Projekt
            </Button>
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Diamond counter - only show for authenticated users */}
          {isAuthenticated && (
            <Link href="/buy-credits" aria-label={`Du har ${diamonds} diamanter. Klicka för att köpa fler.`}>
              <div
                className={`
                  flex items-center gap-1.5 px-3 py-1.5
                  bg-black/50 border cursor-pointer group
                  transition-all duration-300
                  ${isLowBalance
                    ? 'border-red-500/50 hover:border-red-400 hover:bg-red-500/10'
                    : 'border-brand-amber/30 hover:border-brand-amber/60'
                  }
                `}
              >
                {/* Low balance warning icon */}
                {isLowBalance && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                )}

                {/* Diamond icon with pulse animation when low */}
                <Diamond
                  className={`
                    h-4 w-4 transition-all
                    ${isLowBalance
                      ? 'text-red-400 animate-diamondPulse'
                      : 'text-brand-amber group-hover:text-brand-amber/80'
                    }
                  `}
                />

                {/* Diamond count */}
                <span
                  className={`
                    text-sm font-semibold transition-colors
                    ${isLowBalance
                      ? 'text-red-400'
                      : 'text-brand-amber group-hover:text-brand-amber/80'
                    }
                  `}
                >
                  {diamonds ?? 0}
                </span>

                {/* "Buy more" hint on hover when low */}
                {isLowBalance && (
                  <span className="text-[10px] text-red-400/70 hidden group-hover:inline ml-0.5">
                    Köp
                  </span>
                )}
              </div>
            </Link>
          )}

          {/* Auth section */}
          {!isInitialized ? (
            // Loading skeleton
            <div className="w-20 h-8 bg-gray-800/50 animate-pulse" />
          ) : isAuthenticated ? (
            // User menu
            <div className="relative" data-user-menu>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 transition-colors"
              >
                {user?.image ? (
                  <Image
                    src={user.image}
                    alt={user.name || ""}
                    width={24}
                    height={24}
                    className="rounded-none"
                  />
                ) : (
                  <div className="w-6 h-6 bg-linear-to-br from-brand-teal to-brand-blue flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <span className="text-sm text-gray-300 max-w-[100px] truncate hidden sm:block">
                  {user?.name || user?.email?.split("@")[0] || "Användare"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform ${showUserMenu ? "rotate-180" : ""
                    }`}
                />
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-black border border-gray-800 shadow-xl shadow-black/50 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.name || "Användare"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user?.email}
                    </p>
                  </div>

                  {/* Balance */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-800/50 transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <span className="text-sm text-gray-400">Diamanter</span>
                    <div className="flex items-center gap-1.5">
                      <Diamond className="h-4 w-4 text-brand-amber" />
                      <span className="text-sm font-semibold text-brand-amber">
                        {diamonds ?? 0}
                      </span>
                    </div>
                  </Link>

                  {/* Buy credits */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-800/50 transition-colors text-sm text-gray-300"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Sparkles className="h-4 w-4 text-brand-teal" />
                    Köp diamanter
                  </Link>

                  {/* Settings */}
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onSettingsClick?.();
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-gray-800/50 transition-colors text-sm text-gray-300"
                  >
                    <Settings className="h-4 w-4 text-brand-blue" />
                    Inställningar
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-gray-800 my-1" />

                  {/* Logout */}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-gray-800/50 transition-colors text-sm text-gray-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Logga ut
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Login/Register buttons
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoginClick}
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Logga in
              </Button>
              <Button
                size="sm"
                onClick={onRegisterClick}
                className="bg-brand-teal hover:bg-brand-teal/90 text-white"
              >
                Skapa konto
              </Button>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 hover:bg-gray-800/50 text-gray-400"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            data-mobile-menu
          >
            {showMobileMenu ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div
          className="md:hidden absolute top-16 left-0 right-0 bg-black/95 backdrop-blur-xl border-b border-gray-800 py-4 animate-in slide-in-from-top-2"
          data-mobile-menu
        >
          <div className="max-w-7xl mx-auto px-4 space-y-2">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 ${isActive("/") ? "bg-gray-800/50 text-white" : "text-gray-400"
                }`}
            >
              <Sparkles className="h-5 w-5" />
              Skapa
            </Link>
            <Link
              href="/projects"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 ${isActive("/projects")
                  ? "bg-gray-800/50 text-white"
                  : "text-gray-400"
                }`}
            >
              <FolderOpen className="h-5 w-5" />
              Projekt
            </Link>
            {isAuthenticated && (
              <Link
                href="/buy-credits"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-2 px-4 py-3 text-gray-400"
              >
                <Diamond className="h-5 w-5 text-brand-amber" />
                Köp diamanter
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
