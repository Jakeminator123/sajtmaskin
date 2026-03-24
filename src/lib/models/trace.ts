import {
  DEFAULT_PROMPT_POLISH_MODEL,
  MODEL_TIER_OPTIONS,
  PROMPT_ASSIST_MODEL_OPTIONS,
  getDefaultPromptAssistModel,
  getPromptAssistModelLabel,
} from "@/lib/builder/defaults";
import {
  isAnthropicAssistModel,
  isGatewayAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
  type PromptAssistProvider,
} from "@/lib/builder/promptAssist";
import {
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  OWN_MODEL_IDS,
  canonicalModelIdToOwnModelId,
  canonicalizeModelId,
  getBuildProfileId,
  type CanonicalModelId,
} from "@/lib/models/catalog";

export type ModelProviderFamily = "openai" | "anthropic" | "v0" | "off" | "unknown";

export type ModelTraceRequest = {
  selectedModelTier?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  thinking?: boolean;
  canUseDeepBrief?: boolean;
};

export type BuildProfileTrace = {
  id: CanonicalModelId;
  buildProfileId: string;
  uiLabel: string;
  uiDescription: string;
  configuredModel: string;
  provider: ModelProviderFamily;
  knownCatalogModel: boolean;
  warnings: string[];
};

export type PromptAssistOptionTrace = {
  value: string;
  label: string;
  provider: PromptAssistProvider | "off";
  providerFamily: ModelProviderFamily;
  allowed: boolean;
  visibleInUi: boolean;
  deepBriefEligible: boolean;
};

export type ModelTraceRouteInfo = {
  key: string;
  label: string;
  route: string;
  purpose: string;
  active: boolean;
};

export interface ModelTraceSnapshot {
  generatedAt: string;
  selected: {
    buildProfileId: string;
    buildProfileLabel: string;
    buildTier: CanonicalModelId;
    buildModel: string;
    buildProvider: ModelProviderFamily;
    buildKnownCatalogModel: boolean;
    thinkingRequested: boolean;
    promptAssistModel: string;
    promptAssistLabel: string;
    promptAssistProvider: PromptAssistProvider | "off";
    promptAssistProviderFamily: ModelProviderFamily;
    promptAssistAllowed: boolean;
    promptAssistVisibleInUi: boolean;
    promptAssistDeepRequested: boolean;
    promptAssistDeepActive: boolean;
    canUseDeepBrief: boolean;
    polishModel: string;
    polishModelAllowed: boolean;
    polishProviderFamily: ModelProviderFamily;
  };
  buildProfiles: BuildProfileTrace[];
  promptAssistOptions: PromptAssistOptionTrace[];
  auth: {
    openai: boolean;
    anthropic: boolean;
    v0: boolean;
    aiGatewayApiKey: boolean;
    vercelOidcToken: boolean;
    onVercel: boolean;
  };
  routes: ModelTraceRouteInfo[];
  warnings: string[];
  notes: string[];
}

function isProbablyOnVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function resolveBuildProvider(modelId: string): ModelProviderFamily {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("v0-")) return "v0";
  return "unknown";
}

function resolvePromptAssistProviderFamily(model: string): ModelProviderFamily {
  if (isPromptAssistOff(model)) return "off";
  if (
    isAnthropicAssistModel(model) ||
    model.startsWith("anthropic/") ||
    model.startsWith("anthropic-direct/")
  ) {
    return "anthropic";
  }
  if (model.startsWith("openai/") || model.startsWith("gpt-")) return "openai";
  return "unknown";
}

function getResolvedPromptAssistProvider(model: string): PromptAssistProvider | "off" {
  if (isPromptAssistOff(model)) return "off";
  return resolvePromptAssistProvider(model);
}

function hasProviderKey(provider: ModelProviderFamily): boolean {
  switch (provider) {
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    case "v0":
      return Boolean(process.env.V0_API_KEY?.trim());
    default:
      return true;
  }
}

function buildProfileTrace(tier: CanonicalModelId): BuildProfileTrace {
  const option = MODEL_TIER_OPTIONS.find((entry) => entry.value === tier);
  const configuredModel = canonicalModelIdToOwnModelId(tier);
  const provider = resolveBuildProvider(configuredModel);
  const warnings: string[] = [];

  if (!OWN_MODEL_IDS.includes(configuredModel as (typeof OWN_MODEL_IDS)[number])) {
    warnings.push("Configured model is not part of the current own-model catalog.");
  }
  if (provider === "anthropic" && option?.label.startsWith("GPT")) {
    warnings.push("UI label says GPT but the resolved provider model is Claude.");
  }
  if (!hasProviderKey(provider)) {
    warnings.push(`Missing ${provider.toUpperCase()} credentials for the configured model.`);
  }

  return {
    id: tier,
    buildProfileId: getBuildProfileId(tier),
    uiLabel: option?.label ?? MODEL_LABELS[tier],
    uiDescription: option?.description ?? "",
    configuredModel,
    provider,
    knownCatalogModel: OWN_MODEL_IDS.includes(configuredModel as (typeof OWN_MODEL_IDS)[number]),
    warnings,
  };
}

function buildPromptAssistOptionTrace(value: string, label: string): PromptAssistOptionTrace {
  const normalizedValue = isPromptAssistOff(value) ? value : normalizeAssistModel(value);
  const visibleInUi = PROMPT_ASSIST_MODEL_OPTIONS.some((option) => option.value === value);
  const provider = getResolvedPromptAssistProvider(normalizedValue);
  return {
    value,
    label,
    provider,
    providerFamily: resolvePromptAssistProviderFamily(normalizedValue),
    allowed: isPromptAssistModelAllowed(normalizedValue),
    visibleInUi,
    deepBriefEligible: isGatewayAssistModel(normalizedValue),
  };
}

export function buildModelTraceSnapshot(params: ModelTraceRequest = {}): ModelTraceSnapshot {
  const selectedTier = canonicalizeModelId(params.selectedModelTier) ?? DEFAULT_MODEL_ID;
  const selectedBuild = buildProfileTrace(selectedTier);

  const selectedAssistModel = (() => {
    const raw = params.promptAssistModel?.trim();
    if (!raw) return getDefaultPromptAssistModel();
    return isPromptAssistOff(raw) ? raw : normalizeAssistModel(raw);
  })();
  const selectedAssistProvider = getResolvedPromptAssistProvider(selectedAssistModel);
  const selectedAssistProviderFamily = resolvePromptAssistProviderFamily(selectedAssistModel);
  const canUseDeepBrief = Boolean(params.canUseDeepBrief);
  const promptAssistDeepRequested = Boolean(params.promptAssistDeep);
  const promptAssistDeepActive =
    canUseDeepBrief &&
    promptAssistDeepRequested &&
    !isPromptAssistOff(selectedAssistModel) &&
    isGatewayAssistModel(selectedAssistModel);
  const selectedAssistAllowed = isPromptAssistModelAllowed(selectedAssistModel);
  const selectedAssistVisibleInUi = PROMPT_ASSIST_MODEL_OPTIONS.some(
    (option) => option.value === selectedAssistModel,
  );

  const buildProfiles = MODEL_TIER_OPTIONS.map((option) => buildProfileTrace(option.value));
  const promptAssistOptions = PROMPT_ASSIST_MODEL_OPTIONS.map((option) =>
    buildPromptAssistOptionTrace(option.value, option.label),
  );

  const auth = {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    v0: Boolean(process.env.V0_API_KEY?.trim()),
    aiGatewayApiKey: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
    vercelOidcToken: Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()),
    onVercel: isProbablyOnVercel(),
  };

  const routes: ModelTraceRouteInfo[] = [
    {
      key: "create-build",
      label: "Ny build",
      route: "/api/v0/chats/stream",
      purpose: "First builder generation using the selected build profile.",
      active: canUseDeepBrief,
    },
    {
      key: "follow-up-build",
      label: "Fortsatt build",
      route: "/api/v0/chats/[chatId]/stream",
      purpose: "Follow-up iterations against the same chat/project.",
      active: !canUseDeepBrief,
    },
    {
      key: "prompt-assist-chat",
      label: "Forbattra / shallow",
      route: "/api/ai/chat",
      purpose: "Prompt rewrite/polish before generation.",
      active: !isPromptAssistOff(selectedAssistModel) && !promptAssistDeepActive,
    },
    {
      key: "deep-brief",
      label: "Deep brief",
      route: "/api/ai/brief",
      purpose: "Structured brief generation before the first build.",
      active: promptAssistDeepActive,
    },
    {
      key: "spec-route",
      label: "Spec route",
      route: "/api/ai/spec",
      purpose: "Defined, but not part of the normal builder flow today.",
      active: false,
    },
  ];

  const warnings: string[] = [];
  if (!selectedBuild.knownCatalogModel) {
    warnings.push(
      `Build profile "${selectedBuild.uiLabel}" resolves to "${selectedBuild.configuredModel}", which is not in the current own-model catalog.`,
    );
  }
  if (selectedBuild.provider === "anthropic" && selectedBuild.uiLabel.startsWith("GPT")) {
    warnings.push(
      `Build profile "${selectedBuild.uiLabel}" currently resolves to a Claude model (${selectedBuild.configuredModel}).`,
    );
  }
  if (!hasProviderKey(selectedBuild.provider)) {
    warnings.push(
      `The selected build profile needs ${selectedBuild.provider.toUpperCase()} credentials, but that key is missing.`,
    );
  }
  if (!selectedAssistAllowed) {
    warnings.push(
      `Prompt assist model "${selectedAssistModel}" is not on the current allowlist.`,
    );
  }
  if (selectedAssistProvider === "gateway" && !auth.openai) {
    warnings.push(
      'OpenAI-class prompt assist is selected (internal label "gateway"), but OPENAI_API_KEY is missing.',
    );
  }
  if (
    selectedAssistProviderFamily !== "off" &&
    !hasProviderKey(selectedAssistProviderFamily)
  ) {
    warnings.push(
      `Prompt assist model "${selectedAssistModel}" needs ${selectedAssistProviderFamily.toUpperCase()} credentials, but that key is missing.`,
    );
  }
  if (promptAssistDeepRequested && !canUseDeepBrief) {
    warnings.push("Deep Brief is only used before the first message in a new chat.");
  }
  if (
    promptAssistDeepRequested &&
    !isPromptAssistOff(selectedAssistModel) &&
    !isGatewayAssistModel(selectedAssistModel)
  ) {
    warnings.push(
      "Deep Brief was requested, but the selected prompt assist model is not deep-brief eligible.",
    );
  }
  if (!isPromptAssistModelAllowed(DEFAULT_PROMPT_POLISH_MODEL)) {
    warnings.push(
      `The configured polish model "${DEFAULT_PROMPT_POLISH_MODEL}" is not on the current prompt-assist allowlist.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    selected: {
      buildProfileId: selectedBuild.buildProfileId,
      buildProfileLabel: selectedBuild.uiLabel,
      buildTier: selectedTier,
      buildModel: selectedBuild.configuredModel,
      buildProvider: selectedBuild.provider,
      buildKnownCatalogModel: selectedBuild.knownCatalogModel,
      thinkingRequested: Boolean(params.thinking),
      promptAssistModel: selectedAssistModel,
      promptAssistLabel: getPromptAssistModelLabel(selectedAssistModel),
      promptAssistProvider: selectedAssistProvider,
      promptAssistProviderFamily: selectedAssistProviderFamily,
      promptAssistAllowed: selectedAssistAllowed,
      promptAssistVisibleInUi: selectedAssistVisibleInUi,
      promptAssistDeepRequested,
      promptAssistDeepActive,
      canUseDeepBrief,
      polishModel: DEFAULT_PROMPT_POLISH_MODEL,
      polishModelAllowed: isPromptAssistModelAllowed(DEFAULT_PROMPT_POLISH_MODEL),
      polishProviderFamily: resolvePromptAssistProviderFamily(DEFAULT_PROMPT_POLISH_MODEL),
    },
    buildProfiles,
    promptAssistOptions,
    auth,
    routes,
    warnings,
    notes: [
      '"/api/v0/*" builder generation routes currently resolve to the own engine, not the legacy v0 builder.',
      '"Skriv om" normally uses the dedicated polish model, but follows Anthropic when the active assist lane is Anthropic.',
      "Thinking is a boolean generation flag. It is not a separate model profile.",
      "Prompt-assist model strings are provider-coded. Build profiles are internal tiers that resolve later.",
      "OpenAI-class prompt assist uses createDirectModel() with OPENAI_API_KEY; the internal provider label remains \"gateway\".",
    ],
  };
}
