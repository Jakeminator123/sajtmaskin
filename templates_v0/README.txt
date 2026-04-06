templates_v0 — Mappstruktur & hur allt hänger ihop
Översikt
Projektet skrapar v0.app community templates — gratis Next.js/React-mallar som Vercel tillhandahåller. För varje mall samlas fyra saker:

Data	Vad det är	Var det hamnar
ZIP
Källkoden (ett komplett Next.js-projekt)
downloads/<kategori>/<mall-id>/*.zip
Metadata
Titel, beskrivning, og:image-URL m.m.
out/template-metadata/<mall-id>.json
Detail-bilder
Bilder/video från mallens detaljsida på v0
downloads/template-images/<kategori>/<mall-id>/detail/
Listing-bilder
Miniatyrbilder från kategorirutnätet (förhandsvisning)
downloads/template-images/<kategori>/<mall-id>/listing/
Nyckeln som kopplar ihop allt är mall-ID (t.ex. Dav88XZy66u) — samma ID finns i mappnamn, metadata-filnamn och loggfiler.

Mappstruktur
templates_v0/
├── auth.json                          # Sparad Chromium-session (cookies)
├── requirements.txt                   # Python: playwright>=1.51.0
├── scripts/
│   ├── v0_sync_templates.py           # Huvudskript (interaktivt)
│   ├── v0_download_zips.py            # Bibliotek: ZIP-nedladdning + insamling
│   └── v0_download_template_images.py # Bibliotek: media-scraping + metadata
│
├── out/
│   ├── collected-template-ids.json    # Alla mall-ID + kategorier + listing-URL:er
│   ├── downloaded.jsonl               # Logg: lyckade ZIP-nedladdningar
│   ├── paid-skipped.jsonl             # Logg: betalda mallar (hoppade)
│   ├── errors.jsonl                   # Logg: misslyckade försök
│   ├── template-images.jsonl          # Logg: media-nedladdningar
│   └── template-metadata/             # En JSON per mall
│       ├── Dav88XZy66u.json
│       ├── 4E26j9y3vqF.json
│       └── ...                        # (344 filer)
│
└── downloads/
    ├── <kategori>/                    # ZIP-arkiv per kategori
    │   └── <mall-id>/
    │       └── *.zip                  # Källkoden
    │
    └── template-images/               # Bilder & video per kategori
        └── <kategori>/
            └── <mall-id>/
                ├── detail/            # Bilder från detaljsidan
                │   ├── D001_*.jpg
                │   ├── D002_*.png
                │   └── ...
                └── listing/           # Miniatyrbilder från rutnätet
                    ├── L001_*.jpg
                    └── ...
Konkret exempel: Dav88XZy66u
ZIP:      downloads/animationer/Dav88XZy66u/*.zip         (11 MB)
Metadata: out/template-metadata/Dav88XZy66u.json          (1.7 KB)
Detail:   downloads/template-images/animationer/Dav88XZy66u/detail/   (41 filer)
Listing:  downloads/template-images/animationer/Dav88XZy66u/listing/  (10 filer)
Metadata-filen innehåller:

{
  "url": "https://v0.app/templates/Dav88XZy66u",
  "h1": "Community",
  "ogTitle": "Apple-Style Scroll Animation 3D Product Explode - Animations Templates",
  "ogDescription": "Cinematic scroll-driven product showcase ...",
  "ogImage": "https://v0.app/chat/api/og/t/Dav88XZy66u",
  "description": "...",
  "canonical": "https://v0.app/templates/apple-style-scroll-animation-...",
  "templateId": "Dav88XZy66u",
  "nextData": null
}
ZIP-innehåll (projekten)
Varje ZIP är ett komplett Next.js-projekt med app/, components/, package.json etc.

Av 352 nedladdade ZIP:ar:

75 har pnpm-lock.yaml → installera med pnpm install
3 har package-lock.json → installera med npm install
274 har ingen lockfile → pnpm install eller npm install fungerar
Alla har package.json. Typisk stack: Next.js + Tailwind + shadcn/ui.

Kategorimappar (svenska namn)
Mappnamn	v0-slug
agenter
agents
AI
ai
animationer
animations
appar och spel
apps-and-games
blogg och portfolio
blog-and-portfolio
designsystem
design-systems
e-handel
ecommerce
inloggning och registrering
login-and-sign-up
instrumentpaneler
dashboards
komponenter
components
landningssidor
landing-pages
layouter
layouts
webbplatsmallar
website-templates
En mall placeras i en kategori-mapp (den första alfabetiskt om den tillhör flera).

Loggfiler (out/*.jsonl)
Alla loggar är JSONL (en rad per post):

downloaded.jsonl — templateId, kategoriLabel, path till ZIP
paid-skipped.jsonl — mallar som kostar credits (hoppades)
errors.jsonl — misslyckade nedladdningar (timeout, krasch)
template-images.jsonl — antal hittade/sparade bilder per mall
Status just nu
Antal
Insamlade mall-ID
1162
Har ZIP
310
Har metadata
341
Har detail-bilder
341
Har listing-bilder
215
Kompletta
~250
Betalda (hoppade)
48
Disk: ZIP
471 MB
Disk: bilder
1.4 GB
