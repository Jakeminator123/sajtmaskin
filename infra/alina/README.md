# Alinas talserver

Sajtens befintliga OpenClaw tar emot frågan och lämnar svarstexten. Alinas talserver tar emot repliken, håller kön, beställer Sannas ljud från ElevenLabs och lagrar inspelningen. Munbildsläget spelar tidskoderna i webbläsaren. I MuseTalk-läget skickar talservern ljud och ansiktsbild till den delade RunPod-GPU:n och sätter sedan ihop videon. Tio minuters vila är standard.

## Lokalt

Starta `npm run alina:studio` och öppna [regissörsvyn](http://127.0.0.1:5814/admin). Om du öppnar scenens HTML-fil från disken får du en länk till webbservern. `npm run alina:chat` startar OpenClaws isolerade testgateway och [Alinas lokala chatt](http://127.0.0.1:3000/alina/chatt). Testgatewayen använder den lokala RunPod-modellanslutningen. Sajten använder sin redan konfigurerade gateway.

Avstängningen **Aktivera Alina i chatten** stoppar automatiska taljobb och GPU-aktivitet från chatten. Regissörsvyns uttryckliga talprov kan fortfarande köras och omfattas av budgetgränserna. Via sajten kräver sådana prov administratörsåtkomst.

## Nätprov på RunPod

1. Leverera Alinas Next-sidor, API och scenklipp till en skyddad preview. Behåll sajtens befintliga OpenClaw-konfiguration.
2. Bygg talserverns CPU-image från reporoten med `docker build -f infra/alina/Dockerfile -t alina-studio .`. Publicera den granskade imagen i avsett register och använd den låsta digesten på en CPU-podd. Byggkontexten filtreras av `infra/alina/Dockerfile.dockerignore`.
3. Montera en beständig volym på `/workspace`. Kör en enda talserver mot SQLite-filen. Exponera port `8000/http`. Ge podden `RUNPOD_API_KEY`, `ELEVENLABS_API_KEY` och en separat slumpmässig `ALINA_BRIDGE_TOKEN` på 32–128 URL-säkra tecken. `OPENAI_API_KEY` är frivillig och används endast av studions uttryckliga OpenAI-prov.
4. Sätt `ALINA_STUDIO_URL` till poddens HTTPS-origin i preview och sätt samma `ALINA_BRIDGE_TOKEN` där. Webbappen kontrollerar admininloggningen. Talservern exponerar bara `/healthz` utan bryggnyckeln. Volymen innehåller kö, inspelningar, budgetbok och uppgifter för att städa avbrutna GPU-jobb.
5. Prova en egen replik i båda lägena och öppna chatten från mobilen medan utvecklingsdatorn är avstängd. Kontrollera privat medieåtkomst och att GPU-podden avslutas efter vila. Ändra produktionspekaren först efter godkänt nätprov.

## Drift och krediter

Nödbromsen är **200 USD per kalendermånad i UTC**. Den stoppar nya reservationer för ElevenLabs och RunPod-jobb i denna instans, inklusive den lokala gatewayens RunPod-modellanrop. Färdiga klipp kan fortsätta spela. `ALINA_MONTHLY_STOP_USD=0` pausar ny förbrukning. Budgetboken redovisar uppskattningar. Bokför CPU-poddens löpande kostnad och sajtgatewayens modell separat vid driftkalkylen. Vid flytt, för över månadens reservationer eller fördela återstående utrymme mellan instanser innan de får ta betalda jobb samtidigt.

Öppna **Drift och krediter** i regissörsvyn. RunPod visar sitt kontosaldo och ElevenLabs visar paketets inkluderade krediter när nyckeln har `user_read`. Röstsyntes har en egen behörighet. OpenClaw-raden kontrollerar sajtens gateway. Fakturor för gatewayens drift finns hos Render. Det separata OpenAI-provet skickar en fast kort text med studions nyckel och visar om just det modellanropet lyckades. Exakt OpenAI-saldo hanteras i leverantörens konto.
