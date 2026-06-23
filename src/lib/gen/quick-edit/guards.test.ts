import { describe, expect, it } from "vitest";
import { isBlockedQuickEditPath } from "./guards";

describe("isBlockedQuickEditPath", () => {
  const blocked = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.example",
    "config/.env.local", // nested copy still caught
    "package-lock.json",
    "pnpm-lock.yaml",
    "pnpm-lock.yml",
    "yarn.lock",
    "secret.pem",
    "certs/server.pem",
    "private.key",
    "store.p12",
    "store.pfx",
    "credentials.json",
    "id_rsa",
    "YARN.LOCK", // case-insensitive
    "certs\\server.pem", // backslashes normalize to "/"
  ];
  it.each(blocked)("blocks %s", (path) => {
    expect(isBlockedQuickEditPath(path)).toBe(true);
  });

  const allowed = [
    "package.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "next.config.js",
    "next.config.mjs",
    "tailwind.config.ts",
    "postcss.config.js",
    "next-env.d.ts",
    "src/app/page.tsx",
    "components/Hero.tsx",
    "id_rsa.pub", // only the private key is blocked, not the public one
    "vite.env", // not an env file
  ];
  it.each(allowed)("allows %s", (path) => {
    expect(isBlockedQuickEditPath(path)).toBe(false);
  });
});
