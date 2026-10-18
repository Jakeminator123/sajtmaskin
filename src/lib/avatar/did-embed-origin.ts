export const DID_AVATAR_EMBED_ORIGIN = "https://studio.d-id.com";

/** Origins the embed may run camera/microphone in; mirrors the D-ID frame hosts in the CSP. */
export const DID_AVATAR_MEDIA_ORIGINS = [DID_AVATAR_EMBED_ORIGIN, "https://agent.d-id.com"] as const;

export function buildDidAgentShareUrl(agentId: string, clientKey: string): string {
  return `${DID_AVATAR_EMBED_ORIGIN}/agents/share?id=${encodeURIComponent(agentId)}&key=${encodeURIComponent(clientKey)}`;
}
