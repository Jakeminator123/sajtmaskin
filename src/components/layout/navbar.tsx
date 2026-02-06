"use client";

/**
 * Navbar Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Main navigation bar with:
 * - Responsive design (desktop/mobile)
 * - User authentication state handling
 * - Credit counter with low-balance warning animation
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
const rocketLogo = "/branding/rocket_style_40.png";
import {
  Coins,
  FolderOpen,
  LogIn,
  LogOut,
  User,
  ChevronDown,
  Wand2,
  Menu,
  X,
  AlertCircle,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Credit threshold for low-balance warning animation */
const LOW_DIAMOND_THRESHOLD = 3;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface NavbarProps {
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function Navbar({ onLoginClick, onRegisterClick }: NavbarProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, diamonds, logout, fetchUser, isInitialized } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Check if credits are running low (for warning animation)
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
    <nav className="fixed top-0 right-0 left-0 z-50 h-16 border-b border-gray-800 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
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
            <span className="text-lg font-bold tracking-tight text-white">SajtMaskin</span>
            <span className="text-[10px] text-gray-400 sm:text-xs">En sajt av SajtStudio.se</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-1 md:flex">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${
                isActive("/")
                  ? "bg-gray-800/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
            >
              <Wand2 className="mr-1.5 h-4 w-4" />
              Skapa
            </Button>
          </Link>
          <Link href="/projects">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${
                isActive("/projects")
                  ? "bg-gray-800/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Projekt
            </Button>
          </Link>
          <Link href="/templates">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${
                isActive("/templates")
                  ? "bg-gray-800/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
            >
              Mallar
            </Button>
          </Link>
          <Link href="/buy-credits">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${
                isActive("/buy-credits")
                  ? "bg-gray-800/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
            >
              Priser
            </Button>
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Credit counter - only show for authenticated users */}
          {isAuthenticated && (
            <Link
              href="/buy-credits"
              aria-label={`Du har ${diamonds} credits. Klicka för att köpa fler.`}
            >
              <div
                className={`group flex cursor-pointer items-center gap-1.5 border bg-black/50 px-3 py-1.5 transition-all duration-300 ${
                  isLowBalance
                    ? "border-red-500/50 hover:border-red-400 hover:bg-red-500/10"
                    : "border-brand-amber/30 hover:border-brand-amber/60"
                } `}
              >
                {/* Low balance warning icon */}
                {isLowBalance && <AlertCircle className="h-3.5 w-3.5 animate-pulse text-red-400" />}

                {/* Credit icon with pulse animation when low */}
                <Coins
                  className={`h-4 w-4 transition-all ${
                    isLowBalance
                      ? "animate-creditPulse text-red-400"
                      : "text-brand-amber group-hover:text-brand-amber/80"
                  } `}
                />

                {/* Credit count */}
                <span
                  className={`text-sm font-semibold transition-colors ${
                    isLowBalance
                      ? "text-red-400"
                      : "text-brand-amber group-hover:text-brand-amber/80"
                  } `}
                >
                  {diamonds ?? 0}
                </span>

                {/* "Buy more" hint on hover when low */}
                {isLowBalance && (
                  <span className="ml-0.5 hidden text-[10px] text-red-400/70 group-hover:inline">
                    Köp
                  </span>
                )}
              </div>
            </Link>
          )}

          {/* Auth section */}
          {!isInitialized ? (
            // Loading skeleton
            <div className="h-8 w-20 animate-pulse bg-gray-800/50" />
          ) : isAuthenticated ? (
            // User menu
            <div className="relative" data-user-menu>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 border border-gray-700 bg-gray-800/50 px-3 py-1.5 transition-colors hover:bg-gray-800"
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
                  <div className="from-brand-teal to-brand-blue flex h-6 w-6 items-center justify-center bg-linear-to-br">
                    <User className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <span className="hidden max-w-[100px] truncate text-sm text-gray-300 sm:block">
                  {user?.name || user?.email?.split("@")[0] || "Användare"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform ${
                    showUserMenu ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
                <div className="animate-in fade-in slide-in-from-top-2 absolute right-0 mt-2 w-56 border border-gray-800 bg-black py-1 shadow-xl shadow-black/50 duration-200">
                  {/* User info */}
                  <div className="border-b border-gray-800 px-4 py-3">
                    <p className="truncate text-sm font-medium text-white">
                      {user?.name || "Användare"}
                    </p>
                    <p className="truncate text-xs text-gray-500">{user?.email}</p>
                  </div>

                  {/* Balance */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-gray-800/50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <span className="text-sm text-gray-400">Credits</span>
                    <div className="flex items-center gap-1.5">
                      <Coins className="text-brand-amber h-4 w-4" />
                      <span className="text-brand-amber text-sm font-semibold">
                        {diamonds ?? 0}
                      </span>
                    </div>
                  </Link>

                  {/* Buy credits */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-800/50"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Wand2 className="text-brand-teal h-4 w-4" />
                    Köp credits
                  </Link>

                  {/* Logout */}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-400 transition-colors hover:bg-gray-800/50"
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
                className="text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <LogIn className="mr-1.5 h-4 w-4" />
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
            className="p-2 text-gray-400 hover:bg-gray-800/50 md:hidden"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            data-mobile-menu
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div
          className="animate-in slide-in-from-top-2 absolute top-16 right-0 left-0 border-b border-gray-800 bg-black/95 py-4 backdrop-blur-xl md:hidden"
          data-mobile-menu
        >
          <div className="mx-auto max-w-7xl space-y-2 px-4">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 ${
                isActive("/") ? "bg-gray-800/50 text-white" : "text-gray-400"
              }`}
            >
              <Wand2 className="h-5 w-5" />
              Skapa
            </Link>
            <Link
              href="/projects"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 ${
                isActive("/projects") ? "bg-gray-800/50 text-white" : "text-gray-400"
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
                <Coins className="text-brand-amber h-5 w-5" />
                Köp credits
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
