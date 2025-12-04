"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth, useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Diamond,
  FolderOpen,
  LogIn,
  LogOut,
  User,
  ChevronDown,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

interface NavbarProps {
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
}

export function Navbar({ onLoginClick, onRegisterClick }: NavbarProps) {
  const pathname = usePathname();
  const { user, isAuthenticated, diamonds, logout, fetchUser, isInitialized } =
    useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Fetch user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
      <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/30 transition-shadow">
            <Rocket className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">
            SajtMaskin
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className={`text-sm ${
                isActive("/")
                  ? "text-white bg-zinc-800/50"
                  : "text-zinc-400 hover:text-white"
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
              className={`text-sm ${
                isActive("/projects")
                  ? "text-white bg-zinc-800/50"
                  : "text-zinc-400 hover:text-white"
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
            <Link href="/buy-credits">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors cursor-pointer group">
                <Diamond className="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
                <span className="text-sm font-semibold text-amber-400 group-hover:text-amber-300">
                  {diamonds}
                </span>
              </div>
            </Link>
          )}

          {/* Auth section */}
          {!isInitialized ? (
            // Loading skeleton
            <div className="w-20 h-8 rounded-lg bg-zinc-800/50 animate-pulse" />
          ) : isAuthenticated ? (
            // User menu
            <div className="relative" data-user-menu>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors"
              >
                {user?.image ? (
                  <Image
                    src={user.image}
                    alt={user.name || ""}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <span className="text-sm text-zinc-300 max-w-[100px] truncate hidden sm:block">
                  {user?.name || user?.email?.split("@")[0] || "Användare"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-500 transition-transform ${
                    showUserMenu ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Dropdown menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl shadow-black/20 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.name || "Användare"}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {user?.email}
                    </p>
                  </div>

                  {/* Balance */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <span className="text-sm text-zinc-400">Diamanter</span>
                    <div className="flex items-center gap-1.5">
                      <Diamond className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-semibold text-amber-400">
                        {diamonds}
                      </span>
                    </div>
                  </Link>

                  {/* Buy credits */}
                  <Link
                    href="/buy-credits"
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors text-sm text-zinc-300"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    Köp diamanter
                  </Link>

                  {/* Divider */}
                  <div className="h-px bg-zinc-800 my-1" />

                  {/* Logout */}
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 hover:bg-zinc-800/50 transition-colors text-sm text-zinc-400"
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
                className="text-zinc-400 hover:text-white"
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Logga in
              </Button>
              <Button
                size="sm"
                onClick={onRegisterClick}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                Skapa konto
              </Button>
            </div>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-zinc-800/50 text-zinc-400"
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
          className="md:hidden absolute top-16 left-0 right-0 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800 py-4 animate-in slide-in-from-top-2"
          data-mobile-menu
        >
          <div className="max-w-7xl mx-auto px-4 space-y-2">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
                isActive("/") ? "bg-zinc-800/50 text-white" : "text-zinc-400"
              }`}
            >
              <Sparkles className="h-5 w-5" />
              Skapa
            </Link>
            <Link
              href="/projects"
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
                isActive("/projects")
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400"
              }`}
            >
              <FolderOpen className="h-5 w-5" />
              Projekt
            </Link>
            {isAuthenticated && (
              <Link
                href="/buy-credits"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-zinc-400"
              >
                <Diamond className="h-5 w-5 text-amber-400" />
                Köp diamanter
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
