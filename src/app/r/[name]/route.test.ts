import { describe, expect, it } from "vitest";
import { GET } from "./route";

function get(name: string) {
  return GET(new Request(`https://sajtmaskin.vercel.app/r/${name}`), {
    params: Promise.resolve({ name }),
  });
}

describe("GET /r/[name] (@sajtmaskin registry)", () => {
  it("serves the registry index at /r/registry.json", async () => {
    const response = await get("registry.json");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      $schema: string;
      name: string;
      items: Array<{ name: string; files: Array<{ content?: string }> }>;
    };
    expect(body.$schema).toBe("https://ui.shadcn.com/schema/registry.json");
    expect(body.name).toBe("sajtmaskin");
    expect(body.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["saas-hero", "pricing-section", "faq-accordion"]),
    );
    // Index stays lean: file content is only served per item.
    for (const item of body.items) {
      for (const file of item.files) {
        expect(file.content).toBeUndefined();
      }
    }
  });

  it("serves a registry item with inlined content at /r/{name}.json", async () => {
    const response = await get("saas-hero.json");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      $schema: string;
      name: string;
      type: string;
      registryDependencies: string[];
      files: Array<{ path: string; content?: string; target?: string }>;
    };
    expect(body.$schema).toBe("https://ui.shadcn.com/schema/registry-item.json");
    expect(body.name).toBe("saas-hero");
    expect(body.type).toBe("registry:block");
    expect(body.registryDependencies).toContain("button");
    expect(body.files[0]?.path).toBe("blocks/saas-hero.tsx");
    expect(body.files[0]?.content).toContain("export function SaasHero");
  });

  it("404s for unknown items", async () => {
    const response = await get("does-not-exist.json");
    expect(response.status).toBe(404);
  });

  it("404s for non-.json paths", async () => {
    const response = await get("saas-hero");
    expect(response.status).toBe(404);
  });
});
