# Samma repo på flera datorer

Git innehåller kod, Node-pinne, projektidentitet och agentregler. Inloggningar,
hemligheter och lokala sökvägar skapas på varje dator. Windows-användarnamnet
behöver inte vara samma. Kontot måste ha åtkomst till samma projekt/team.

## Ny dator

1. Installera Git, GitHub CLI och Volta. Logga in i GitHub med `gh auth login`
   och använd en egen SSH-nyckel på datorn (eller HTTPS-remote).
2. Klona `Jakeminator123/sajtmaskin`, välj `preview` och kör `npm ci` i repo-roten.
   Volta väljer versionen i `package.json`. Kontrollera `node -p process.version`.
3. Kör `npm run setup:local`. Kommandot verifierar origin och Node, skapar
   saknade lokala Vercel-/Cursor-filer och installerar repoets hooks. Det
   bevarar befintliga filer och stoppar om Vercel pekar på ett annat projekt.
   Saknad `.env.local` rapporteras med nästa steg och exitkod 1.
4. Logga in med `npx --yes vercel@58 login`. Kör `npm run env:pull`.
   Endast **Development** hämtas från projekt/team i
   `config/local-development.json`. Alla konfigurerade databas-URL:er måste
   matcha DEV i `config/db-targets.json` innan `.env.local` ersätts.
   Tidigare lokala värden sparas i den ignorerade `.env-backups/`.
5. Återför eventuella egna utvecklingsnycklar/inställningar selektivt till
   `.env.local`, kör `npm run setup:local -- --check`, sedan `npm run dev`.

Kommandot visar bara nycklarnas närvaro. Det bevisar inte att en API-nyckel
är giltig eller att alla leverantörer fungerar. En särskild lokal OpenAI-nyckel
kan sättas som `OPENAI_API_KEY` i `.env.local`; en senare env-pull ersätter den
med Vercels Development-värde och sparar den gamla filen i backupen.
Publicera aldrig verkliga nycklar i Git eller chatt.

## Minsta uppsättning anslutningar

| Tjänst | När den behövs |
|---|---|
| GitHub | Kod, issues och PR:ar. CLI/SSH eller ansluten GitHub-plugin. |
| Vercel | Development-env, appens deployer och loggar. Ett projektavgränsat MCP räcker. |
| Render | Drift av `openclaw-sajtagenten`; ansluten plugin eller separat inloggning vid driftarbete. Krävs inte för att starta Next lokalt. |
| Supabase MCP | Valfritt vid databasfelsökning. Appen använder DB-URL från Development utan MCP-inloggning. |

Standardmallen för Cursor/Claude har projektets Vercel, shadcn och publika
dokumentationsservrar. Supabase DEV/PROD, kontobred Vercel och legacy v0 finns
i `.cursor/mcp.optional.json.example`; kopiera bara behövda serverposter till
lokal konfiguration. Supabase ska behålla `read_only=true` och rätt project ref.
I Codex är samma extra servrar deklarerade med `enabled = false`; aktivera dem
uttryckligen när uppgiften kräver det. Appens plugin-inloggningar är separata
från repoets MCP-konfiguration och CLI-inloggning.

Render-tjänstens och Vercel-projektets publika identiteter står i
`config/local-development.json`. Ändra dem bara efter verifierad flytt av
projektet. De är gemensamma projekt-ID:n, inte datorns användar-ID.

## Byte av dator och räddat arbete

- Synka via GitHub. Commit/pusha en egen arbetsgren innan datorbyte; hämta den
  på nästa dator. Dela inte `.git`, `node_modules` eller arbetsmappen via molnsynk.
- Börja på aktuell `preview`; `master` är produktion och uppdateras separat.
- `npm run handoff:list` visar bara denna dators kö. Publicera överlämningar
  som ska följa datorbytet i repoets issue/PR enligt handoff-runbooken.
- Kontrollera gamla lokala brancher och Git-bundles före radering. En tom
  diff/status-fil bevisar inte att alla lokala brancher har pushats.
- Kopiera inte hela `~/.codex/config.toml`, privata SSH-nycklar eller gamla
  miljöfiler över den nya datorns konfiguration.
