# Builder components

Builder-UI:t är grupperat efter ansvar. Tester ligger bredvid koden de skyddar.

| Mapp | Ansvar |
|---|---|
| `chat/` | Chatt, meddelanderendering, verktygsresultat och kollapslogik |
| `diagnostics/` | Diagnostik- och traceytor |
| `preview-panel/` | Preview, kodvy, inspect, composer och Byggblock-UI |
| `project-transfer/` | Import från repo och export till GitHub |
| `publishing/` | Deploy, SEO och domäner |
| `readiness/` | F3-krav och lanseringsberedskap |
| `shell/` | Builderns övergripande chrome och felgräns |
| `version-history/` | Versionslista, jämförelse, återställning och samarbete |

`preview-panel/` är i sin tur uppdelad i `code/`, `composer/`, `dossiers/`,
`inspect/`, `pages/` och `runtime/`. Roten innehåller bara panelens orkestrering,
publika typer och små tvärgående ytor.

`BuilderMessageTooling.tsx` och `VersionHistory.tsx` är små offentliga fasader.
Importera i övrigt komponenten direkt från dess domänmapp; skapa inte ett globalt
barrel-index som drar klientkod över domängränser.

Dossiermanifest och urvalsregler bor inte här. Kanoniska ägare är
`data/dossiers/` respektive `src/lib/gen/dossiers/`; `preview-panel/dossiers/`
är endast controller och presentation.
