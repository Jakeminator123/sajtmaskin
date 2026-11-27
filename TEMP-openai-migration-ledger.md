# Modellbyte i Sajtmaskin, 27 november 2026

Jakob godkände ett modellbyte i appen med befintliga nycklar. Byggprofiler, kundkrediter och leverantörsintegrationer behåller sina befintliga kontrakt. Modell-ID:n och arbetsspecifik effort ägs av `config/ai_models/manifest.json`.

| Arbetsuppgift | Beslut |
| --- | --- |
| Bygg, uppföljning, fixer, verifier och Deep Brief | GPT-6.2 Sol med befintlig effort per fas. Ultra planerar och genererar med GPT-6.2 Astra på high. |
| Inspektör, avsiktsklassificering, domänförslag, shadcn-sökning och rankning, wizardguide och promptomskrivning | GPT-6.2 Sol på low. |
| Övrig analys och strukturerad text | GPT-6.2 Sol med befintlig effort, svarsschema och reservvägar. |
| Presentationens bildrutor, scaffoldpersonans referensbild och livegranskningens skärmbilder | GPT-6.1 Terra på medium. Visionlistan tillåter även GPT-6.2 Sol. |
| Sparade val och fakturering | Historiska Sol- och Astra-ID:n kan läsas. Tidigare Luna-val i Deep Brief översätts till Sol. Nya prisrader skiljer cacheträff, cacheskrivning och lång kontext från äldre modellers priser. |

Appen använder Vercel AI SDK med OpenAI Responses för byggmotorn samt befintliga direkta OpenAI-anrop för vissa verktyg. Bytet kräver inga ändringar i streaming, WebSocket-transport, tillstånd, komprimering, maxutdata, prompts, verktyg, lagring, region, cachepolicy eller behandlingstjänst. Nuvarande lagringsvillkor och eventuell Zero Data Retention är inte verifierade här. Lokal verifiering använder mockade transportsvar. Hastighet och kvalitetsutfall i produktion återstår att mäta.

Verifierat lokalt med modellmetadata från befintlig nyckel, 590 riktade modelltester och 53 riktade backofficeprov. Den oberoende granskningen hittade att strömmens verktygssteg summerades inför långkontextprissättningen och att inspektören tappade rapporterade cacheskrivningar. Den nya strömmen bokför varje leverantörsanrop separat och skickar fortfarande den samlade tokenmängden till klienten. Prisuppgifter för redan bokförda anrop ligger kvar i respektive historisk post.

[OpenAI:s modellkatalog](https://developers.openai.com/api/docs/models) · [Standardpriser](https://developers.openai.com/api/docs/pricing) · [Resonemang](https://developers.openai.com/api/docs/guides/reasoning)
