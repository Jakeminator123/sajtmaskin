# V0 Platform sunset — audit (implementation status)

**Syfte:** Spåra borttagning av V0 Platform API (`v0-sdk`, `V0_API_KEY`, `v0.chats.*`) till förmån för own-engine + Postgres.

**HTTP `/api/v0/`** = Sajtmaskins API-version; implementation ska vara engine-baserad där möjligt.

| Område | Status | Notering |
|--------|--------|----------|
| `GET /api/v0/chats/[chatId]` | Engine + legacy DB-mappning; V0 `getById` borttagen | |
| `GET .../versions` | Engine + legacy DB; V0 lookup borttagen | |
| `GET .../messages/[messageId]` | Engine-meddelanden från DB | |
| `GET/POST /api/download` | ZIP från `engine_versions.files_json` (`engine-version-zip.ts`) | Klart |
| `POST /api/github/export` | Engine-chat: filer från `files_json`; annars legacy V0 `getVersion` | Delvis |
| Vercel `v0.integrations` route | **501** | Klart |
| Projekt env (icke-app) | **410** | Klart |
| Projekt instructions | Ingen V0 `projects.update` | Klart |
| Builder preview `vusercontent` prioritet | Borttagen (`v0-preview-priority.ts` bort) | Klart |
| `POST /api/v0/chats/init` | Kan fortfarande anropa V0 `init` för äldre mallflöden — migrera till own-engine | Teknisk skuld |
| `POST /api/template` | `generateFromTemplate` (V0) — migrera | Teknisk skuld |
| `v0-sdk` i `package.json` | Kvar tills init/template rensats | |
| `src/lib/v0.ts` | Kvar medan beroenden finns | |

Uppdatera tabellen när rader tas bort.
