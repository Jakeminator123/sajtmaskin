"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Key,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Settings,
  Brain,
  Sparkles,
  ChevronDown,
  Github,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-store";

// Simple two-tier model selection: Premium (best quality) vs Fast (quick responses)
const MODEL_TIERS = {
  premium: {
    name: "🏆 Premium",
    desc: "Bäst kvalitet, kan ta längre tid",
    color: "from-brand-amber/20 to-brand-warm/20",
    border: "border-brand-amber/30",
  },
  fast: {
    name: "⚡ Snabb",
    desc: "Snabba svar, bra för iteration",
    color: "from-brand-blue/20 to-brand-teal/20",
    border: "border-brand-blue/30",
  },
} as const;

// Curated models: 3 Premium + 3 Fast
const AVAILABLE_MODELS = [
  // ═══ PREMIUM (Supermodeller - bäst kvalitet, kan ta tid) ═══
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    tier: "premium" as const,
    desc: "Smartaste modellen - djup analys & kreativitet",
    badge: "👑 BÄST",
  },
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    provider: "OpenAI",
    tier: "premium" as const,
    desc: "OpenAIs mest kapabla modell",
    badge: "🚀 SENASTE",
  },
  {
    id: "xai/grok-code-fast-1",
    name: "Grok Code Fast 1",
    provider: "xAI",
    tier: "premium" as const,
    desc: "Optimerad för kod - snabb & precis",
    badge: "💻 KOD",
  },

  // ═══ SNABB (För snabb iteration och prototyping) ═══
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    tier: "fast" as const,
    desc: "Snabb & kostnadseffektiv - bra balans",
    badge: "⭐ DEFAULT",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    tier: "fast" as const,
    desc: "1M tokens context - blixtsnabb",
    badge: "🔥 1M CTX",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    tier: "fast" as const,
    desc: "Snabb Claude - billig & pålitlig",
    badge: "💨 SNABB",
  },
];

interface UserSettings {
  has_openai_key: boolean;
  has_anthropic_key: boolean;
  preferred_model: string;
  preferred_quality: string;
  enable_streaming: boolean;
  enable_thinking_display: boolean;
}

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { user, isAuthenticated, hasGitHub, fetchUser } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isGitHubUpdating, setIsGitHubUpdating] = useState(false);
  const [returnTo, setReturnTo] = useState("/projects");

  // Form state for API keys (only sent when explicitly saved)
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  // Toggle states
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [enableThinking, setEnableThinking] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState("openai/gpt-4o-mini");
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Get current model info
  const currentModelInfo = useMemo(() => {
    return (
      AVAILABLE_MODELS.find((m) => m.id === selectedModel) || {
        id: selectedModel,
        name: selectedModel.split("/").pop() || selectedModel,
        provider: selectedModel.split("/")[0] || "Unknown",
        tier: "fast" as const,
        desc: "",
        badge: "",
      }
    );
  }, [selectedModel]);

  // Group models by tier
  const premiumModels = AVAILABLE_MODELS.filter((m) => m.tier === "premium");
  const fastModels = AVAILABLE_MODELS.filter((m) => m.tier === "fast");

  // Fetch settings on open
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setReturnTo(path || "/projects");
  }, [isOpen]);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setEnableStreaming(data.settings.enable_streaming);
        setEnableThinking(data.settings.enable_thinking_display);
        if (data.settings.preferred_model) {
          setSelectedModel(data.settings.preferred_model);
        }
      } else {
        setError(data.error || "Kunde inte hämta inställningar");
      }
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updates: Record<string, unknown> = {
        enable_streaming: enableStreaming,
        enable_thinking_display: enableThinking,
        preferred_model: selectedModel,
      };

      // Only include API keys if they were entered (not empty placeholder)
      if (openaiKey) {
        updates.openai_api_key = openaiKey;
      }
      if (anthropicKey) {
        updates.anthropic_api_key = anthropicKey;
      }

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess("Inställningar sparade!");
        // Clear key inputs after save
        setOpenaiKey("");
        setAnthropicKey("");
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Kunde inte spara inställningar");
      }
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearKey = async (keyType: "openai" | "anthropic") => {
    setIsSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (keyType === "openai") updates.openai_api_key = "";
      if (keyType === "anthropic") updates.anthropic_api_key = "";

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSuccess("Nyckel borttagen");
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch {
      setError("Kunde inte ta bort nyckel");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGitHubDisconnect = async () => {
    setIsGitHubUpdating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/auth/github/disconnect", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Kunde inte koppla bort GitHub");
      }
      await fetchUser();
      setSuccess("GitHub frånkopplat");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte koppla bort GitHub");
    } finally {
      setIsGitHubUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="animate-in fade-in zoom-in-95 relative mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto border border-gray-800 bg-gray-950 shadow-2xl duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="border-b border-gray-800 p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-blue/20 rounded-lg p-2">
              <Settings className="text-brand-blue h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Inställningar</h2>
              <p className="text-sm text-gray-400">Anpassa AI-modeller och API-nycklar</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {/* Model Selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Sparkles className="text-brand-teal h-5 w-5" />
                <div>
                  <h3 className="text-sm font-medium text-gray-200">Föredragen AI-modell</h3>
                  <p className="text-xs text-gray-500">Välj standardmodell för generering</p>
                </div>
              </div>

              {/* Model Selector Button */}
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className={`flex w-full items-center justify-between rounded-lg border bg-gray-900 p-3 transition-colors hover:border-gray-600 ${
                  currentModelInfo.tier === "premium"
                    ? "border-brand-amber/30"
                    : "border-brand-blue/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium ${
                      currentModelInfo.tier === "premium"
                        ? "from-brand-amber/20 to-brand-warm/20 text-brand-amber bg-linear-to-br"
                        : "from-brand-blue/20 to-brand-teal/20 text-brand-blue bg-linear-to-br"
                    }`}
                  >
                    {currentModelInfo.provider.charAt(0)}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{currentModelInfo.name}</p>
                      {currentModelInfo.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            currentModelInfo.tier === "premium"
                              ? "bg-brand-amber/20 text-brand-amber/80"
                              : "bg-brand-blue/20 text-brand-blue/80"
                          }`}
                        >
                          {currentModelInfo.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{currentModelInfo.desc}</p>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform ${
                    showModelPicker ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Model Picker Dropdown */}
              {showModelPicker && (
                <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
                  {/* Premium Models */}
                  <div className="border-b border-gray-800">
                    <div className={`bg-linear-to-r px-3 py-2 ${MODEL_TIERS.premium.color}`}>
                      <p className="text-brand-amber/80 text-xs font-medium">
                        {MODEL_TIERS.premium.name}
                      </p>
                      <p className="text-brand-amber/60 text-[10px]">{MODEL_TIERS.premium.desc}</p>
                    </div>
                    {premiumModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setShowModelPicker(false);
                        }}
                        className={`hover:bg-brand-amber/10 flex w-full items-center gap-3 p-3 transition-colors ${
                          selectedModel === model.id
                            ? "bg-brand-amber/20 border-brand-amber border-l-2"
                            : ""
                        }`}
                      >
                        <div className="from-brand-amber/20 to-brand-warm/20 text-brand-amber flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br text-sm font-medium">
                          {model.provider.charAt(0)}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{model.name}</p>
                            {model.badge && (
                              <span className="bg-brand-amber/20 text-brand-amber/80 rounded px-1.5 py-0.5 text-[10px]">
                                {model.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{model.desc}</p>
                        </div>
                        {selectedModel === model.id && (
                          <Check className="text-brand-amber h-4 w-4" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Fast Models */}
                  <div>
                    <div className={`bg-linear-to-r px-3 py-2 ${MODEL_TIERS.fast.color}`}>
                      <p className="text-brand-blue/80 text-xs font-medium">
                        {MODEL_TIERS.fast.name}
                      </p>
                      <p className="text-brand-blue/60 text-[10px]">{MODEL_TIERS.fast.desc}</p>
                    </div>
                    {fastModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setShowModelPicker(false);
                        }}
                        className={`hover:bg-brand-blue/10 flex w-full items-center gap-3 p-3 transition-colors ${
                          selectedModel === model.id
                            ? "bg-brand-blue/20 border-brand-blue border-l-2"
                            : ""
                        }`}
                      >
                        <div className="from-brand-blue/20 to-brand-teal/20 text-brand-blue flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br text-sm font-medium">
                          {model.provider.charAt(0)}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">{model.name}</p>
                            {model.badge && (
                              <span className="bg-brand-blue/20 text-brand-blue/80 rounded px-1.5 py-0.5 text-[10px]">
                                {model.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{model.desc}</p>
                        </div>
                        {selectedModel === model.id && (
                          <Check className="text-brand-blue h-4 w-4" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Thinking Display Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="text-brand-blue h-5 w-5" />
                <div>
                  <h3 className="text-sm font-medium text-gray-200">Visa AI-resonemang</h3>
                  <p className="text-xs text-gray-500">Visa vad AI:n tänker under generering</p>
                </div>
              </div>
              <button
                onClick={() => setEnableThinking(!enableThinking)}
                className={`relative h-6 w-12 rounded-full transition-all duration-200 ${enableThinking ? "bg-brand-blue" : "bg-gray-700"} `}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${enableThinking ? "left-7" : "left-1"} `}
                />
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-800" />

            {/* API Keys Section - wrapped in form to avoid DOM warning */}
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-200">
                  <Key className="h-4 w-4 text-gray-400" />
                  API-nycklar (valfritt)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowKeys(!showKeys)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
                >
                  {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys ? "Dölj" : "Visa"}
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Lägg till egna API-nycklar för att använda dina egna kvoter istället för
                plattformens.
              </p>

              {/* OpenAI Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">
                  OpenAI API Key
                  {settings?.has_openai_key && (
                    <span className="ml-2 text-green-400">✓ Konfigurerad</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys ? "text" : "password"}
                    placeholder={settings?.has_openai_key ? "••••••••" : "sk-..."}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="h-9 flex-1 border-gray-700 bg-gray-900 text-sm text-white"
                  />
                  {settings?.has_openai_key && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey("openai")}
                      className="h-9 border-red-800 px-3 text-red-400 hover:bg-red-900/20"
                    >
                      Ta bort
                    </Button>
                  )}
                </div>
              </div>

              {/* Anthropic Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">
                  Anthropic API Key
                  {settings?.has_anthropic_key && (
                    <span className="ml-2 text-green-400">✓ Konfigurerad</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <Input
                    type={showKeys ? "text" : "password"}
                    placeholder={settings?.has_anthropic_key ? "••••••••" : "sk-ant-..."}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    className="h-9 flex-1 border-gray-700 bg-gray-900 text-sm text-white"
                  />
                  {settings?.has_anthropic_key && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey("anthropic")}
                      className="h-9 border-red-800 px-3 text-red-400 hover:bg-red-900/20"
                    >
                      Ta bort
                    </Button>
                  )}
                </div>
              </div>
            </form>

            {/* Divider */}
            <div className="border-t border-gray-800" />

            {/* GitHub Integration */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Github className="text-brand-blue h-5 w-5" />
                <div>
                  <h3 className="text-sm font-medium text-gray-200">GitHub</h3>
                  <p className="text-xs text-gray-500">
                    Koppla GitHub för privata repos och export
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                {isAuthenticated ? (
                  hasGitHub ? (
                    <>
                      <span className="text-xs text-gray-400">
                        Kopplat som <span className="text-gray-200">@{user?.github_username}</span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGitHubDisconnect}
                        disabled={isGitHubUpdating}
                        className="h-8 border-red-800 px-3 text-red-400 hover:bg-red-900/20"
                      >
                        {isGitHubUpdating ? "Jobbar..." : "Koppla bort"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isGitHubUpdating}
                      onClick={() =>
                        window.location.assign(
                          `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`,
                        )
                      }
                      className="h-8 px-3"
                    >
                      Koppla GitHub
                    </Button>
                  )
                ) : (
                  <span className="text-xs text-gray-500">Logga in för att koppla GitHub</span>
                )}
              </div>
            </div>

            {/* Error/Success messages */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
                <Check className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-brand-blue hover:bg-brand-blue/90 h-10 w-full font-medium text-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Spara inställningar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
