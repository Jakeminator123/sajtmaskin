import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDidAgentShareUrl,
  DID_AVATAR_EMBED_ORIGIN,
} from "@/lib/avatar/did-embed-origin";
import { PERMISSIONS_POLICY } from "./permissions-policy";

const DID_ORIGIN = "https://studio.d-id.com";

function feature(policy: string, name: string): string {
  return (
    policy
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`)) ?? ""
  );
}

describe("Permissions-Policy", () => {
  it("allows the D-ID avatar embed origin for camera, microphone and autoplay", () => {
    const originSource = readFileSync(
      resolve(process.cwd(), "src/lib/avatar/did-embed-origin.ts"),
      "utf8",
    );
    const policySource = readFileSync(
      resolve(process.cwd(), "src/lib/security/permissions-policy.ts"),
      "utf8",
    );
    const embedSource = readFileSync(
      resolve(process.cwd(), "src/components/avatar/did-avatar-embed.tsx"),
      "utf8",
    );
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    const proxy = readFileSync(resolve(process.cwd(), "src/proxy.ts"), "utf8");

    expect(originSource).toContain(`export const DID_AVATAR_EMBED_ORIGIN = "${DID_ORIGIN}"`);
    expect(policySource).toContain("DID_AVATAR_EMBED_ORIGIN");
    expect(policySource).toContain("PERMISSIONS_POLICY");
    expect(embedSource).toContain("buildDidAgentShareUrl");
    expect(embedSource).toContain('allow="camera; microphone; autoplay; clipboard-write"');
    expect(nextConfig).toContain("PERMISSIONS_POLICY");
    expect(proxy).toContain('response.headers.set("Permissions-Policy", PERMISSIONS_POLICY)');
    expect(DID_AVATAR_EMBED_ORIGIN).toBe(DID_ORIGIN);
    expect(buildDidAgentShareUrl("agent id", "key/1")).toBe(
      `${DID_ORIGIN}/agents/share?id=agent%20id&key=key%2F1`,
    );

    for (const name of ["camera", "microphone", "autoplay"] as const) {
      expect(feature(PERMISSIONS_POLICY, name)).toBe(`${name}=(self "${DID_ORIGIN}")`);
    }
    expect(feature(PERMISSIONS_POLICY, "fullscreen")).toBe("fullscreen=(self)");
    expect(feature(PERMISSIONS_POLICY, "geolocation")).toBe("geolocation=()");
    expect(feature(PERMISSIONS_POLICY, "payment")).toBe("payment=()");
    expect(feature(PERMISSIONS_POLICY, "usb")).toBe("usb=()");
    expect(feature(PERMISSIONS_POLICY, "display-capture")).toBe("display-capture=()");
    expect(PERMISSIONS_POLICY).not.toContain("*");
  });
});
