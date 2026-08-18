import type {
  OpenClawCodeContextMode,
  OpenClawRoutingIntent,
} from "./chat-context-policy";

export type OpenClawModelLane = "fast" | "balanced" | "strong";
export type OpenClawSurface = "chat" | "did" | "tips";

export interface OpenClawModelRoute {
  lane: OpenClawModelLane;
  agentId: "sajtagenten" | "sajtagenten-balanced" | "sajtagenten-fast";
  model: "openclaw:sajtagenten" | "openclaw:sajtagenten-balanced" | "openclaw:sajtagenten-fast";
  reason: string;
}

export const OPENCLAW_STRONG_ROUTE: OpenClawModelRoute = {
  lane: "strong",
  agentId: "sajtagenten",
  model: "openclaw:sajtagenten",
  reason: "strong_default",
};

const ROUTES: Record<OpenClawModelLane, Omit<OpenClawModelRoute, "reason">> = {
  fast: {
    lane: "fast",
    agentId: "sajtagenten-fast",
    model: "openclaw:sajtagenten-fast",
  },
  balanced: {
    lane: "balanced",
    agentId: "sajtagenten-balanced",
    model: "openclaw:sajtagenten-balanced",
  },
  strong: {
    lane: "strong",
    agentId: "sajtagenten",
    model: "openclaw:sajtagenten",
  },
};

function route(lane: OpenClawModelLane, reason: string): OpenClawModelRoute {
  return { ...ROUTES[lane], reason };
}

/**
 * Server-owned routing. Clients can describe their request/context but never
 * choose a provider model or OpenClaw agent directly.
 */
export function resolveOpenClawModelRoute(input: {
  enabled: boolean;
  surface: OpenClawSurface;
  routingIntent: OpenClawRoutingIntent;
  codeContextMode?: OpenClawCodeContextMode;
  debug?: boolean;
  hasActivePowers?: boolean;
}): OpenClawModelRoute {
  if (!input.enabled) return route("strong", "routing_disabled");
  if (input.debug) return route("strong", "debug");
  if (input.hasActivePowers) return route("strong", "active_powers");
  if (input.routingIntent === "review") return route("strong", "review");
  if (input.codeContextMode === "full") return route("strong", "full_context");
  if (input.surface === "tips") return route("fast", "tips");
  if (input.codeContextMode === "manifest" || input.codeContextMode === "light") {
    return route("balanced", `${input.codeContextMode}_context`);
  }
  return route("fast", "ordinary_question");
}
