# GitHub-organisation för kundsajter

Status 2026-10-22: **kod klar, inaktiv tills env finns.** Fyra env-nycklar
(`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`,
`GITHUB_SITES_ORG`) slår på `FEATURES.useGitHubSitesOrg`. Då tar deploy-routen
en kodbackup av varje **produktionspublicering som Vercel rapporterar READY** via
[`src/lib/github/sites-backup.ts`](../../src/lib/github/sites-backup.ts)
(`after()`, aldrig blockerande) till repot `site-<projectId>` i organisationen,
och portalen visar tidpunkten. Utan env händer ingenting. Kvarvarande steg står sist.

## Varför en organisation och en GitHub App

| Alternativ | Problem |
|---|---|
| Jakobs privata konto + personlig token | En nyckel med full åtkomst till allt, knuten till en person, utan utgång. Kundkod blandas med plattformskod. |
| Kundens eget GitHub via OAuth (finns idag) | Småföretag har sällan GitHub. Vi ber dessutom om `repo`-scope på alla deras privata repon. |
| **Egen org + GitHub App** | Nycklar som gäller 1 timme, bara de rättigheter vi anger, bara installerad i vår org. Kundrepon isolerade från plattformen. Gratis. |

## Två organisationer, inte en

| Org | Innehåll | Varför separat |
|---|---|---|
| `sajtmaskin` (senare) | Plattformskoden (`sajtmaskin`-repot flyttas hit när Vercel-koppling, rulesets och secrets är inventerade) | Åtkomst för utvecklare och agenter |
| `sajtmaskin-sites` | Ett repo per kundsajt, privata | GitHub App installeras **bara** här; en läckt token når aldrig plattformskoden |

Namnen är förslag. Byt inte efter att repon skapats: `GITHUB_SITES_ORG` och
alla `html_url` i databasen pekar på login-namnet.

## Steg (gratis-nivån räcker)

1. **Skapa org** `sajtmaskin-sites` på github.com → *New organization* → Free.
   Ägare: Jakobs konto. Slå på 2FA-krav under *Settings → Authentication security*.
2. **Skapa GitHub App** under org-inställningar → *Developer settings → GitHub
   Apps → New GitHub App*:
   - Namn: `Sajtmaskin Sites`. Homepage: `https://sajtmaskin.se`.
   - Webhook: **av** (vi pollar inte, vi skriver).
   - *Repository permissions*: **Contents: Read and write**, **Administration:
     Read and write** (för att skapa repon), **Metadata: Read** (automatiskt).
   - *Where can this app be installed*: **Only on this account**.
3. **Generera privat nyckel** på App-sidan → *Private keys → Generate*. Ladda
   ner `.pem`. Det är `GITHUB_APP_PRIVATE_KEY`. App-id står högst upp på sidan
   (`GITHUB_APP_ID`).
4. **Installera appen** på org:en → *Install App → sajtmaskin-sites → All
   repositories*. Installation-id står sist i URL:en
   (`/settings/installations/<id>`) = `GITHUB_APP_INSTALLATION_ID`.
5. **Lägg env i Vercel** (Preview + Production, inte Development):
   `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_SITES_ORG=sajtmaskin-sites`
   som läsbara; `GITHUB_APP_PRIVATE_KEY` som *Sensitive*. Klistra PEM:en med
   radbrytningar; klienten accepterar även `\n`-escapad enrad.
6. **Verifiera** lokalt utan att skriva något:
   ```bash
   node --import tsx -e "import('./src/lib/github/app-installation-token.ts').then(async m => { const c = m.createInstallationTokenClient({ appId: process.env.GITHUB_APP_ID, privateKey: process.env.GITHUB_APP_PRIVATE_KEY, installationId: process.env.GITHUB_APP_INSTALLATION_ID }); const t = await c.getToken(); console.log('ok, expires', t.expiresAt); })"
   ```
   Skriv aldrig ut `t.token`.

## Gränser att känna till

| Gräns | Värde | Konsekvens för oss |
|---|---|---|
| Primär rate limit, installation-token | 5 000 anrop/timme (växer med repon, max 12 500) | Räcker för hundratals publiceringar/timme |
| Sekundär: "content-generating requests" | 80/minut, 500/timme | Dagens export gör ett blob-anrop **per fil**. En sajt är 30–60 filer → ca 8 sajter/timme. Backup-vägen måste använda `content` inline i tree-anropet (1 anrop) och blobs bara för binärer. |
| Reponamn | unikt per org, max 100 tecken | Använd `site-<projectId>`; aldrig kundnamn (kan kollidera och läcka). |
| Privata repon på Free | obegränsat | — |

Källor: GitHubs rate-limit-dokumentation (`docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api`).

## Byggt i kod

| Del | Fil |
|---|---|
| Git-Data-export med `textTransport: "inline"` (ett tree-anrop för all text, blobs bara för binärer). Flyttad gren (422 "not a fast forward") byggs om på nya headen, max 3 försök, aldrig force | [`src/lib/github/git-data-export.ts`](../../src/lib/github/git-data-export.ts) |
| Backup = exakt de filer som skickades till Vercel (secrets strippade) → `site-<projectId>`, resultat i `project_data.meta.githubBackup` | [`src/lib/github/sites-backup.ts`](../../src/lib/github/sites-backup.ts) |
| Hook efter `deploymentDelivered = true`, `after()`, bara `target=production`, väntar på READY (max 180 s, annars hoppas backupen över och loggas) | `src/app/api/v0/deployments/_route/post.ts`, [`wait-for-deployment-ready.ts`](../../src/lib/vercel/wait-for-deployment-ready.ts) |
| Portal: "Sajtmaskin tog en säkerhetskopia av koden …" | `src/app/projects/[id]/page.tsx` via `site-overview.ts` |

Ordning vid samtidiga publiceringar: den som blir READY sist committar sist.
`meta.githubBackup.versionId` anger vilken version repots head motsvarar.

## Kvar (ej byggt)

1. Första riktiga körning mot org:en på preview med en testsajt; verifiera repo,
   seed-commit för tomt repo, att en andra publicering ger ett inkrementellt
   commit, att en misslyckad build inte ger någon backup, och två publiceringar
   tätt efter varandra (retry-vägen).
2. Överlämning: `POST /repos/{org}/{repo}/transfer` till kundens GitHub-användare
   när kunden ber om det (manuell knapp i backoffice först).
3. Integritetspolicy: lägg till GitHub (USA) som underbiträde för kodbackup.
4. Flytt av plattformsrepot `sajtmaskin` till en egen org (egen PR: Vercel-koppling,
   rulesets, secrets, Dependabot, `OC_REPO_SLUG`).
