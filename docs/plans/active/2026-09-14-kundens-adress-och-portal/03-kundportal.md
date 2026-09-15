# 03 — Kundportal

Föreslagen riktning: [N3](00-master-plan.md).

## Första användbara versionen

`/projects/[id]` blir sajtens hem. Kunden ser sin adress och status, kan öppna
redigeraren, publicera, koppla domän och exportera. `/konto` samlar konto,
credits, köphistorik och senare sajt-abonnemang.

Återanvänd `DomainManager`, `SeoOptInPanel`, `resolveLiveUrl`, exportvägen och
befintliga publicerings-API:er. Buildern får använda samma funktioner. Inför
ingen ny parallell datamodell för projekt eller publiceringsstatus.

## Vad DNS-hantering betyder här

Portalen hanterar kopplingen mellan webbplats och värdnamn: primäradress,
webb-DNS-poster, verifiering, HTTPS-status och koppla loss. Den är inte i MVP
en fullständig DNS-editor för valfri registrar. MX, e-post, SPF/DKIM/DMARC och
andra tjänsters TXT-poster ska lämnas ifred.

Manuell instruktion och kopieringsknappar är alltid tillgängliga. Automatisk
koppling, exempelvis via Entri, kan läggas ovanpå när leverantör, åtkomst och
kostnad är klarlagda. Ingen knapp får utlova automatisk ändring innan den fungerar.

## Aktiviteter

| Ref | Leverans | Beroende |
|---|---|---|
| [C1](aktiviteter/C1-sajtvy.md) | Sajtvy och bättre projektkort | Kan börja direkt efter planbeslut |
| [C2](aktiviteter/C2-domanflode.md) | BYOD, primäradress och DNS-status | C1 och A3:s adresskontrakt |
| [B1](aktiviteter/B1-exportkontrakt.md) | Export och äganderättsbesked | C1 |
| [C3](aktiviteter/C3-kontosida.md) | Konto, credits och fakturering | Första delen efter C1; abonnemang efter D2 |

## Grundkrav

Auth är egen JWT, inte Supabase Auth. Skydda dynamiska projektrouter i
`src/proxy.ts` och gör ägarkontroll på servern för varje läsning och mutation.
En gömd knapp eller en route-grind ersätter inte projektkontrollen. Kundytan
ska inte använda admin-komponenter som antar åtkomst till driftdata.

Kunden ska kunna arbeta med sin sajt utan kunskap om Vercel, projekt-ID:n eller
registrar-API:er. Visa begripliga tillstånd: väntar på DNS, kontrollerar HTTPS,
ansluten, problem och pausad. Teknisk detalj kan finnas under hjälp.

Teamroller, komplett DNS-editor och besöksanalys ingår inte.
