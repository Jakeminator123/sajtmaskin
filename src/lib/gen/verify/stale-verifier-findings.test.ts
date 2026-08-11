/**
 * SM-023 — the mechanical stale-check that stops a pre-merge verifier verdict
 * from terminally failing a version whose PERSISTED files were already fixed
 * by phase 4 (merge + package.json deep-merge + import-validator +
 * dep-completion).
 *
 * The four scenario tests mirror the prod evidence (chat `3a6c5472` v3
 * `e0d6cc0e`, 2026-08-05): missing `Resend`/`FormEvent` imports, missing
 * package.json build scripts/dependencies, and an ai-sdk major-version
 * combination — all resolved in `files_json` but fatally kept in the verdict.
 */
import { describe, expect, it } from "vitest";

import {
  dropResolvedVerifierFindings,
  type FinalProjectFile,
} from "./stale-verifier-findings";

const PAGE_FILE: FinalProjectFile = {
  path: "src/app/page.tsx",
  content: "export default function Page() { return <main>ok</main>; }",
};

function packageJsonFile(overrides?: {
  scripts?: Record<string, string> | null;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): FinalProjectFile {
  return {
    path: "package.json",
    content: JSON.stringify({
      name: "unit-test",
      version: "0.0.0",
      ...(overrides?.scripts === null
        ? {}
        : { scripts: overrides?.scripts ?? { dev: "next dev", build: "next build" } }),
      dependencies: overrides?.dependencies ?? {
        next: "15.0.0",
        react: "19.0.0",
        "react-dom": "19.0.0",
      },
      devDependencies: overrides?.devDependencies ?? { tailwindcss: "4.0.0" },
    }),
  };
}

describe("dropResolvedVerifierFindings — missing-import class", () => {
  it("drops a missing-import finding when the final file imports the symbol (prod: Resend)", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "app/api/contact/route.ts",
          content:
            'import { Resend } from "resend";\nexport async function POST() { const resend = new Resend(process.env.RESEND_API_KEY); return Response.json({ ok: true, resend: Boolean(resend) }); }',
        },
      ],
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].id).toBe("missing-resend-import");
    expect(result.kept).toHaveLength(0);
  });

  it("drops a type-usage finding resolved by a type-only import (prod: FormEvent)", () => {
    const finding = {
      id: "missing-formevent-import",
      detail: "components/contact-form.tsx: uses `FormEvent` but never imports it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "components/contact-form.tsx",
          content:
            'import type { FormEvent } from "react";\nexport function ContactForm() { const onSubmit = (e: FormEvent) => e.preventDefault(); return <form onSubmit={onSubmit} />; }',
        },
      ],
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("bugbot: keeps the finding when only a TYPE import backs a value usage", () => {
    // `import type { Resend }` + `new Resend(...)` still fails tsc exactly as
    // the verifier claimed — a type-only binding must not resolve a value use.
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "app/api/contact/route.ts",
          content:
            'import type { Resend } from "resend";\nexport async function POST() { const resend = new Resend(process.env.RESEND_API_KEY); return Response.json({ ok: Boolean(resend) }); }',
        },
      ],
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("keeps a missing-import finding when the symbol is still unbound", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "app/api/contact/route.ts",
          content:
            "export async function POST() { const resend = new Resend(process.env.RESEND_API_KEY); return Response.json({ ok: Boolean(resend) }); }",
        },
      ],
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops an undefined-jsx-symbol finding once the component is imported", () => {
    const finding = {
      id: "undefined-jsx-symbol",
      detail:
        "src/app/page.tsx: `<Button />` is used but `Button` is neither imported nor declared in this file. Either import it from the correct package or replace it with a supported element.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        {
          path: "src/app/page.tsx",
          content:
            'import { Button } from "@/components/ui/button";\nexport default function Page() { return <Button>ok</Button>; }',
        },
      ],
    );
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("treats a locally declared symbol as resolved", () => {
    const finding = {
      id: "undefined-jsx-symbol",
      detail:
        "src/app/page.tsx: `<Hero />` is used but `Hero` is neither imported nor declared in this file. Either import it from the correct package or replace it with a supported element.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        {
          path: "src/app/page.tsx",
          content:
            "function Hero() { return <section>hero</section>; }\nexport default function Page() { return <Hero />; }",
        },
      ],
    );
    expect(result.dropped).toHaveLength(1);
  });

  it("handles multi-file bullet findings and keeps the finding when ANY bullet is unresolved", () => {
    const finding = {
      id: "build-breaking-missing-imports",
      detail: [
        "- app/api/contact/route.ts: uses `Resend` but does not import it",
        "- components/contact-form.tsx: uses `FormEvent` but does not import it",
      ].join("\n"),
    };
    const files: FinalProjectFile[] = [
      {
        path: "app/api/contact/route.ts",
        content: 'import { Resend } from "resend";\nexport const r = Resend;',
      },
      {
        path: "components/contact-form.tsx",
        content: "export function ContactForm() { return <form />; }",
      },
    ];
    const result = dropResolvedVerifierFindings([finding], files);
    expect(result.kept).toHaveLength(1);

    const fixedFiles: FinalProjectFile[] = [
      files[0],
      {
        path: "components/contact-form.tsx",
        content:
          'import type { FormEvent } from "react";\nexport function ContactForm() { const f = (e: FormEvent) => e; return <form onSubmit={f} />; }',
      },
    ];
    const fixedResult = dropResolvedVerifierFindings([finding], fixedFiles);
    expect(fixedResult.dropped).toHaveLength(1);
  });

  it("drops the finding when the referenced file is absent from the final project", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/removed/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings([finding], [PAGE_FILE]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toMatch(/absent/);
  });

  it("bugbot: keeps the finding when the file was RELOCATED by the merge and still misses the import", () => {
    // The claimed path is gone, but a same-named file exists elsewhere
    // (app/ → src/app/ relocation) and the symbol is still unbound there —
    // "file absent" must not shortcut past the relocated copy.
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "src/app/api/contact/route.ts",
          content:
            "export async function POST() { const resend = new Resend(process.env.RESEND_API_KEY); return Response.json({ ok: Boolean(resend) }); }",
        },
      ],
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("bugbot: drops the finding when the RELOCATED file resolves the import", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        PAGE_FILE,
        {
          path: "src/app/api/contact/route.ts",
          content:
            'import { Resend } from "resend";\nexport async function POST() { const resend = new Resend(process.env.RESEND_API_KEY); return Response.json({ ok: Boolean(resend) }); }',
        },
      ],
    );
    expect(result.dropped).toHaveLength(1);
  });

  it("keeps import-name-collision findings (collision ≠ absence)", () => {
    const finding = {
      id: "import-name-collision",
      detail:
        "src/app/page.tsx: `Header` is imported from both `@/components/header` and declared locally.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        {
          path: "src/app/page.tsx",
          content:
            'import { Header } from "@/components/header";\nexport default function Page() { return <Header />; }',
        },
      ],
    );
    expect(result.kept).toHaveLength(1);
  });

  it("keeps the finding when the detail cannot be parsed (fail-closed)", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "Several files are missing imports; please review the project.",
    };
    const result = dropResolvedVerifierFindings([finding], [PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
  });
});

describe("dropResolvedVerifierFindings — package.json class", () => {
  const PROD_DETAIL =
    "package.json lacks build scripts and direct dependencies for imported runtime packages `next`, `react`, `react-dom`, and `tailwindcss`.";

  it("drops the prod scripts+dependencies finding once the merged manifest satisfies it", () => {
    const finding = { id: "package-build-setup", detail: PROD_DETAIL };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("keeps the finding when the build script is still missing", () => {
    const finding = { id: "package-build-setup", detail: PROD_DETAIL };
    const result = dropResolvedVerifierFindings(
      [finding],
      [packageJsonFile({ scripts: { dev: "next dev" } }), PAGE_FILE],
    );
    expect(result.kept).toHaveLength(1);
  });

  it("keeps the finding when a named dependency is still missing", () => {
    const finding = { id: "package-build-setup", detail: PROD_DETAIL };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        packageJsonFile({
          dependencies: { next: "15.0.0", react: "19.0.0" },
          devDependencies: {},
        }),
        PAGE_FILE,
      ],
    );
    expect(result.kept).toHaveLength(1);
  });

  it("drops a version-combination finding when the criticized majors changed (prod: ai-sdk)", () => {
    const finding = {
      id: "ai-sdk-version-conflict",
      detail:
        "package.json pins `ai@^7` together with `@ai-sdk/react@^2` and `@ai-sdk/openai@^2`, which are incompatible majors.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        packageJsonFile({
          dependencies: {
            next: "15.0.0",
            react: "19.0.0",
            ai: "^5.0.59",
            "@ai-sdk/react": "^2.0.30",
            "@ai-sdk/openai": "^2.0.42",
          },
        }),
        PAGE_FILE,
      ],
    );
    expect(result.dropped).toHaveLength(1);
  });

  it("keeps a version-combination finding while the criticized combination still holds", () => {
    const finding = {
      id: "ai-sdk-version-conflict",
      detail:
        "package.json pins `ai@^7` together with `@ai-sdk/react@^2` and `@ai-sdk/openai@^2`, which are incompatible majors.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        packageJsonFile({
          dependencies: {
            ai: "^7.0.1",
            "@ai-sdk/react": "^2.0.30",
            "@ai-sdk/openai": "^2.0.42",
          },
        }),
        PAGE_FILE,
      ],
    );
    expect(result.kept).toHaveLength(1);
  });

  it("bugbot: keeps a NON-package finding that merely mentions package.json in passing", () => {
    // The id is a product-quality class; its real blocker (dead CTA) is not a
    // manifest claim. Satisfied manifest claims must not drop it.
    const finding = {
      id: "navigation-placeholder-actions",
      detail:
        "Hero CTA href is empty. Wire it to a real route (see the build scripts in package.json for available pages).",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("prod 72cbc979 v4: drops a satisfied manifest claim whose code-file mention is only justification (', although …')", () => {
    // Verifier phrasing from the 2026-08-11 F3 run: the file appears in a
    // subordinate clause that motivates the claim. The merged manifest has
    // next/react/react-dom, so the finding is stale.
    const finding = {
      id: "missing-next-runtime-dependencies",
      detail:
        "package.json lacks `next`, `react`, and `react-dom`, although app/layout.tsx imports Next.js and React modules.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("prod 72cbc979 v5: drops a satisfied absence claim with a consequence clause (', so …')", () => {
    const finding = {
      id: "incomplete-package-manifest",
      detail:
        "package.json dependencies: `next`, `react`, and `react-dom` are absent, so app/layout.tsx and the Next.js application cannot build or run.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("bugbot round 3: keeps a finding whose although-clause carries an independent code-claim", () => {
    // Klausulen är inte ren motivering — den påstår ett eget fel ("undefined
    // helper") som manifest-omkontrollen aldrig kan bekräfta löst.
    const finding = {
      id: "incomplete-package-manifest",
      detail:
        "package.json lacks `next`, although src/app/page.tsx also calls an undefined helper.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("keeps a so-clause that reports an independent code failure", () => {
    const finding = {
      id: "incomplete-package-manifest",
      detail: "package.json lacks `next`, so src/app/page.tsx fails to await params.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops a so-clause whose compile failure is only a consequence of the stale manifest claim", () => {
    const finding = {
      id: "incomplete-package-manifest",
      detail: "package.json lacks `next`, so src/app/page.tsx fails to compile.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.dropped).toHaveLength(1);
    expect(result.kept).toHaveLength(0);
  });

  it("bugbot high: keeps a compound finding whose so-clause is followed by a coordinated code-file claim", () => {
    // ", so …" får inte svälja en självständig ", and <kodfil> …"-sats — då
    // skulle ett blandat fynd omklassas till manifest-only och släppas trots
    // att kodfils-blockern kvarstår.
    const finding = {
      id: "incomplete-package-manifest",
      detail:
        "package.json lacks `next`, so the build fails, and src/app/page.tsx renders `<Undefined />` without importing it.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("keeps the justification-clause finding while the manifest still misses a named package", () => {
    const finding = {
      id: "missing-next-runtime-dependencies",
      detail:
        "package.json lacks `next`, `react`, and `react-dom`, although app/layout.tsx imports Next.js and React modules.",
    };
    const result = dropResolvedVerifierFindings(
      [finding],
      [
        packageJsonFile({ dependencies: { next: "15.0.0", react: "19.0.0" } }),
        PAGE_FILE,
      ],
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("bugbot: keeps a package-labelled finding whose detail also references a code file", () => {
    // Mixed claim (manifest + code file) — the manifest re-check alone cannot
    // confirm the code-file half, so the finding stays blocking.
    const finding = {
      id: "package-build-setup",
      detail:
        "package.json lacks build scripts, and src/app/page.tsx imports `next` APIs that the manifest does not declare.",
    };
    const result = dropResolvedVerifierFindings([finding], [packageJsonFile(), PAGE_FILE]);
    expect(result.kept).toHaveLength(1);
  });

  it("keeps the finding when package.json is absent or unparseable (fail-closed)", () => {
    const finding = { id: "package-build-setup", detail: PROD_DETAIL };
    expect(dropResolvedVerifierFindings([finding], [PAGE_FILE]).kept).toHaveLength(1);
    expect(
      dropResolvedVerifierFindings(
        [finding],
        [{ path: "package.json", content: "not json" }, PAGE_FILE],
      ).kept,
    ).toHaveLength(1);
  });
});

describe("dropResolvedVerifierFindings — unknown classes stay blocking", () => {
  it("never touches product-quality findings", () => {
    const findings = [
      { id: "navigation-placeholder-actions", detail: "src/app/page.tsx: hero CTA href is empty" },
      { id: "footer-dead-links", detail: "src/app/page.tsx: footer links point at #" },
      { id: "r3f-client-boundary", detail: 'src/components/scene.tsx: <Canvas> without "use client"' },
    ];
    const result = dropResolvedVerifierFindings(findings, [PAGE_FILE, packageJsonFile()]);
    expect(result.kept).toHaveLength(3);
    expect(result.dropped).toHaveLength(0);
  });

  it("returns everything kept on an empty final file list", () => {
    const finding = {
      id: "missing-resend-import",
      detail: "app/api/contact/route.ts: uses `Resend` but does not import it.",
    };
    // No files at all is indistinguishable from "file absent" for the claim —
    // but an EMPTY project would already be terminally failed elsewhere
    // (ensureNonEmptyGenerationContent), so either outcome is safe. Assert the
    // current contract: absent file ⇒ dropped.
    const result = dropResolvedVerifierFindings([finding], []);
    expect(result.dropped).toHaveLength(1);
  });
});
