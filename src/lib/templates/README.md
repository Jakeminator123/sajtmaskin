# v0 template gallery (product UI)

Browse cards and semantic search on the **landing / category** flow, backed by `templates.json` and **`template-embeddings.json`**.

This is **not** the own-engine **reference catalog** used for generation prompt augmentation:

- Reference catalog (Vercel-style rows): `src/lib/gen/template-library/` — `npm run template-library:embeddings`
- Gallery embeddings: `npm run templates:embeddings`

Keep them separate; `npm run template-library:rebuild` does **not** regenerate v0 gallery vectors. Use `npm run template-library:rebuild:with-v0-gallery` only when you want both in one go.
