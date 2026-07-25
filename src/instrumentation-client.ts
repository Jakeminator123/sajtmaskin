import { z } from "zod";

// Zod v4 JIT-compiles object schemas with `new Function`, which `script-src`
// forbids (no 'unsafe-eval' outside dev — see `buildCspPolicy` in src/proxy.ts).
// The policy is report-only today, so the probe succeeds and every compiled
// schema logs a violation instead of Zod picking its interpreted path.
//
// Zod reads the flag when a schema is CONSTRUCTED, so this must run before any
// schema module is evaluated — Next.js runs this file ahead of the app's own
// client code. Server-side parsing keeps the JIT (no CSP in Node).
z.config({ jitless: true });
