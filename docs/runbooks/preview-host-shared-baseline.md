# Preview-host: den delade baslinjen (backup-anteckningar)

Det här är anteckningarna om hur den **delade** preview-hosten (`vm-fly-jakem`)
är uppsatt och varför den fungerar bra, så att uppsättningen kan återställas
eller jämföras med när isoleringen per projekt (`SM-080`) rullas ut.
Källan till värdena är [`preview-host/fly.toml`](../../preview-host/fly.toml),
[`preview-host/src/runtime/shared.js`](../../preview-host/src/runtime/shared.js)
och Git-historiken; den här sidan är en läsbar sammanfattning, inte en
tredje sanning. Ändras ett värde: ändra källan och uppdatera raden här.

> **Driftläge nu: maskinläget (`SM-080`).** `vm-fly-jakem` kör
> `PREVIEW_HOST_ISOLATION=machine` sedan 2026-10-22 och är bara kontrollplan
> (API, store, proxy, gästernas livscykel). Därför står `fly.toml` på
> `performance-1x`/2 GB, swap 512 MB och utan `PREVIEW_HOST_INSTALL_CONCURRENCY`.
> Maskin- och install-slot-raderna nedan är baslinjens värden och finns bara
> i Git-historiken (före krympningen 2026-11-11). **En återgång till
> shared-läget kräver att VM-storleken höjs igen** innan läget slås om, annars
> OOM-dödas kundinstalls på 2 GB.

## Vad baslinjen är

En enda långlivad Fly Machine med en persistent volym kör allt: API,
sessionsstore, preview-proxy **och** varje kundprojekts `npm install`, verify
och `next dev`. Snabbheten kommer av att allt är förinstallerat och varmt på
samma disk. Det är också exakt det som gör att projekten inte är isolerade
från varandra (de kör som samma OS-användare på samma filsystem).

| Del | Värde i baslinjen | Varför |
| --- | --- | --- |
| Maskin | `performance-4x`, 16 GB RAM, region `arn`, `swap_size_mb = 2048` | Tio samtidiga `next dev` + installs rymdes inte på `shared-cpu-4x`/8 GB; swap gör minnestoppar till inbromsning i stället för OOM-död. Måste matcha `fly scale vm`, annars nedgraderar nästa deploy tyst. |
| Volym | `preview_host_data` monterad på `/data` (20 GB) | Workspaces, verify-workspaces, store och paketcachar ligger här, aldrig på den efemära rootfs:en (~8 GB) som fylldes till 0 byte 2026-07-31. |
| Paketcachar | `NPM_CONFIG_CACHE`, `PNPM_CONFIG_STORE_DIR`, `YARN_CACHE_FOLDER`, `YARN_GLOBAL_FOLDER`, `COREPACK_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` under `/data/package-caches` | Varm cache = snabb install för alla projekt. Nyckelnamnen är de verktygen faktiskt läser (pnpm 11 läser `PNPM_CONFIG_*`, Yarn Berry skriver i `YARN_GLOBAL_FOLDER`). Ett ärvt värde utanför `/data` ignoreras av `sanitizedEnv`. |
| Cachetak | `PREVIEW_HOST_PACKAGE_CACHE_MAX_BYTES` default 6 GB; purge tar en exklusiv install-slot | Obegränsad cache var det som fyllde disken; en purge mitt i en install gav falska ENOENT/EINTEGRITY. |
| Install-slots | `PREVIEW_HOST_INSTALL_CONCURRENCY = 2` (tak 8, default 1) | Varje install kan toppa 1–2 GB; två parallella installs OOM-dödades 2026-07-02 på 8 GB. |
| Fingerprint-skip | `.preview-host-deps.json` per workspace, policy `2026-07-13-dev-deps-local-toolchain` | Oförändrad `package.json` + låsfil ⇒ ingen ny install alls. Verify kopierar live-workspacets `node_modules` vid träff. |
| Install-timeout | `PREVIEW_HOST_INSTALL_TIMEOUT_MS` default 10 min | Ett hängt `preinstall` fick annars inte kila fast hela install-kön. |
| Readiness | `PREVIEW_HOST_RUNTIME_READY_MAX_MS = 600000`, `..._CONNECT_MAX_MS = 90000`, tom body 90 s | Täcker install + kall första kompilering utan att en död server får tio minuter. |
| Idle-reaper | `PREVIEW_HOST_RUNTIME_IDLE_STOP_MS` default 10 min, svep var 60 s | En dev-server utan trafik eller öppen HMR-socket stoppas och sessionen blir `hibernated`; nästa besök bootar om. |
| Session-TTL | `PREVIEW_SESSION_TTL_MS = 7200000` | Två timmar; städningen tar bort utgångna sessioner, workspaces och loggar. |
| HMR | `SAJTMASKIN_PREVIEW_HMR_PROXY = "true"` ⇒ `SAJTMASKIN_PREVIEW_DISABLE_HMR=false` | Hot patch utan iframe-reload i prod. |
| Processer | `spawnNpm` / `runShellCommand` i `shared.js`; `next dev --hostname 127.0.0.1 --port 41xx` | Port per chat ur `PREVIEW_HOST_RUNTIME_PORT_BASE`/`_COUNT` (4100/200). Processgrupp så stop dödar hela trädet. |
| Health-check | `/health` var 30 s, timeout 20 s, grace 30 s | 10 s falsk-larmade när maskinen var upptagen med en install. |
| Auth | `PREVIEW_HOST_API_KEY` krävs för `/preview/*` och `/admin/*` utanför lokal miljö | Appen skickar samma nyckel som `SAJTMASKIN_PREVIEW_HOST_API_KEY`. |

## Hur man återställer baslinjen

1. Höj först hosten till baslinjens storlek, i samma PR: `[[vm]]` i
   `fly.toml` till `performance-4x`/`16gb`, `swap_size_mb = 2048` och
   `PREVIEW_HOST_INSTALL_CONCURRENCY = "2"` under `[env]`. Kontrollplanets
   `performance-1x`/2 GB rymmer inte kundinstalls (varje install kan toppa
   1–2 GB).
2. Sätt `PREVIEW_HOST_ISOLATION` till `shared` eller ta bort nyckeln helt
   (default är `shared`; i drift är den en Fly-secret, så
   `fly secrets unset --stage -a vm-fly-jakem PREVIEW_HOST_ISOLATION`).
   Inget annat i hosten ändras av isoleringsläget.
3. Deploya enligt `preview-host/README.md` § Deploy till Fly och kontrollera
   att `fly scale show -a vm-fly-jakem` visar `performance`, 4 CPU, 16384 MB
   (samma som `fly.toml`), och att `/health` har `isolation.mode` = `shared`.

Gästmaskiner som eventuellt finns kvar i gäst-appen rensas med
`fly machines list -a <gäst-app>` och `fly machines destroy`; de påverkar
inte den delade hosten.

## Varför baslinjen inte räcker för öppen lansering

Allt ovan optimerar **en** maskin för många projekt. Det är anledningen till
att en kund som lägger ett `postinstall`-skript i sin egen `package.json` kör
som hostens användare bredvid alla andras `.env.local` och hostens process.
Beslutet 2026-09-18 i [beslutsindexet](../decisions/README.md) är därför en
isolerad Fly Machine per projekt; koden för det läget är
`preview-host/src/runtime/machine-runtime.js` och `preview-host/guest/`, med
pilot- och acceptansinstruktioner i `preview-host/guest/README.md` och
`preview-host/README.md`.
