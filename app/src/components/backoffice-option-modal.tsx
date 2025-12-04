"use client";

import { useState } from "react";
import { X, Lock, Check, Download, Rocket, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackofficeOptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (includeBackoffice: boolean, password?: string) => void;
  mode: "download" | "publish";
  isLoading?: boolean;
}

export function BackofficeOptionModal({
  isOpen,
  onClose,
  onConfirm,
  mode,
  isLoading = false,
}: BackofficeOptionModalProps) {
  const [includeBackoffice, setIncludeBackoffice] = useState(true);
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  if (!isOpen) return null;

  const MIN_PASSWORD_LENGTH = 6;

  const handleConfirm = () => {
    // If backoffice is selected, validate password
    if (includeBackoffice) {
      // Show password input if not visible yet
      if (!showPasswordInput) {
        setShowPasswordInput(true);
        return;
      }
      // Validate minimum length (defense in depth - button also checks this)
      if (password.length < MIN_PASSWORD_LENGTH) {
        return;
      }
    }
    onConfirm(includeBackoffice, includeBackoffice ? password : undefined);
  };

  const handleToggleBackoffice = () => {
    setIncludeBackoffice(!includeBackoffice);
    if (includeBackoffice) {
      setShowPasswordInput(false);
      setPassword("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {mode === "download" ? (
              <Download className="h-5 w-5 text-teal-500" />
            ) : (
              <Rocket className="h-5 w-5 text-teal-500" />
            )}
            <h2 className="text-lg font-semibold text-white">
              {mode === "download" ? "Ladda ner sajt" : "Publicera sajt"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Backoffice option */}
          <div
            onClick={handleToggleBackoffice}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              includeBackoffice
                ? "border-teal-500 bg-teal-500/10"
                : "border-gray-700 hover:border-gray-600"
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  includeBackoffice
                    ? "border-teal-500 bg-teal-500"
                    : "border-gray-600"
                }`}
              >
                {includeBackoffice && <Check className="h-4 w-4 text-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-teal-500" />
                  <h3 className="font-medium text-white">
                    Inkludera Backoffice
                  </h3>
                  <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded">
                    Rekommenderas
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Lägg till ett admin-panel på{" "}
                  <code className="text-teal-400">/backoffice</code> där du
                  enkelt kan:
                </p>
                <ul className="mt-2 text-sm text-gray-500 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="text-teal-500">✓</span> Redigera texter och
                    rubriker
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-500">✓</span> Byta ut bilder
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-teal-500">✓</span> Ändra färgtema
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Password input */}
          {includeBackoffice && showPasswordInput && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-gray-400">
                  Välj ett lösenord för backoffice
                </span>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minst 6 tecken"
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                    autoFocus
                  />
                </div>
              </label>
              {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
                <p className="text-sm text-amber-400">
                  Lösenordet måste vara minst {MIN_PASSWORD_LENGTH} tecken
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
            disabled={isLoading}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading ||
              (includeBackoffice &&
                showPasswordInput &&
                password.length < MIN_PASSWORD_LENGTH)
            }
            className="flex-1 bg-teal-600 hover:bg-teal-500 text-white"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Förbereder...
              </span>
            ) : mode === "download" ? (
              <>
                <Download className="h-4 w-4 mr-2" />
                Ladda ner
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4 mr-2" />
                Publicera
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
