import { DID_AVATAR_MEDIA_ORIGINS } from "../avatar/did-embed-origin";

/**
 * Permissions-Policy for HTML responses.
 *
 * Owner: `src/proxy.ts` (applied on every document response). `next.config.ts`
 * repeats the same value as a belt-and-suspenders header on `/:path*`.
 *
 * camera, microphone and autoplay allow this document and the D-ID agent
 * origins; an iframe `allow` attribute cannot widen this header. fullscreen
 * stays `(self)`. Every other declared feature stays off.
 */
const DID_AVATAR_ALLOWLIST = `(self ${DID_AVATAR_MEDIA_ORIGINS.map((origin) => `"${origin}"`).join(" ")})`;

export const PERMISSIONS_POLICY = [
  `camera=${DID_AVATAR_ALLOWLIST}`,
  `microphone=${DID_AVATAR_ALLOWLIST}`,
  "geolocation=()",
  "browsing-topics=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "midi=()",
  "display-capture=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  `autoplay=${DID_AVATAR_ALLOWLIST}`,
  "fullscreen=(self)",
].join(", ");
