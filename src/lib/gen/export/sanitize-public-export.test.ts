import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import JSZip from "jszip";
import { extractImportedFilesFromZip } from "@/lib/import/extract-imported-archive";
import { buildGitHubExportPlan } from "./github-tree-plan";
import { sanitizeEnvSecretsForPublicExport } from "./sanitize-public-export";

// Use the actual INI parser bundled with the npm running this test command.
// The fallback supports direct Vitest execution under standard Node installs.
const npmRequire = createRequire(
  process.env.npm_execpath ??
    resolve(
      dirname(process.execPath),
      process.platform === "win32"
        ? "node_modules/npm/package.json"
        : "../lib/node_modules/npm/package.json",
    ),
);
const npmIni = npmRequire("ini") as { parse: (content: string) => Record<string, unknown> };

describe("sanitizeEnvSecretsForPublicExport (B11)", () => {
  it("redacts the canonical env.example (no leading dot) — the F3 real-value vector", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: "env.example",
        content:
          "# env.example — DOCUMENTATION\nSTRIPE_SECRET_KEY=sk_live_real123\nNEXT_PUBLIC_X=ok\n",
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("# env.example — DOCUMENTATION");
    expect(env).toContain("STRIPE_SECRET_KEY=");
    expect(env).not.toContain("sk_live_real123");
    expect(env).toContain("NEXT_PUBLIC_X=");
    expect(env).not.toContain("=ok");
  });

  it("redacts values in .env.local but keeps keys, comments and blanks", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: ".env.local",
        content:
          "# secrets\nSTRIPE_SECRET_KEY=sk_test_abc123\n\nNEXT_PUBLIC_URL=https://x.example\n",
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("# secrets");
    expect(env).toContain("STRIPE_SECRET_KEY=");
    expect(env).not.toContain("sk_test_abc123");
    expect(env).toContain("NEXT_PUBLIC_URL=");
    expect(env).not.toContain("https://x.example");
  });

  it("redacts .env, .env.production, .env.example and legacy env.env too", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env", content: "DB_URL=postgres://u:p@h/db", language: "text" },
      { path: ".env.production", content: "KEY=realvalue", language: "text" },
      { path: ".env.example", content: "STRIPE_SECRET_KEY=sk_test_example", language: "text" },
      { path: "env.env", content: "LEGACY_SECRET=still_real", language: "text" },
    ]);
    expect(out[0]!.content).toBe("DB_URL=");
    expect(out[1]!.content).toBe("KEY=");
    expect(out[2]!.content).toBe("STRIPE_SECRET_KEY=");
    expect(out[3]!.content).toBe("LEGACY_SECRET=");
  });

  it("drops multiline / continuation values so no wrapped secret survives", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      {
        path: ".env.local",
        content: 'PRIVATE_KEY="-----BEGIN-----\nMIIsecretline\n-----END-----"\nNEXT=ok\n',
        language: "text",
      },
    ]);
    const env = out[0]!.content;
    expect(env).toContain("PRIVATE_KEY=");
    expect(env).not.toContain("MIIsecretline");
    expect(env).not.toContain("BEGIN");
    expect(env).toContain("NEXT=");
  });

  it("leaves non-env files untouched", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: "app/page.tsx", content: "const x = 1;", language: "tsx" },
      { path: "README.md", content: "KEY=looks-like-env-but-isnt", language: "text" },
    ]);
    expect(out[0]!.content).toBe("const x = 1;");
    expect(out[1]!.content).toBe("KEY=looks-like-env-but-isnt");
  });

  it("splits only on the first '=' (values containing '=' are still dropped)", () => {
    const out = sanitizeEnvSecretsForPublicExport([
      { path: ".env.local", content: "TOKEN=a=b=c", language: "text" },
    ]);
    expect(out[0]!.content).toBe("TOKEN=");
  });

  it.each([".ENV", "nested/.ENV.LOCAL", "nested\\.ENV.PRODUCTION", "ENV.EXAMPLE", "env.ENV"])(
    "redacts already persisted env snapshots regardless of case: %s",
    (path) => {
      expect(
        sanitizeEnvSecretsForPublicExport([
          { path, content: "SECRET=dummy-secret", language: "text" },
        ])[0]!.content,
      ).toBe("SECRET=");
    },
  );

  it.each([".npmrc", "nested/.npmrc", "nested\\.NPMRC"])(
    "redacts npm credentials without losing registry/install configuration: %s",
    (path) => {
      const content = [
        "# npm configuration",
        "registry=https://registry.npmjs.org/",
        "@company:registry=https://packages.example.test/",
        "legacy-peer-deps=true",
        "strict-ssl=true",
        "//packages.example.test/:_authToken=dummy-token",
        "_auth=dummy-base64",
        "//packages.example.test/:_password=dummy-password",
        '"//packages.example.test/:_authToken"=dummy-quoted-token',
        "_authToken[]=dummy-array-token",
        '"_auth\\u0054oken"=dummy-escaped-key-token',
        "",
      ].join("\r\n");
      const file = { path, content, language: "text" };
      const result = sanitizeEnvSecretsForPublicExport([file])[0]!.content;
      expect(result).not.toContain("dummy-");
      expect(result).toContain("registry=https://registry.npmjs.org/\r\n");
      expect(result).toContain("@company:registry=https://packages.example.test/\r\n");
      expect(result).toContain("legacy-peer-deps=true\r\nstrict-ssl=true\r\n");
      expect(result).toContain("//packages.example.test/:_authToken=\r\n");
      expect(file.content).toBe(content);
      expect(sanitizeEnvSecretsForPublicExport([{ ...file, content: result }])[0]!.content).toBe(
        result,
      );
    },
  );

  it("removes URL userinfo and wrapped credential values from npmrc", () => {
    const result = sanitizeEnvSecretsForPublicExport([
      {
        path: ".npmrc",
        content:
          'proxy=https://dummy-user:dummy-pass@proxy.example:8443/\n_authToken="dummy-first\ndummy-second"\n_auth=dummy-start\\\ndummy-tail\nregistry=https://registry.npmjs.org/\n',
        language: "text",
      },
    ])[0]!.content;
    expect(result).not.toContain("dummy-");
    expect(result).toContain("proxy=https://proxy.example:8443/");
    expect(result).toContain("registry=https://registry.npmjs.org/");
  });

  it.each([
    ["registry", "dummy'password"],
    ["proxy", 'dummy"password'],
    ["https-proxy", "dummy password"],
  ])("removes valid URL credentials containing literal quotes/space from %s", (key, password) => {
    const rawUrl = `https://dummy-user:${password}@packages.example.test:8443/npm/`;
    const before = new URL(rawUrl);
    expect(before.username).toBe("dummy-user");
    expect(decodeURIComponent(before.password)).toBe(password);
    const content = `${key}=${rawUrl}\nstrict-ssl=true\n`;
    const result = sanitizeEnvSecretsForPublicExport([
      { path: ".npmrc", content, language: "text" },
    ])[0]!.content;
    expect(result).toBe(`${key}=https://packages.example.test:8443/npm/\nstrict-ssl=true\n`);
    const after = new URL(result.split("\n")[0]!.slice(key.length + 1));
    expect(after.username).toBe("");
    expect(after.password).toBe("");
    expect(after.host).toBe(before.host);
    expect(after.pathname).toBe(before.pathname);
  });

  it("preserves INI comments and quoted URLs while removing their userinfo", () => {
    const content = [
      'registry="https://dummy-user:dummy;password@packages.example.test"',
      "@company:registry=https://packages.example.test ; support@company.test",
      'proxy=https://dummy-user:dummy"password@proxy.example.test ; support@company.test',
    ].join("\n");
    expect(
      sanitizeEnvSecretsForPublicExport([{ path: ".npmrc", content, language: "text" }])[0]!
        .content,
    ).toBe(
      [
        'registry="https://packages.example.test/"',
        "@company:registry=https://packages.example.test ; support@company.test",
        "proxy=https://proxy.example.test/ ; support@company.test",
      ].join("\n"),
    );
  });

  it.each([
    String.raw`"https:\/\/dummy-user:dummy-password@packages.example.test/npm/"`,
    String.raw`"https:\u002f\u002fdummy-user:dummy-password@packages.example.test/npm/"`,
    String.raw`"ht\u0074ps:\/\/dummy-user:dummy\"password@packages.example.test/npm/"`,
    String.raw`'"https:\/\/dummy-user:dummy-password@packages.example.test/npm/"'`,
    String.raw`https://dummy-user:dummy"password@packages.example.test/npm/ ; normal comment`,
    String.raw`"https:\t//dummy-user:dummy-password@packages.example.test/npm/"`,
    String.raw`"https://dummy-user:dummy\npassword@packages.example.test/npm/"`,
    String.raw`"https://dummy-user:dummy\rpassword@packages.example.test/npm/"`,
    String.raw`https:\\dummy-user:dummy\;password@packages.example.test/npm/ ; normal comment`,
    String.raw`https://dummy-user:dummy-password@packages.example.test/npm/\;section\#fragment ; normal comment`,
  ])("sanitizes the URL value that npm ini.parse actually decodes: %s", (value) => {
    const content = `registry=${value}\nstrict-ssl=true\n`;
    const before = new URL(String(npmIni.parse(content).registry));
    expect(before.username).toBe("dummy-user");
    expect(before.password).not.toBe("");
    const result = sanitizeEnvSecretsForPublicExport([
      { path: ".npmrc", content, language: "text" },
    ])[0]!.content;
    const parsed = npmIni.parse(result);
    const after = new URL(String(parsed.registry));
    expect(after.username).toBe("");
    expect(after.password).toBe("");
    expect(after.host).toBe(before.host);
    expect(after.pathname).toBe(before.pathname);
    expect(after.search).toBe(before.search);
    expect(after.hash).toBe(before.hash);
    expect(parsed["strict-ssl"]).toBe(true);
    expect(result).not.toContain("dummy");
    if (value.includes("; normal comment")) expect(result).toContain("; normal comment");
    expect(
      sanitizeEnvSecretsForPublicExport([{ path: ".npmrc", content: result, language: "text" }])[0]!
        .content,
    ).toBe(result);
  });

  it.each([
    String.raw`"https:\u002f\u002fpackages.example.test/npm/"`,
    String.raw`"https:\t//packages.example.test/npm/"`,
    String.raw`https:\\packages.example.test/npm/ ; normal comment`,
    String.raw`https://packages.example.test/npm/\;section\#fragment ; normal comment`,
  ])("keeps harmless normalized URLs byte-identical: %s", (value) => {
    const content = `registry=${value}`;
    const parsed = new URL(String(npmIni.parse(content).registry));
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
    expect(
      sanitizeEnvSecretsForPublicExport([{ path: ".npmrc", content, language: "text" }])[0]!
        .content,
    ).toBe(content);
  });

  it("uses the same npm INI decoding for quoted credential keys", () => {
    const content = String.raw`'"_auth\u0054oken"'=dummy-token`;
    expect(npmIni.parse(content)._authToken).toBe("dummy-token");
    const result = sanitizeEnvSecretsForPublicExport([
      { path: ".npmrc", content, language: "text" },
    ])[0]!.content;
    expect(npmIni.parse(result)._authToken).toBe("");
    expect(result).not.toContain("dummy-token");
  });

  it("removes an imported npm token from both public ZIP bytes and the backup tree plan", async () => {
    const source = new JSZip();
    source.file("app/page.tsx", "export default function Page() { return null }");
    source.file(
      ".npmrc",
      "registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=dummy-import-token\n",
    );
    const imported = await extractImportedFilesFromZip(
      await source.generateAsync({ type: "nodebuffer" }),
    );
    expect(imported.find((file) => file.path === ".npmrc")!.content).toContain(
      "dummy-import-token",
    );
    const sanitized = sanitizeEnvSecretsForPublicExport(imported);
    const zip = new JSZip();
    for (const file of sanitized) zip.file(file.path, file.content);
    const output = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
    const npmrc = await output.file(".npmrc")!.async("string");
    expect(npmrc).not.toContain("dummy-import-token");
    expect(npmrc).toContain("registry=https://registry.npmjs.org/");
    expect(
      buildGitHubExportPlan(sanitized).files.find((file) => file.path === ".npmrc")!.content,
    ).toBe(npmrc);
  });
});
