# v0 Template Sync

Skrapar och laddar ner alla gratis community templates fran [v0.app](https://v0.app/templates) — inklusive ZIP-kod, metadata, forhandsbilder och detaljbilder.

## Status i detta repo

Den har mappen ar en lokal test-/sync-yta for `templates:blob:sync`, inte den
kanoniska runtime-katalogen. Appen laser den genererade katalogen i
`src/lib/templates/*`. Om du har en separat v0-intake kan den ligga i
`templates_v0/` i repo-root, men den katalogen ar gitignored och behover inte
finnas i en normal checkout.

## Snabbstart for separat v0-intake

```powershell
cd <repo>\templates_v0
pip install -r requirements.txt
python -m playwright install chromium
python scripts\v0_sync_templates.py
```

## Hur det fungerar

### Ett skript gor allt

`scripts/v0_sync_templates.py` ar det enda skriptet du kor. Det har en interaktiv meny:

```
1) Logga in + hamta allt  (logga in -> samla lista -> ladda ner)
2) Hamta allt             (samla lista + ladda ner, befintlig session)
3) Bara synka             (ladda ner saknade, ingen ny lista)
4) Logga in               (bara spara ny session)
0) Avsluta
```

**Val 1** ar det du normalt anvander — det gor allt i ett steg:
1. Oppnar en webblasare dar du loggar in pa v0 (via e-post/GitHub — Google blockeras av Playwright)
2. Samlar in alla mall-ID fran v0:s 13 kategorisidor (klickar "Load more" automatiskt)
3. Analyserar vilka mallar du redan har pa disk
4. Laddar ner **bara det som saknas** — inga dubbletter

### Kommandorads-lage (inga fragor)

```powershell
# Samla in + synka allt (nattlage)
python scripts\v0_sync_templates.py --full --pace 4

# Bara synka (listan finns redan)
python scripts\v0_sync_templates.py --go --pace 4

# Begransat antal
python scripts\v0_sync_templates.py --go --limit 50 --pace 2
```

## Mappstruktur

```
templates_v0/
├── auth.json                    # Sparad session (cookies fran v0/Vercel)
├── requirements.txt             # Python-beroenden (playwright)
├── .cursorignore                # Cursor ignorerar binarer
│
├── scripts/
│   ├── v0_sync_templates.py     # HUVUDSKRIPTET — kor detta
│   ├── utils/
│   │   ├── zips.py              # Bibliotek: ZIP-nedladdning + ID-insamling
│   │   └── media.py             # Bibliotek: bild-scraping + metadata
│   └── old/                     # Arkiverade gamla skript
│
├── out/
│   ├── collected-template-ids.json   # Alla mall-ID + listing-URL:er
│   ├── downloaded.jsonl              # Logg: lyckade ZIP-nedladdningar
│   ├── paid-skipped.jsonl            # Logg: betalda mallar (hoppade)
│   ├── errors.jsonl                  # Logg: misslyckade forsok
│   └── template-metadata/            # Legacy metadata (flyttas till mallmapp)
│
└── downloads/                   # ALLA MALLAR HAR
    ├── appar och spel/
    │   ├── 3d-keyboard-chat__JTMkCmk0GvC/
    │   │   ├── template.zip     # Kallkoden (Next.js-projekt)
    │   │   ├── metadata.json    # Titel, beskrivning, URL:er
    │   │   ├── detail/          # Bilder fran mallens detaljsida
    │   │   │   ├── D001_xxx.jpg
    │   │   │   ├── D002_xxx.png
    │   │   │   └── ...
    │   │   └── listing/         # Miniatyrbilder fran kategorisidan
    │   │       ├── L001_xxx.jpg
    │   │       └── ...
    │   ├── mobile-finance-app__QXnqVOwCSco/
    │   │   └── ...
    │   └── ...
    ├── AI/
    ├── animationer/
    ├── blogg och portfolio/
    ├── designsystem/
    ├── e-handel/
    ├── inloggning och registrering/
    ├── instrumentpaneler/
    ├── komponenter/
    ├── landningssidor/
    ├── layouter/
    └── webbplatsmallar/
```

### Mappnamn-format

Varje mall har en mapp med formatet:

```
<slugifierat-namn>__<v0-ID>
```

Exempel: `apple-style-scroll-animation-3d-product-explode__Dav88XZy66u`

- **Slugen** (fore `__`) gor mappen lasbar i filhanteraren
- **ID:t** (efter `__`) garanterar unikhet och koppling till v0.app

### Vad varje mall innehaller

| Fil | Beskrivning |
|-----|-------------|
| `template.zip` | Kallkoden — ett komplett Next.js-projekt (pnpm/npm) |
| `metadata.json` | Titel, beskrivning, og:image, canonical URL, knappar |
| `detail/` | Bilder/video fran mallens detaljsida (10-60 filer) |
| `listing/` | Miniatyrbilder fran kategori-rutnatet (typiskt 10 filer i olika storlekar) |

### metadata.json-format

```json
{
  "url": "https://v0.app/templates/Dav88XZy66u",
  "h1": "Community",
  "ogTitle": "Apple-Style Scroll Animation 3D Product Explode - Animations Templates",
  "ogDescription": "Cinematic scroll-driven product showcase with frame sequence animation...",
  "ogImage": "https://v0.app/chat/api/og/t/Dav88XZy66u",
  "description": "Cinematic scroll-driven product showcase...",
  "canonical": "https://v0.app/templates/apple-style-scroll-animation-...-Dav88XZy66u",
  "twitterTitle": "...",
  "twitterDescription": "...",
  "buttonSample": ["Show Menu", "Community Templates", "99", "Open in"],
  "templateId": "Dav88XZy66u",
  "nextData": null
}
```

## Kategorier

| Mapp (svenska) | v0-slug | Typiskt antal |
|----------------|---------|---:|
| appar och spel | apps-and-games | ~400 |
| AI | ai | ~80 |
| animationer | animations | ~56 |
| landningssidor | landing-pages | ~30 |
| webbplatsmallar | website-templates | ~17 |
| blogg och portfolio | blog-and-portfolio | ~16 |
| instrumentpaneler | dashboards | ~15 |
| komponenter | components | ~14 |
| agenter | agents | ~12 |
| inloggning och registrering | login-and-sign-up | ~10 |
| designsystem | design-systems | ~7 |
| e-handel | ecommerce | ~7 |
| layouter | layouts | ~6 |

En mall placeras i **en** kategori-mapp (den forsta alfabetiskt om den tillhor flera).

## Duplettkontroll

Skriptet undviker dubbletter pa tre satt:

1. **ID-baserat**: Varje mall har ett unikt v0-ID. Scan-funktionen soker pa ID oavsett vilken kategori-mapp filen ligger i.
2. **Namn-baserat**: Varnar om tva mall-ID har samma slugifierade namn (kan vara olika versioner av samma mall).
3. **ZIP-rensning**: Tar automatiskt bort dubbla ZIP-filer i samma mapp (fran avbrutna korningar).

## Hastighetsnivaer

```
1) Full fart        — 0.3-0.8s paus
2) Snabb            — 0.5-1.5s paus
3) Normal           — 1.5-3.0s paus
4) Lugn (20-30%)    — 3.0-6.0s paus, begransad Chromium
5) Minimal (10%)    — 6.0-12.0s paus, minimal Chromium
```

Niva 4-5 begransar aven Chromiums resursanvandning (GPU av, farre processer).

## Session och inloggning

- v0 kraver inloggning for att ladda ner ZIP (via "Open in" -> chatt -> meny -> Download ZIP)
- Metadata och bilder kan hamtas utan inloggning
- Sessionen sparas i `auth.json` och gar ut efter ~15-60 minuter
- Skriptet detekterar nar sessionen gar ut (3 ZIP-fail i rad) och stoppar automatiskt
- Kor val 1 igen for att logga in pa nytt och fortsatta dar du var

**Viktigt**: Google-inloggning fungerar INTE i Playwright (blockeras). Anvand **e-post** eller **GitHub** vid inloggning.

## Avbrott och aterupptagning

- **Ctrl+C** avbryter tryggt — allt sparas lopande
- Nasta korning analyserar vad som redan finns och fortsatter dar den slutade
- Inga halvfardiga filer — ZIP sparas atomiskt, metadata skrivs helt
- Betalda mallar loggas permanent i `paid-skipped.jsonl` och hoppas alltid

## Kanda problem

### ZIP FAIL: Timeout
Vissa mallar ger timeout vid ZIP-nedladdning. Tva orsaker:
- **Session utgangen** — kor val 1 for att logga in igen
- **Mallen strular** — chatten genereras inte klart inom 120s (vanligt for stora mallar)

Mallar som failar far metadata + bilder sparat anda. ZIP:en hamtas vid nasta korning.

### ZIP FAIL: Locator.is_enabled
"Download ZIP"-knappen i menyn ar gra/disabled. v0 har inte genererat projektet an. Hoppas automatiskt.

### Mallar med flera ID
Samma mallnamn kan finnas med flera v0-ID (t.ex. `elevenlabs-music-starter` med 3 ID). Det ar olika versioner publicerade av skaparen. Alla laddas ner som separata mallar.

## Filer

| Fil | Roll |
|-----|------|
| `scripts/v0_sync_templates.py` | Huvudskriptet — det enda du kor |
| `scripts/utils/zips.py` | Bibliotek: Playwright-logik for ZIP + insamling |
| `scripts/utils/media.py` | Bibliotek: bild-scraping + metadata |
| `auth.json` | Sparad session (ej i git) |
| `requirements.txt` | `playwright>=1.51.0` |
| `out/collected-template-ids.json` | Alla insamlade mall-ID + listing-URL:er |

## ZIP-innehall

Varje `template.zip` ar ett komplett **Next.js**-projekt:
- `app/`, `components/`, `package.json`
- Typisk stack: Next.js + Tailwind + shadcn/ui
- ~75 mallar har `pnpm-lock.yaml` (kor `pnpm install`)
- ~275 har ingen lockfile (kor `pnpm install` eller `npm install`)
