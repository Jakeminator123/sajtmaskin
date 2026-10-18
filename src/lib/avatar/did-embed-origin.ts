export const DID_AVATAR_EMBED_ORIGIN = "https://studio.d-id.com";

export function buildDidAgentShareUrl(agentId: string, clientKey: string): string {
  return `${DID_AVATAR_EMBED_ORIGIN}/agents/share?id=${encodeURIComponent(agentId)}&key=${encodeURIComponent(clientKey)}`;
}
