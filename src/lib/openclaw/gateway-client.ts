import {
  OPENCLAW_STRONG_ROUTE,
  type OpenClawModelRoute,
} from "./model-routing";

export const OPENCLAW_FAST_MODE_HEADER = "x-sajtmaskin-fast-mode";

interface GatewayChatRequest {
  gatewayUrl: string;
  gatewayToken: string;
  route: OpenClawModelRoute;
  body: Record<string, unknown>;
  timeoutMs: number;
  fastMode?: boolean;
}

export interface OpenClawGatewayResult {
  response: Response;
  route: OpenClawModelRoute;
  fellBackToStrong: boolean;
}

function isUnknownAgentResponse(text: string, route: OpenClawModelRoute): boolean {
  return (
    /unknown agent/i.test(text) &&
    text.toLowerCase().includes(route.agentId.toLowerCase())
  );
}

async function send(params: GatewayChatRequest): Promise<Response> {
  const endpoint = params.fastMode ? "/v1/chat/completions/fast" : "/v1/chat/completions";
  const response = await fetch(`${params.gatewayUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.gatewayToken
        ? { Authorization: `Bearer ${params.gatewayToken}` }
        : {}),
    },
    body: JSON.stringify({ ...params.body, model: params.route.model }),
    signal: AbortSignal.timeout(params.timeoutMs),
  });
  if (params.fastMode && response.ok && response.headers.get(OPENCLAW_FAST_MODE_HEADER) !== "1") {
    await response.body?.cancel().catch(() => {});
    return new Response(null, { status: 503 });
  }
  return response;
}

/**
 * Sends a chat request to the server-selected OpenClaw agent. During a rolling
 * deploy, old gateways may not know the fast/balanced agents yet; only that
 * exact 400 gets one compatibility retry on the stable strong agent for a standard turn.
 * Paid Fast requests are dispatched once using the originally selected agent. Auth,
 * quota, network and generic upstream failures are never retried here.
 */
export async function postOpenClawChatCompletion(params: GatewayChatRequest): Promise<OpenClawGatewayResult> {
  const response = await send(params);

  if (!params.fastMode && params.route.lane !== "strong" && response.status === 400) {
    const detail = await response.clone().text().catch(() => "");
    if (isUnknownAgentResponse(detail, params.route)) {
      console.warn(
        `[openclaw/gateway] lane=${params.route.lane} agent=${params.route.agentId} fallback=strong reason=unknown_agent`,
      );
      const fallbackResponse = await send({
        ...params,
        route: OPENCLAW_STRONG_ROUTE,
      });
      return {
        response: fallbackResponse,
        route: OPENCLAW_STRONG_ROUTE,
        fellBackToStrong: true,
      };
    }
  }

  console.info(
    `[openclaw/gateway] lane=${params.route.lane} agent=${params.route.agentId} fallback=none status=${response.status}`,
  );
  return { response, route: params.route, fellBackToStrong: false };
}
