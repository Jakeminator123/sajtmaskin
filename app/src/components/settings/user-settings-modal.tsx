"use client";

import { useEffect, useState } from "react";
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
  Zap,
  Brain,
} from "lucide-react";

interface UserSettings {
  use_ai_gateway: boolean;
  has_ai_gateway_key: boolean;
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
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state for API keys (only sent when explicitly saved)
  const [aiGatewayKey, setAiGatewayKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  // Toggle states
  const [useAiGateway, setUseAiGateway] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [enableThinking, setEnableThinking] = useState(true);

  // Fetch settings on open
  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setUseAiGateway(data.settings.use_ai_gateway);
        setEnableStreaming(data.settings.enable_streaming);
        setEnableThinking(data.settings.enable_thinking_display);
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
        use_ai_gateway: useAiGateway,
        enable_streaming: enableStreaming,
        enable_thinking_display: enableThinking,
      };

      // Only include API keys if they were entered (not empty placeholder)
      if (aiGatewayKey) {
        updates.ai_gateway_api_key = aiGatewayKey;
      }
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
        setAiGatewayKey("");
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

  const handleClearKey = async (keyType: "ai_gateway" | "openai" | "anthropic") => {
    setIsSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (keyType === "ai_gateway") updates.ai_gateway_api_key = "";
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-gray-950 border border-gray-800 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/20">
              <Settings className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Inställningar</h2>
              <p className="text-sm text-gray-400">
                Anpassa AI-modeller och API-nycklar
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* AI Gateway Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-medium text-gray-200">
                      Vercel AI Gateway
                    </h3>
                    <p className="text-xs text-gray-500">
                      Använd Vercels AI Gateway för alla modeller ($5 gratis/mån)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUseAiGateway(!useAiGateway)}
                  className={`
                    relative w-12 h-6 rounded-full transition-all duration-200
                    ${useAiGateway ? "bg-amber-500" : "bg-gray-700"}
                  `}
                >
                  <span
                    className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm
                      transition-transform duration-200
                      ${useAiGateway ? "left-7" : "left-1"}
                    `}
                  />
                </button>
              </div>

              {useAiGateway && (
                <div className="ml-8 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-xs text-amber-300/80">
                    AI Gateway ger tillgång till OpenAI, Anthropic, Groq m.fl. via ett enda API.
                    Du behöver en AI_GATEWAY_API_KEY från Vercels dashboard.
                  </p>
                </div>
              )}
            </div>

            {/* Thinking Display Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-medium text-gray-200">
                    Visa AI-resonemang
                  </h3>
                  <p className="text-xs text-gray-500">
                    Visa vad AI:n tänker under generering
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEnableThinking(!enableThinking)}
                className={`
                  relative w-12 h-6 rounded-full transition-all duration-200
                  ${enableThinking ? "bg-purple-500" : "bg-gray-700"}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm
                    transition-transform duration-200
                    ${enableThinking ? "left-7" : "left-1"}
                  `}
                />
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-800" />

            {/* API Keys Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  <Key className="h-4 w-4 text-gray-400" />
                  API-nycklar (valfritt)
                </h3>
                <button
                  onClick={() => setShowKeys(!showKeys)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                >
                  {showKeys ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys ? "Dölj" : "Visa"}
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Lägg till egna API-nycklar för att använda dina egna kvoter istället för plattformens.
              </p>

              {/* AI Gateway Key */}
              {useAiGateway && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400">
                    AI Gateway API Key
                    {settings?.has_ai_gateway_key && (
                      <span className="ml-2 text-green-400">✓ Konfigurerad</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type={showKeys ? "text" : "password"}
                      placeholder={settings?.has_ai_gateway_key ? "••••••••" : "AI_GATEWAY_API_KEY"}
                      value={aiGatewayKey}
                      onChange={(e) => setAiGatewayKey(e.target.value)}
                      className="flex-1 h-9 bg-gray-900 border-gray-700 text-white text-sm"
                    />
                    {settings?.has_ai_gateway_key && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClearKey("ai_gateway")}
                        className="h-9 px-3 border-red-800 text-red-400 hover:bg-red-900/20"
                      >
                        Ta bort
                      </Button>
                    )}
                  </div>
                </div>
              )}

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
                    className="flex-1 h-9 bg-gray-900 border-gray-700 text-white text-sm"
                  />
                  {settings?.has_openai_key && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey("openai")}
                      className="h-9 px-3 border-red-800 text-red-400 hover:bg-red-900/20"
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
                    className="flex-1 h-9 bg-gray-900 border-gray-700 text-white text-sm"
                  />
                  {settings?.has_anthropic_key && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey("anthropic")}
                      className="h-9 px-3 border-red-800 text-red-400 hover:bg-red-900/20"
                    >
                      Ta bort
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Error/Success messages */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-sm text-green-400">
                <Check className="h-4 w-4 flex-shrink-0" />
                {success}
              </div>
            )}

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full h-10 bg-violet-600 hover:bg-violet-500 text-white font-medium"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Spara inställningar"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

