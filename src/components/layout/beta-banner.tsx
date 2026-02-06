"use client";

import { useState } from "react";
import { X, Rocket, Mail, Send, Loader2, MessageSquare } from "lucide-react";

/**
 * Beta/construction banner shown when NEXT_PUBLIC_BETA_BANNER=1.
 * Includes inline feedback form that sends to hej@sajtmaskin.se + erik@sajtstudio.se.
 * Dismissable per session (sessionStorage).
 */
export function BetaBanner() {
  const enabled = process.env.NEXT_PUBLIC_BETA_BANNER === "1";
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("beta_banner_dismissed") === "1";
  });
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  if (!enabled || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("beta_banner_dismissed", "1");
    } catch {
      // ignore
    }
  };

  const handleSend = async () => {
    if (!formData.message.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name || "Beta-anvandare",
          email: formData.email || "noreply@sajtmaskin.se",
          message: formData.message,
          type: "feedback",
          subject: "Beta-feedback",
        }),
      });
      setSent(true);
      setTimeout(() => {
        setShowForm(false);
        setSent(false);
        setFormData({ name: "", email: "", message: "" });
      }, 2000);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative z-50 border-b border-brand-teal/20 bg-linear-to-r from-brand-teal/10 via-brand-blue/10 to-brand-amber/10">
      {/* Animated gradient line */}
      <div
        className="absolute top-0 left-0 h-[2px] w-full"
        style={{
          background:
            "linear-gradient(90deg, #14b8a6, #3b82f6, #f59e0b, #14b8a6)",
          backgroundSize: "200% 100%",
          animation: "betaGradient 4s linear infinite",
        }}
      />

      <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Icon */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-teal/20">
            <Rocket className="h-3.5 w-3.5 text-brand-teal" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-gray-300 sm:text-sm">
              <strong className="text-white">Sajtmaskin ar i tidig betafas.</strong>{" "}
              Vi bygger Sveriges smartaste sajtbyggare for foretag — driven av
              affarsmal, inte mallar.
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 rounded-md border border-brand-teal/20 bg-brand-teal/10 px-2.5 py-1 text-[11px] font-medium text-brand-teal transition-colors hover:bg-brand-teal/20"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="hidden sm:inline">Ge feedback</span>
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
              aria-label="Stang banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Inline feedback form */}
        {showForm && (
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-700/50 bg-black/40 p-3 backdrop-blur-sm">
            {sent ? (
              <div className="flex items-center gap-2 py-2 text-sm text-brand-teal">
                <Send className="h-4 w-4" />
                Tack for din feedback!
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Namn (valfritt)"
                    className="flex-1 rounded-md border border-gray-700 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-brand-teal/50 focus:outline-none"
                  />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    placeholder="E-post (valfritt)"
                    className="flex-1 rounded-md border border-gray-700 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-brand-teal/50 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.message}
                    onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Beskriv en bugg, ge feedback eller stall en fraga..."
                    className="flex-1 rounded-md border border-gray-700 bg-black/50 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-brand-teal/50 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSend}
                    disabled={!formData.message.trim() || sending}
                    className="flex items-center gap-1.5 rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Skicka
                  </button>
                </div>
                <p className="flex items-center gap-1 text-[10px] text-gray-600">
                  <Mail className="h-2.5 w-2.5" />
                  Skickas till hej@sajtmaskin.se
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes betaGradient {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
