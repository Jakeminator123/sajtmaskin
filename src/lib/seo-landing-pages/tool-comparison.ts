/**
 * Brand comparison facts for /hemsideprogram and /wordpress-alternativ.
 * Sajtmaskin-belopp ägs av /priser. Inga konkurrentkronor — de ändras.
 */

export const TOOL_COMPARISON_COLUMNS = [
  "Sajtmaskin",
  "WordPress",
  "Wix",
  "Squarespace",
] as const;

export type ToolComparisonColumn = (typeof TOOL_COMPARISON_COLUMNS)[number];

export type ToolComparisonRow = {
  criterion: string;
  cells: Record<ToolComparisonColumn, string>;
};

export const TOOL_COMPARISON_UPDATED_LABEL = "oktober 2026";

export const TOOL_COMPARISON_LEAD =
  "Samma behov, olika arbetssätt. Sajtmaskin-raderna är stämda mot produkten här. Övriga rader är offentliga modeller — inte en ranking och inte deras aktuella prislappar.";

export const TOOL_COMPARISON_FOOTNOTE_BEFORE_PRICE =
  "Sajtmaskin är i beta. Credits är engångsköp och går inte ut; första slutförda genereringen kan ske utan kort. Aktuella paket finns på";

export const TOOL_COMPARISON_FOOTNOTE_AFTER_PRICE =
  "WordPress-, Wix- och Squarespace-belopp publiceras inte här.";

export const TOOL_COMPARISON_ROWS: readonly ToolComparisonRow[] = [
  {
    criterion: "Arbetssätt",
    cells: {
      Sajtmaskin: "Beskriv verksamheten, granska ett utkast, ändra med följdtext.",
      WordPress: "CMS: teman, plugins och redaktörsflöden. Starkt ekosystem.",
      Wix: "Visuell canvas. Dra, släpp och justera. AI kan starta, ni fortsätter i editorn.",
      Squarespace: "Välj mall och finslipa visuellt i deras editor.",
    },
  },
  {
    criterion: "Betalmodell",
    cells: {
      Sajtmaskin: "Credits som engångsköp, utan prenumeration. Publicering debiterar credits.",
      WordPress:
        "wordpress.org är fri programvara; ni betalar hosting själva. WordPress.com säljer hostade planer.",
      Wix: "Gratisplan plus betalda Premium-prenumerationer. Belopp bara hos Wix.",
      Squarespace: "Prenumeration för att hålla sajten i deras miljö. Belopp bara hos dem.",
    },
  },
  {
    criterion: "Start",
    cells: {
      Sajtmaskin: "Svenskt gränssnitt. Ett konto får en första slutförd generering utan kort.",
      WordPress: "Installation hos en host, eller konto på WordPress.com.",
      Wix: "Konto. Gratis att skapa; egen domän och att ta bort deras märkning hör till betalda planer.",
      Squarespace: "Konto och mall. Egen domän hör typiskt till betalda planer.",
    },
  },
  {
    criterion: "Vad ni får",
    cells: {
      Sajtmaskin: "Utkast i riktig Next.js- och React-kod. Första bygget har taket tre sidor.",
      WordPress: "En CMS-sajt ni (eller en byrå) underhåller. WooCommerce när ni behöver butik.",
      Wix: "Sajten i deras editor och hosting, plus inbyggda appar i samma ekosystem.",
      Squarespace: "Sajten i deras mall och hosting. Starkt när look-and-feel är poängen.",
    },
  },
  {
    criterion: "Domän och SSL",
    cells: {
      Sajtmaskin:
        "Egen domän kan kopplas med HTTPS. Utan egen adress blir det en Vercel-URL. Koppling kan vara stängd i vissa miljöer.",
      WordPress: "Egen domän via er host eller WordPress.com, enligt deras planer.",
      Wix: "Wix-adress på gratisplanen. Egen domän på betalda planer.",
      Squarespace: "Sajten hostas hos dem. Egen domän typiskt på betalda planer.",
    },
  },
  {
    criterion: "Exit",
    cells: {
      Sajtmaskin: "Inloggad ägare kan exportera koden som ZIP eller till GitHub — inte databas, nycklar eller domän.",
      WordPress: "Självhostat: ni äger filerna. En flytt är ändå ett projekt.",
      Wix: "Sajten lever i deras editor. Räkna inte med en komplett export av hela affären.",
      Squarespace: "Innehåll kan ofta exporteras enligt deras docs. Inte en körklar kopia utanför plattformen.",
    },
  },
];
