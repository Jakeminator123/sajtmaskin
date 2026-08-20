# Fly: `npm install` dör med exit 254

Våg 2 · **Lokalt eller cloud-med-begränsning** · Fynd `P0-P1` / `SM-035`

## Varför inte ren cloud

Rotorsaken kräver Fly-åtkomst: disk, cache och den sista install-loggen på VM:en.
Cloud-podar har inte det. En cloud-agent kan göra **härdningen** (bättre
loggning och en retry) men kan inte avgöra *varför* det händer.

Dela därför upp arbetet: härdningen kan gå i cloud, diagnosen måste göras lokalt
eller av ägaren mot Fly.

## Fyndet

Preview-VM:en dör i uppstarten. Signatur `a0bc26af7689`: 17 träffar över 4
chattar, senast 2026-08-19 07:06. I sessionen slog det till 09:03 på v4 och
tvingade fram en restore till v5 — previewen var död medan Vercel-prod bytte
instans.

Hosten kör `npm install --no-audit --include=dev` när lockfilen saknas eller är
inaktuell. Exit 254 är npms generiska krasch och betyder oftast slut på disk,
korrupt cache eller ett avbrutet barnprocess.

Det finns redan en `isNoSpaceInstallFailure`, men felet loggas bara som «exit
254» — rotorsaken når aldrig `engine_version_error_logs`.

Ankare: `preview-host/src/runtime/package-install.js:305-342`.

## Fix — härda befintlig host, bygg ingen ny pipeline

1. Logga `stderr` och ENOSPC-signalen till error-loggen, inte bara exit-koden.
   Utan det här steget kan ingen diagnos göras nästa gång heller.
2. Rensa cachen vid ENOSPC — funktionen finns redan.
3. Försök om **en** gång.

Steg 1 är det viktigaste och kan landa ensamt.

## Verifiering

```powershell
npm run typecheck
npx vitest run preview-host
```

`preview-host/` har egen `package.json` och egen lockfil — rot-`npm ci`
installerar inte dess beroenden. Kör `npm ci --prefix preview-host` först.

## Gör inte

- Bygg ingen ny install-pipeline och byt inte pakethanterare.
- Höj inte diskstorleken som «fix» utan att först ha loggen som visar att disken
  är problemet.
- Rör inte boot-page-logiken — det är [ett eget paket](postcheck-boot-page.md).
