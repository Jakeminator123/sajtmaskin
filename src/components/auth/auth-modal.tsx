"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, Wand2 } from "lucide-react";

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
        setError(
          data.error || "Inloggning misslyckades. Kontrollera dina uppgifter och försök igen.",
        );
        setShowResendVerification(Boolean(data.requiresEmailVerification && email));
        return;
      }

      if (mode === "register" && data.requiresEmailVerification) {
        if (data.emailVerificationSent === false) {
          setError(
            data.message ||
              "Konto skapat, men verifieringsmail kunde inte skickas just nu. Försök igen.",
          );
          setShowResendVerification(Boolean(email));
        } else {
          setSuccessMessage(
            data.message ||
              "Vi har skickat ett verifieringsmail. Bekräfta din e-post för att aktivera konto och credits.",
          );
        }
        setMode("login");
        setPassword("");
        return;
      }

      // Update auth store
      if (data.user) {
        setUser(data.user);
      }

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
        setError(data.error || "Kunde inte skicka verifieringsmail");
        return;
      }
      setSuccessMessage(data.message || "Verifieringsmail skickat.");
      setShowResendVerification(false);
    } catch {
      setError("Kunde inte skicka verifieringsmail");
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
    // The path is a route handler that 302s to accounts.google.com, not a Next
    // page: the client router cannot follow a cross-origin redirect, so this has
    // to be a document navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirectTarget)}`;
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-lg" onClick={onClose} />

      {/* Modal */}
      <div className="animate-in fade-in zoom-in-95 border-border/35 bg-card/85 relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-2xl duration-200">
        <div className="from-primary/12 to-primary/4 pointer-events-none absolute inset-0 bg-linear-to-br via-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="border-border/20 bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary absolute top-4 right-4 z-20 rounded-lg border p-1.5 transition-colors"
          aria-label="Stäng inloggning"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="relative z-10 p-6 pb-4 text-center">
          <h2 className="text-foreground text-2xl font-(--font-heading) tracking-tight">
            {mode === "login" ? "Välkommen tillbaka!" : "Skapa konto"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {mode === "login"
              ? "Logga in för att fortsätta bygga"
              : "Få din första generering utan coin-debitering"}
          </p>

          {/* Account-bound first-generation entitlement */}
          {mode === "register" && (
            <div className="border-primary/25 bg-primary/10 mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2">
              <Wand2 className="text-primary h-4 w-4" />
              <span className="text-primary text-sm font-medium">
                En kostnadsfri första generering
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="relative z-10 space-y-4 p-6 pt-0">
          {/* Google login */}
          <Button
            type="button"
            variant="outline"
            className="border-border/30 bg-secondary/50 text-foreground hover:bg-secondary/75 h-11 w-full"
            onClick={handleGoogleLogin}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
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
              <div className="border-border/25 w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card text-muted-foreground px-2">eller med e-post</span>
            </div>
          </div>

          {/* Name field (register only) */}
          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-foreground/90 text-sm font-medium">Namn (valfritt)</label>
              <div className="relative">
                <User className="text-muted-foreground/70 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  type="text"
                  placeholder="Ditt namn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border/35 bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/45 h-11 pl-10"
                />
              </div>
            </div>
          )}

          {/* Email field */}
          <div className="space-y-1.5">
            <label className="text-foreground/90 text-sm font-medium">E-post</label>
            <div className="relative">
              <Mail className="text-muted-foreground/70 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="email"
                placeholder="din@email.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border/35 bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/45 h-11 pl-10"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-foreground/90 text-sm font-medium">Lösenord</label>
            <div className="relative">
              <Lock className="text-muted-foreground/70 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={mode === "register" ? "Minst 6 tecken" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                className="border-border/35 bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/45 h-11 pr-10 pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground/80 hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="border-destructive/35 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="border-primary/35 bg-primary/10 text-primary rounded-xl border p-3 text-sm">
              {successMessage}
            </div>
          )}

          {showResendVerification && (
            <Button
              type="button"
              variant="outline"
              className="border-border/35 bg-secondary/50 text-foreground hover:bg-secondary/75 h-10 w-full"
              onClick={handleResendVerification}
              disabled={isLoading}
            >
              Skicka verifieringsmail igen
            </Button>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary-hover h-11 w-full font-medium"
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
        <div className="text-muted-foreground relative z-10 p-6 pt-0 text-center text-sm">
          {mode === "login" ? (
            <>
              Har du inget konto?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="text-primary hover:text-primary/80 font-medium"
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
                className="text-primary hover:text-primary/80 font-medium"
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
