export type NavLink = {
  href: string;
  label: string;
};

export type MenuItem = {
  name: string;
  description: string;
  price: string;
  allergens?: string;
};

export type MenuCategory = {
  title: string;
  description: string;
  items: MenuItem[];
};

export const siteConfig = {
  name: "Sjöstaden Bistro",
  shortDescription:
    "Modern skandinavisk mat med lokala råvaror, serverad i en mörk och elegant bistro vid vattnet i Malmö.",
  longDescription:
    "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Hos oss möts säsongens smaker, varm service och en miljö som passar lika bra för lunch, middag och catering.",
  phone: "040-123 45 67",
  email: "hej@sjostadenbistro.se",
  bookingEmail: "bokning@sjostadenbistro.se",
  address: "Dockplatsen 8, 211 19 Malmö",
  city: "Malmö",
  navLinks: [
    { href: "/", label: "Hem" },
    { href: "/om-oss", label: "Om oss" },
    { href: "/meny", label: "Meny" },
    { href: "/boka", label: "Boka bord" },
    { href: "/kontakt", label: "Kontakt" },
  ] satisfies NavLink[],
  openingHours: [
    { day: "Mån–Fre", time: "11–22" },
    { day: "Lör–Sön", time: "12–23" },
  ],
  socialLinks: [
    { label: "Instagram", href: "https://instagram.com" },
    { label: "Facebook", href: "https://facebook.com" },
    { label: "YouTube", href: "https://youtube.com" },
  ],
};

export const menuHighlights = [
  {
    name: "Gravad röding med dillolja",
    description:
      "Serveras med krispig fänkål, picklade äpplen och en sval crème på syrad grädde. En lätt men uttrycksfull start på kvällen.",
    price: "165 kr",
    image:
      "https://images.unsplash.com/photo-1551239953-51cf8954aa5e?w=400&h=300&fit=crop&q=80",
    alt: "Gravad röding med dillolja, fänkål och picklade äpplen på en elegant tallrik",
  },
  {
    name: "Smörbakad torskrygg",
    description:
      "Med variation på jordärtskocka, brynt smör och forellrom. En signaturrätt där hav och skånsk jord möts på tallriken.",
    price: "325 kr",
    image:
      "https://images.unsplash.com/photo-1739963092887-845edfdbdd57?w=400&h=300&fit=crop&q=80",
    alt: "Smörbakad torskrygg med jordärtskocka, brynt smör och forellrom",
  },
  {
    name: "Hjortinnanlår från Söderslätt",
    description:
      "Serveras med rostad selleri, svampsky och lingon. En djup och varm rätt för den som vill ha nordiska smaker med tydlig karaktär.",
    price: "345 kr",
    image:
      "https://images.unsplash.com/photo-1621317607972-b2afed231542?w=400&h=300&fit=crop&q=80",
    alt: "Hjortinnanlår med rostad selleri, svampsky och lingon",
  },
  {
    name: "Kärnmjölkspannacotta",
    description:
      "Med havtorn, vit choklad och mandelkaka. Frisk syra och mjuk sötma avslutar måltiden på ett balanserat sätt.",
    price: "125 kr",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop&q=80",
    alt: "Kärnmjölkspannacotta med havtorn, vit choklad och mandelkaka",
  },
];

export const testimonials = [
  {
    quote:
      "Vi bokade en kundmiddag för tolv personer och hela kvällen höll hög nivå. Maten var genomtänkt, servicen närvarande och lokalen hade precis den elegans vi sökte.",
    name: "Karin Mårtensson",
    role: "Kontorschef, Öresund Advisory",
  },
  {
    quote:
      "Lunchmenyn känns lika omsorgsfull som kvällsserveringen. Det märks att råvarorna väljs med omtanke och att köket vågar hålla smakerna rena och tydliga.",
    name: "Joel Lindgren",
    role: "Frilansskribent, Malmö",
  },
  {
    quote:
      "Sjöstaden Bistro ordnade catering till vårt vernissage och allt från leverans till uppläggning fungerade sömlöst. Gästerna pratade om maten hela kvällen.",
    name: "Emma Holm",
    role: "Projektledare, Form/Design Center",
  },
];

export const teamMembers = [
  {
    name: "Sanna Berg",
    role: "Kökschef",
    bio: "Sanna leder köket med ett tydligt fokus på skånska råvaror, precisa smaker och ett hantverk där varje detalj får ta plats utan att bli överarbetad.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop&q=80",
    alt: "Kökschef i mörk skandinavisk restaurangmiljö",
  },
  {
    name: "Oskar Nilsson",
    role: "Restaurangchef",
    bio: "Oskar ansvarar för matsalens rytm och gästupplevelse. Hans filosofi är enkel: varm service, god timing och ett värdskap som känns personligt.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop&q=80",
    alt: "Restaurangchef i elegant bistro med vinflaskor och levande ljus",
  },
  {
    name: "Farah Dahl",
    role: "Sommelier och dryckesansvarig",
    bio: "Farah bygger dryckeslistan kring små producenter, nordiska toner och kombinationer som lyfter maten utan att ta över upplevelsen.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop&q=80",
    alt: "Sommelier i lyxig bistro med glas och varm belysning",
  },
];

export const values = [
  {
    title: "Lokalt förankrat",
    description:
      "Vi arbetar nära odlare, fiskhandlare och producenter i Skåne för att ge råvarorna kortare väg till köket. Det ger bättre smak, starkare relationer och större respekt för säsongen.",
  },
  {
    title: "Lugnt och precist",
    description:
      "Vår matlagning bygger på tydliga smaker, rena upplägg och ett lugnt hantverk. Vi vill att varje tallrik ska kännas genomtänkt, men aldrig stel.",
  },
  {
    title: "Gästupplevelse i centrum",
    description:
      "En kväll hos oss ska kännas varm, avslappnad och minnesvärd. Därför lägger vi lika stor vikt vid bemötande, ljus, musik och tempo som vid maten på tallriken.",
  },
];

export const menuCategories: MenuCategory[] = [
  {
    title: "Förrätter",
    description:
      "Mindre rätter som öppnar måltiden med rena smaker, syra och tydlig nordisk karaktär.",
    items: [
      {
        name: "Råbiff på hängmörad svensk ryggbiff",
        description:
          "Med bakad lök, syrad grädde, krispig potatis och senapsfrön.",
        price: "175 kr",
        allergens: "Mjölk, senap",
      },
      {
        name: "Gravad röding med dillolja",
        description:
          "Fänkål, picklade äpplen och gurka med lätt sälta från havet.",
        price: "165 kr",
        allergens: "Fisk, mjölk",
      },
      {
        name: "Rostad jordärtskocka",
        description:
          "Med svampbuljong, hasselnötter och lagrad ost från Skåne.",
        price: "155 kr",
        allergens: "Mjölk, nötter",
      },
    ],
  },
  {
    title: "Varmrätter",
    description:
      "Säsongsbetonade huvudrätter med lokala råvaror, djup smak och modern skandinavisk känsla.",
    items: [
      {
        name: "Smörbakad torskrygg",
        description:
          "Variation på jordärtskocka, brynt smör och forellrom.",
        price: "325 kr",
        allergens: "Fisk, mjölk",
      },
      {
        name: "Hjortinnanlår från Söderslätt",
        description:
          "Rostad selleri, svampsky, lingon och karamelliserad schalottenlök.",
        price: "345 kr",
        allergens: "Selleri",
      },
      {
        name: "Bakad rotselleri med kornrisotto",
        description:
          "Ramslök, äppelmust och rostad pumpakärna för en fyllig vegetarisk rätt.",
        price: "265 kr",
        allergens: "Gluten, selleri",
      },
    ],
  },
  {
    title: "Desserter",
    description:
      "Avslut med balanserad sötma, frisk syra och klassiska svenska smaker i ny tolkning.",
    items: [
      {
        name: "Kärnmjölkspannacotta",
        description:
          "Havtorn, mandelkaka och vit choklad med lätt sälta.",
        price: "125 kr",
        allergens: "Mjölk, mandel, ägg",
      },
      {
        name: "Äppeltarte med vaniljkräm",
        description:
          "Serveras ljummen med brynt smörglass och kanelrostad havre.",
        price: "135 kr",
        allergens: "Gluten, mjölk, ägg",
      },
      {
        name: "Mörk chokladmousse",
        description:
          "Med körsbär, salt karamell och krisp på råg.",
        price: "135 kr",
        allergens: "Gluten, mjölk, ägg",
      },
    ],
  },
  {
    title: "Drycker",
    description:
      "Ett urval av noga utvalda viner, alkoholfria pairing-alternativ och klassiska aperitifer.",
    items: [
      {
        name: "Husets vita glas",
        description:
          "Frisk och mineraldriven chardonnay från liten producent.",
        price: "125 kr",
        allergens: "Sulfiter",
      },
      {
        name: "Husets röda glas",
        description:
          "Mjuk pinot noir med bärighet och lätt kryddighet.",
        price: "135 kr",
        allergens: "Sulfiter",
      },
      {
        name: "Alkoholfri dryckesmatchning",
        description:
          "Tre serveringar med fermenterade och pressade smaker.",
        price: "145 kr",
      },
    ],
  },
];

export const lunchMenu = [
  {
    name: "Dagens fisk",
    description:
      "Serveras med potatispuré, grillad citron och örter från lokala odlare.",
    price: "165 kr",
  },
  {
    name: "Långbakad högrev",
    description:
      "Med rostad lök, sky och smörslungade rotfrukter.",
    price: "175 kr",
  },
  {
    name: "Veckans gröna",
    description:
      "Bakad blomkål med linser, brynt smör och krispiga frön.",
    price: "155 kr",
  },
];

export const bookingBenefits = [
  {
    title: "Lunch och middag",
    description:
      "Boka ett snabbt lunchbesök, en lång middag eller en kväll för två i vår lugna matsal vid vattnet.",
  },
  {
    title: "Större sällskap",
    description:
      "Vi tar gärna emot födelsedagar, affärsmiddagar och privata sällskap med anpassat upplägg och menyförslag.",
  },
  {
    title: "Catering efter behov",
    description:
      "Från mindre leveranser till fullservice för lanseringar, vernissage och företagsevent i Malmöområdet.",
  },
];