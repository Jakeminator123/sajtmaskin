# Evaluation Checklist

Use this checklist before promoting a curated template reference into an internal scaffold improvement.

## Template quality

- Repo URL is verified and not a settings page, blob link, deploy URL, or attachment URL.
- Repo contains a real Next.js implementation.
- The dossier contains useful selected files, not just marketing text.
- Monorepo examples have a clear usable path or were explicitly curated from one.

## Scaffold fit

- The template clearly strengthens one of the existing scaffold families.
- The improvement adds structural value, not just nicer copy or visuals.
- The extracted patterns can be represented inside the current `ScaffoldManifest` format.

## Runtime safety

- Internal scaffold still includes `app/layout.tsx`.
- Internal scaffold still includes `app/globals.css` with `@theme inline`.
- Internal scaffold passes `npm run scaffolds:validate`.
- Post-generation assumptions remain compatible with:
  - `src/lib/gen/autofix/rules/scaffold-import-checker.ts`
  - `src/lib/gen/validation/project-sanity.ts`
  - `src/lib/gen/stream/finalize-version.ts`

## Regression checks

- Re-run scaffold prompt matrix cases from `docs/llm/egen-motor/scaffold-prompt-matrix.md`.
- Compare old and new outputs for auth, SaaS, dashboard, ecommerce, blog, and content-site prompts.
- Verify that common failures improve:
  - weak login flow
  - missing app shell
  - generic placeholder structure
  - shallow pricing or checkout structure

## Promotion result

Promotion is complete only when:

- the curated dossier remains available in `template_library/`
- scaffold research metadata is updated
- internal scaffold manifests are updated intentionally
- scaffold embeddings are refreshed
