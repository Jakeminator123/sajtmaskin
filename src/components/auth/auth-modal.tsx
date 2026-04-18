"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Eye, EyeOff, Loader2, ChevronDown } from "lucide-react";
import { Mascot } from "@/components/mascot/Mascot";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "login" | "register";
}

export function AuthModal({ isOpen, onClose, defaultMode = "login" }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResendVerification, setShowResendVerification] = useState(false);

  const { setUser } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setError(null);
      setSuccessMessage(null);
      setShowResendVerification(false);
      setShowEmailForm(false);
    }
  }, [defaultMode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setPassword("");
      setName("");
      setShowPassword(false);
      setError(null);
      setSuccessMessage(null);
      setShowResendVerification(false);
      setShowEmailForm(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setShowResendVerification(false);
    setIsLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login" ? { email, password } : { email, password, name: name || undefined };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Något gick fel. Försök igen.");
        setShowResendVerification(Boolean(data.requiresEmailVerification && email));
        return;
      }

      if (mode === "register" && data.requiresEmailVerification) {
        if (data.emailVerificationSent === false) {
          setError(data.message || "Konto skapat men mail kunde inte skickas.");
          setShowResendVerification(Boolean(email));
        } else {
          setSuccessMessage(data.message || "Verifieringsmail skickat. Kolla din inbox.");
        }
        setMode("login");
        setPassword("");
        return;
      }

      if (data.user) setUser(data.user);
      onClose();
      setEmail("");
      setPassword("");
      setName("");
    } catch {
      setError("Kunde inte ansluta till servern.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "Kunde inte skicka mail.");
        return;
      }
      setSuccessMessage(data.message || "Verifieringsmail skickat.");
      setShowResendVerification(false);
    } catch {
      setError("Kunde inte skicka mail.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const redirectTarget =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/";
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirectTarget)}`;
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="animate-in fade-in zoom-in-95 relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl duration-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          aria-label="Stäng"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 pb-2 text-center">
          <div className="mx-auto mb-2 flex justify-center">
            <Mascot slot="key" size={96} decorative />
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            {mode === "login" ? "Logga in" : "Skapa konto"}
          </h2>
          {mode === "register" && (
            <span className="mt-1.5 inline-block rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
              +50 credits
            </span>
          )}
        </div>

        <div className="space-y-3 p-6 pt-3">
          {/* Google — primary action */}
          <Button
            type="button"
            className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleGoogleLogin}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Fortsätt med Google
          </Button>

          {/* Progressive disclosure for email */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              eller med e-post
              <ChevronDown className="h-3 w-3" />
            </button>
          ) : (
            <>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/30" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">eller</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === "register" && (
                  <Input
                    type="text"
                    placeholder="Namn (valfritt)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10"
                  />
                )}
                <Input
                  type="email"
                  placeholder="din@email.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10"
                />
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "register" ? "Lösenord (minst 6 tecken)" : "Lösenord"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 6 : undefined}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
                {successMessage && (
                  <p className="text-xs text-primary">{successMessage}</p>
                )}
                {showResendVerification && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleResendVerification}
                    disabled={isLoading}
                  >
                    Skicka verifieringsmail igen
                  </Button>
                )}

                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 w-full"
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
            </>
          )}
        </div>

        <div className="px-6 pb-5 text-center text-xs text-muted-foreground">
          {mode === "login" ? (
            <>
              Inget konto?{" "}
              <button onClick={() => { setMode("register"); setError(null); }} className="text-primary hover:underline">
                Skapa konto
              </button>
            </>
          ) : (
            <>
              Har konto?{" "}
              <button onClick={() => { setMode("login"); setError(null); }} className="text-primary hover:underline">
                Logga in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
