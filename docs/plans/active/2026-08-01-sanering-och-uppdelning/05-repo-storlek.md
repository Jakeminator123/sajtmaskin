---
status: active
owner: unassigned
topic: Repo-bantning — binärer ut ur arbetsytan (Blob/CDN), embeddings ur bundlen, och därefter en koordinerad git filter-repo-omskrivning av 624 MiB historik. Omskrivningen är destruktiv och kräver ägar-OK.
created: 2026-08-01
source: Master-planens steg 7–8. Blob-svep av hela historiken 2026-08-01 (git rev-list + cat-file, alla refs).
---

# Steg 7–8: repo-storlek

## Verifierat läge

| Mått | Värde |
|---|---|
| Spårad arbetsyta | ~66 MiB |
| Packade git-objekt | **624,23 MiB** (+ 14,5 MiB lösa) |
| `public/video/intro.mp4` | 35,45 MiB — används av `src/components/modals/onboarding-modal.tsx:123` |
| `src/lib/templates/template-embeddings.json` | 8,77 MiB — bundlas via `require()` i `src/lib/templates/template-search.ts:31` |

Största historik-ballast (blob-svep, topp): embeddings-versioner ~85 MiB
(en 33 MiB + sex à 8–9 MiB + tre `template-library-embeddings.json` à 4–7 MiB),
`output/qa-browser-runs/`-zippar och skärmdumpar (15,4 + 4,3 + 4,2 MiB),
`_template_refs/.../demo-preview.mp4` 6,7 MiB, `public/Sajtmaskin logo.png`
5,0 MiB, `public/video/Bla-desktop.MP4` 4,9 MiB,
`scripts/mascot/source-originals/*.jpg` ~8 × 4 MiB,
`.cursor/documents/Vercel_llms-full.txt` 4,2 MiB.

## Steg 7a — intro-videon till Blob/CDN

1. Ladda upp `intro.mp4` till Vercel Blob (appens konto, inte användarsajters).
2. Byt `src` i `onboarding-modal.tsx:123` till Blob-URL:en (env-baserad bas-URL
   enligt `docs/ENV.md`-mönstret; ingen ny env utan registrering där).
3. Radera filen ur arbetsytan. Kolla samtidigt `public/video/Bla-desktop.MP4`
   och `public/Sajtmaskin logo.png` — samma behandling om de används, radera
   om inte.

## Steg 7b — embeddings ur bundlen

`template-search.ts:31` kräver in filen synkront i serverbundlen, och
admin-routen (`/api/admin/templates/embeddings` →
`template-embeddings-refresh.ts`) skriver den **lokalt** via
`template-embeddings-storage.ts` — en skrivning som inte persisterar på
Vercel serverless. Storage-modulen har redan typen
`TemplateEmbeddingsStoragePreference = "local" | "auto"` som förberedelse.

1. Flytta lagringen till Blob: `resolveTemplateEmbeddingsStorageMode()` får
   välja Blob i deployad miljö, lokal fil i dev.
2. Byt `require()` i `template-search.ts` mot lazy fetch + in-memory-cache
   (samma livslängd som modulens nuvarande cache).
3. Överväg binärt/komprimerat format (float32-array i st.f. JSON-tal) —
   ~9 MiB JSON blir typiskt 2–3 MiB.
4. Samma behandling för `src/lib/gen/template-library/`-embeddings om de
   fortfarande genereras.

Testkrav: template-sökningen är pipeline-yta — riktade tester på
laddning/fallback (Blob otillgänglig ⇒ tydligt fel, inte tom sökning).

## Steg 8 — historik-omskrivning (kräver ägar-OK, pausa här)

Att radera dagens filer minskar inte 624 MiB historik. Kör `git filter-repo`
som **koordinerad engångsoperation**:

| Förutsättning | Kontroll |
|---|---|
| Alla PR:ar mergade/stängda | `gh pr list` tomt |
| Alla worktrees borttagna | `git worktree list` = bara huvudcheckouten |
| Ägaren informerad om force-push + omkloning | explicit OK |

Borttagningsmål (paths, alla revisioner): `output/qa-browser-runs/`,
`_template_refs/**/*.mp4`, `scripts/mascot/source-originals/`,
`public/video/*.mp4`, `public/video/*.MP4`, gamla
`template-embeddings.json`/`template-library-embeddings.json`-versioner,
`.cursor/documents/Vercel_llms-full.txt`, QA-zippar/screenshots.

Efterarbete: force-push till `origin/master`, verifiera GitHub-storleken,
alla kloner klonas om (dokumentera i `docs/runbooks/`). Förväntad effekt:
pack < ~100 MiB. **Detta steg får inte köras av en agent på eget initiativ**
— det är destruktivt och skrivs här enbart som recept.
