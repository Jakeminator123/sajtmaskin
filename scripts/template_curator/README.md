# Template curator

Det här Backoffice-verktyget bygger en kuraterad, revisionsbar projektion av
`Template (v0-mall)`-arkiven i det kanoniska Blob-manifestet. Det skiljer på
hela projekt som kan användas som referens, komponentdemos som kräver manuell
bedömning och arkiv som ska gallras bort.

## Körning

Standardläget är avsiktligt nätverksfritt och listar bara katalogurvalet:

```bash
python -m scripts.template_curator.cli --scope site_visible --category ecommerce --limit 20
```

Analys kräver ett uttryckligt val. Då laddas bara de valda arkiven ner:

```bash
python -m scripts.template_curator.cli --scope variant_cited --ids id1,id2 --analyze
```

Scopes är `blob`, `preview_fit`, `gallery`, `site_visible` och
`variant_cited`. `--ids`, `--category` och `--limit` kan kombineras. Rapporten
skrivs under `data/backoffice/template-curator/reports/`, vilket är git-ignorerat.

## Säkerhetsmodell

- Bara kanoniska, credential-fria HTTPS-URL:er på Vercel Blob accepteras.
- `archiveSizeBytes`, `Content-Length`, löpande byteantal och SHA-256 verifieras.
- Cachen är SHA-adresserad och publiceras med atomisk rename.
- ZIP-metadata stoppas vid osäkra sökvägar, dubbletter, länkar, kryptering,
  orimligt många filer, höga expanderade storlekar eller kompressionskvoter.
- Arkiven extraheras aldrig. Paket installeras inte och mallkod körs aldrig.
- Python stegar verifierade ZIP-filer i en temporär mapp och anropar den
  befintliga Node-auditen en gång i `--dir`-läge. Ett enskilt fel blir en
  `rejected` profil och stoppar inte andra valda mallar.

Node-auditen läser endast begränsad metadata, `package.json` och begränsade
källfiler för env-evidens. Den känner igen Next, Vite, Remix, Astro,
SvelteKit och statisk HTML (`index.html`/`index.htm`, oavsett case).

## Rapport och addenda

Varje profil binds till mall-id, arkivets SHA-256 och aktuell extractor-SHA.
Den innehåller `qualified`/`review`/`rejected`, `app`/`website`, ramverk,
paketkompatibilitet mot Sajtmaskins `package.json`, feature-kandidater och de
filer som behöver granskas för implementationen.

Verktyget skriver **aldrig** `config/variant-template-addenda.json`. Rapporten
visar i stället om befintlig addendum är `current`, `stale` eller `missing` och
ger explicita kandidatkommandon för den separata addenda-generatorn.
