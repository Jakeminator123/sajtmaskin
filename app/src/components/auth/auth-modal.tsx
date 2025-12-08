"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  Diamond,
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "login" | "register";
}

export function AuthModal({
  isOpen,
  onClose,
  defaultMode = "login",
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setUser } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setError(null);
    }
  }, [defaultMode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setPassword("");
      setName("");
      setShowPassword(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, name: name || undefined };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Något gick fel");
        return;
      }

      // Update auth store
      setUser(data.user);

      // Close modal
      onClose();

      // Reset form
      setEmail("");
      setPassword("");
      setName("");
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect to Google OAuth
    const redirectTarget =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/";
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(
      redirectTarget
    )}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-black border border-gray-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center">
          <h2 className="text-2xl font-bold text-white">
            {mode === "login" ? "Välkommen tillbaka!" : "Skapa konto"}
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            {mode === "login"
              ? "Logga in för att fortsätta bygga"
              : "Få 5 gratis diamanter när du skapar konto"}
          </p>

          {/* Signup bonus indicator */}
          {mode === "register" && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30">
              <Diamond className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">
                +5 diamanter gratis
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-4">
          {/* Google login */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 border-gray-700 bg-gray-900/50 hover:bg-gray-800 text-white"
            onClick={handleGoogleLogin}
          >
            <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Fortsätt med Google
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-black text-gray-500">
                eller med e-post
              </span>
            </div>
          </div>

          {/* Name field (register only) */}
          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">
                Namn (valfritt)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Ditt namn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 h-11 bg-black/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">E-post</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type="email"
                placeholder="din@email.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10 h-11 bg-black/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">
              Lösenord
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={
                  mode === "register" ? "Minst 6 tecken" : "••••••••"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                className="pl-10 pr-10 h-11 bg-black/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-teal-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            className="w-full h-11 bg-teal-600 hover:bg-teal-500 text-white font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "login" ? (
              "Logga in"
            ) : (
              "Skapa konto"
            )}
          </Button>
        </form>

        {/* Toggle mode */}
        <div className="p-6 pt-0 text-center text-sm text-gray-400">
          {mode === "login" ? (
            <>
              Har du inget konto?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="text-teal-400 hover:text-teal-300 font-medium"
              >
                Skapa konto
              </button>
            </>
          ) : (
            <>
              Har du redan ett konto?{" "}
              <button
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="text-teal-400 hover:text-teal-300 font-medium"
              >
                Logga in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
