# Content-batch 1

Starta **efter** att #1437 är mergad till `preview` **och** den första
riktiga sidan `/skapa-hemsida-med-ai` är granskad. Batcha inte tio sidor
i samma PR. Routes finns redan som placeholders.

## Sidor

- `/skapa-hemsida`
- `/ai-hemsidebyggare`
- `/hemsida-till-foretag`
- `/hemsideprogram`
- `/hemsida-utan-kod`

## Uppdrag

Integrera färdig design/content enligt samma tekniska kontrakt utan att göra
sidorna visuellt identiska. Läs brief under [`../pages/`](../pages/).

Per sida: extrahera innehåll, unik metadata, 1–3 internlänkar, CTA,
mobil QA, `status: "ready"` först när sidan är klar.

Om underlaget är ett eget Vite/Next-projekt: extrahera. Ingen nested app.
