# K1 — registerförening och #1090-rebase

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: **blockerad** tills #1087 är mergad och dom-kolumnen i master-planen är
ifylld. Kör inte denna aktivitet innan båda är klara.

## Problemet

[#1087](https://github.com/Jakeminator123/sajtmaskin/pull/1087) och
[#1090](https://github.com/Jakeminator123/sajtmaskin/pull/1090) skriver båda om
`config/variant-template-addenda.json` med delvis motstridiga beslut:

- #1087: raderade tomma posten `mEefgKyVifq` (+ dess citeringar i `warm-local`
  och `nature-flow`), markerade 9 poster `reviewed`, införde Brief-rankat
  mallval.
- #1090: 19 beslut (11 `reviewed`, 8 `disabled` inkl. `mEefgKyVifq`),
  anti-kopieringsnoter, Python-test speglar `current`-eller-`disabled`,
  testfixtur bytt till `reviewed`-post.
- **5 direkta motsägelser** (reviewed vs disabled) — se master-planens
  beslutstabell.

## Uppgift

1. Rebasa `chore/b4-curate-variant-addenda` på post-#1087-master (eller gör om
   den som ny branch om rebasen blir grisig — innehållet är viktigare än
   historiken).
2. Registerinnehållet efter förening:
   - `mEefgKyVifq`: acceptera #1087:s radering — släpp #1090:s
     `disabled`-variant av posten.
   - De 5 motsägelserna: applicera ägarens dom från master-planen.
   - Överlappande `reviewed` (`1fwaS3xF7MM`, `Pr8Pms0CEBm`, `SD8IPhg8bcC`,
     `XmzC9oi7g4m`): behåll #1090:s längre anti-kopieringsnoter; slå ihop med
     #1087:s noter om de tillför något.
   - #1090-beslut utan motsvarighet i #1087 (reviewed: `0brPGNpjNkt`,
     `h4nibkqysVJ`, `iBPsMqPGRTZ`, `jZpf5doYiNe`, `tnZGzubtsTc`,
     `v9Hg1dBb5o3`, `XOMN4texeRO`; disabled: `fnLkUW05eg3`, `ov3ApgfOdx5`):
     behåll som de är.
3. `disabled`-poster ska ha tom `structuralReferences` och sakna
   `extractorSha256` (schemakrav).
4. Verifiera att #1087:s Brief-rankning hanterar `disabled` vettigt: en
   utdragslös kandidat ska rankas ner men får väljas (stillbilden går ändå).
   Finns ingen sådan gren — skriv test som låser beteendet.
5. Uppdatera B4-aktivitetens status i
   `docs/plans/active/2026-08-18-briefing-och-kallpaket/` med slutläget.

## Vad som INTE ingår

- Ny kuration av de resterande `generated`-posterna (framtida B4-pass).
- Ändringar i rankningslogiken utöver disabled-testet.
- Gränser (max 3 utdrag / 9 000 tecken) och SHA-bindning röras inte.

## Verifiering

- `npm run typecheck` + `npm run scaffolds:validate`
- `npm run templates:addenda:check`
- `npx vitest run src/lib/gen/scaffold-variants/` (inkl. template-inspiration)
- `python -m pytest backoffice/test_template_curator_catalog.py -q`

## Klart när

En registerfil utan motsägelser på master, ägarens fem domar spårbara i
`reviewNotes`, och #1090 stängd (mergad eller ersatt av förenings-PR:en).
