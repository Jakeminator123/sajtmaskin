/**
 * Permissions-Policy for HTML responses.
 *
 * Owner: `src/proxy.ts` (applied on every document response). `next.config.ts`
 * repeats the same value as a belt-and-suspenders header on `/:path*`.
 *
 * camera/microphone stay `(self)` because the landing page and builder record
 * voice/video. Everything else is off unless a product surface needs it.
 */
export const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=(self)",
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
  "autoplay=(self)",
  "fullscreen=(self)",
].join(", ");
