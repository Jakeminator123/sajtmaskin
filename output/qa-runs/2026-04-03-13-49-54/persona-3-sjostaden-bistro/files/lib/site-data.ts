import type { Metadata } from "next";

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

export type DishHighlight = {
  name: string;
  description: string;
  price: string;
  image: string;
  alt: string;
};

export type Testimonial = {
  name: string;
  role: string;
  company: string;
  quote: string;
};

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
};

export type ValueItem = {
  title: string;
  description: string;
};

export type MenuItem = {
  name: string;
  description: string;
  price: string;
};

export type MenuCategory = {
  id: string;
  title: string;
  description: string;
  items: MenuItem[];
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type OpeningHour = {
  label: string;
  hours: string;
};

export type SocialLink = {
  label: string;
  href: string;
  handle: string;
};

export const siteConfig = {
  name: "Sjöstaden Bistro",
  shortDescription: "Modern skandinavisk mat med lokala råvaror, lunch, à la carte och catering.",
  description:
    "Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror. Boka bord online eller kontakta oss för catering och event.",
  url: "https://www.sjostadenbistro.se",
  phone: "070-123 45 67",
  email: "boka@sjostadenbistro.se",
  addressLine: "Storgatan 12",
  postalCity: "411 38 Göteborg",
  fullAddress: "Storgatan 12, 411 38 Göteborg",
};

export const seoKeywords: string[] = [
  "Sjöstaden Bistro",
  "restaurang Malmö",
  "modern skandinavisk mat",
  "lokala råvaror",
  "lunch Malmö",
  "à la carte Malmö",
  "catering Malmö",
  "boka bord Malmö",
  "bistro Malmö",
  "skandinavisk restaurang",
];

export const navigation: NavItem[] = [
  {
    href: "/",
    label: "Hem",
    description: "Första intrycket, favoriträtter och kontaktvägar.",
  },
  {
    href: "/om-oss",
    label: "Om oss",
    description: "Historien, teamet och hur vi arbetar.",
  },
  {
    href: "/meny",
    label: "Meny",
    description: "Säsongsrätter, priser och allergeninformation.",
  },
  {
    href: "/boka",
    label: "Boka tid",
    description: "Skicka en bokningsförfrågan online.",
  },
  {
    href: "/kontakt",
    label: "Kontakt",
    description: "Direktkontakt, catering och öppettider.",
  },
];

export const popularDishes: DishHighlight[] = [
  {
    name: "Skånsk råraka",
    description: "Löjrom, syrad grädde och picklad rödlök på gyllenstekt potatis.",
    price: "165 kr",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop&q=80",
    alt: "Skånsk råraka med löjrom, syrad grädde och picklad rödlök i mörk bistromiljö",
  },
  {
    name: "Grillad röding",
    description: "Brynt smör, rostad blomkål och dill med tydlig nordisk elegans.",
    price: "295 kr",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop&q=80",
    alt: "Grillad röding med brynt smör, rostad blomkål och dill på mörk tallrik",
  },
  {
    name: "Långbakad oxkind",
    description: "Potatispuré, rödvinssky och svamp i en varm och djup rätt för kvällen.",
    price: "315 kr",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop&q=80",
    alt: "Långbakad oxkind med potatispuré, rödvinssky och svamp i varm belysning",
  },
  {
    name: "Havtornspannacotta",
    description: "Mandel, vit choklad och bär som rundar av middagen med frisk syra.",
    price: "125 kr",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop&q=80",
    alt: "Havtornspannacotta med mandel, vit choklad och bär på mörk bakgrund",
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Anna Sjöberg",
    role: "Projektledare",
    company: "Malmö",
    quote: "En av Malmös bästa middagar – perfekt balans mellan lyx och avslappnat.",
  },
  {
    name: "Johan Ek",
    role: "Vd",
    company: "Ek & Co",
    quote: "Lokala råvaror på riktigt. Servicen var varm och proffsig hela vägen.",
  },
  {
    name: "Sara Lind",
    role: "Eventansvarig",
    company: "Studio Norr",
    quote: "Cateringen lyfte vårt event. Smakerna och presentationen var toppklass.",
  },
];

export const teamMembers: TeamMember[] = [
  {
    name: "Elin Berg",
    role: "Kökschef",
    bio: "Elin har lång erfarenhet från nordiska restauranger och brinner för fisk, syrat och säsongsgrönt. Hon bygger rätter där varje komponent har en tydlig funktion.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&h=500&fit=crop&q=80",
    alt: "Kökschef i mörk restaurangmiljö med nordisk elegans och varma metalltoner",
  },
  {
    name: "Markus Dahl",
    role: "Restaurangchef",
    bio: "Markus skapar helheten i matsalen och ser till att varje besök blir personligt och smidigt, från bokning till sista kaffet.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&h=500&fit=crop&q=80",
    alt: "Restaurangchef i bistrointeriör med dämpad belysning och elegant servicekänsla",
  },
  {
    name: "Fatima Noor",
    role: "Sommelier",
    bio: "Fatima matchar vin och alkoholfritt med fokus på syra, struktur och nordisk elegans. Fråga gärna efter en rekommendation.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&h=500&fit=crop&q=80",
    alt: "Sommelier i mörk barhörna med vinflaskor och varm lyxig belysning",
  },
];

export const workValues: ValueItem[] = [
  {
    title: "Lokala råvaror",
    description: "Vi prioriterar producenter i regionen och väljer kvalitet före kvantitet. Varje råvara ska ha tydligt ursprung och rätt säsong.",
  },
  {
    title: "Säsongsbaserad meny",
    description: "Smakerna förändras över året och vi uppdaterar menyn löpande. Därför känns besöket levande oavsett om du kommer för lunch eller kvällsservering.",
  },
  {
    title: "Hantverk i varje detalj",
    description: "Fonder, såser och inläggningar görs från grunden. Det märks i både djupet på tallriken och i känslan runt bordet.",
  },
  {
    title: "Hållbarhet",
    description: "Vi planerar för att minska svinn och tar tillvara hela råvaran. Hållbarhet är inte ett tillägg hos oss utan en del av själva arbetssättet.",
  },
];

export const menuCategories: MenuCategory[] = [
  {
    id: "forratter",
    title: "Förrätter",
    description: "Mindre rätter med tydlig syra, krisp och djup – perfekta att dela eller börja kvällen med.",
    items: [
      {
        name: "Skånsk råraka",
        description: "Löjrom, syrad grädde och picklad rödlök.",
        price: "165 kr",
      },
      {
        name: "Råbiff på svenskt nötkött",
        description: "Senapskräm, friterad kapris och örtsallad.",
        price: "185 kr",
      },
      {
        name: "Rostad jordärtskocka",
        description: "Hasselnöt, brynt smör och lagrad ost.",
        price: "155 kr",
      },
    ],
  },
  {
    id: "varmratter",
    title: "Varmrätter",
    description: "Vårt kvällskök rör sig mellan kust, skog och marknad med rena smaker och omsorg om varje komponent.",
    items: [
      {
        name: "Grillad röding",
        description: "Brynt smör, rostad blomkål och dill.",
        price: "295 kr",
      },
      {
        name: "Långbakad oxkind",
        description: "Potatispuré, rödvinssky och svamp.",
        price: "315 kr",
      },
      {
        name: "Smörstekt kålrot",
        description: "Svampbuljong, grönkål och krispig lök.",
        price: "265 kr",
      },
    ],
  },
  {
    id: "desserter",
    title: "Desserter",
    description: "Avslut som håller samma balans mellan syra, sötma och textur som resten av menyn.",
    items: [
      {
        name: "Havtornspannacotta",
        description: "Mandel, vit choklad och bär.",
        price: "125 kr",
      },
      {
        name: "Chokladganache",
        description: "Havssalt, rapsolja och rostad bovete.",
        price: "135 kr",
      },
      {
        name: "Äppelkaka",
        description: "Vanilj, kanel och lättvispad grädde.",
        price: "115 kr",
      },
    ],
  },
  {
    id: "drycker",
    title: "Drycker",
    description: "Kort men genomtänkt dryckesutbud med fokus på matvänliga val och lokala inslag.",
    items: [
      {
        name: "Husets äppelmust",
        description: "Ofiltrerad och frisk, serveras väl kyld.",
        price: "55 kr",
      },
      {
        name: "Dagens glas rött eller vitt",
        description: "Utvalt för att passa kvällens meny.",
        price: "Från 125 kr",
      },
      {
        name: "Lokal lager",
        description: "Maltig, ren och lätt att matcha till både fisk och kött.",
        price: "79 kr",
      },
      {
        name: "Bryggkaffe eller te",
        description: "Mörkrost eller ett lugnt teavslut efter middagen.",
        price: "45 kr",
      },
    ],
  },
];

export const allergenFaq: FaqItem[] = [
  {
    question: "Vilka allergener hanterar ni i köket?",
    answer:
      "Vi hanterar gluten, mjölk, ägg, fisk, skaldjur, nötter och sesam i köket. Fråga gärna personalen om innehåll, tillagning och möjliga anpassningar när du bokar eller när du kommer till restaurangen.",
  },
  {
    question: "Hur fungerar anpassningar av rätter?",
    answer:
      "Meddela allergier vid bokning eller i restaurangen så guidar vi dig till säkra val. Vi gör alltid vårt bästa för att anpassa rätter, men observera att spår kan förekomma även vid anpassning.",
  },
  {
    question: "Vem kontaktar jag om jag vill vara helt säker innan besöket?",
    answer:
      "Skicka ett mejl till boka@sjostadenbistro.se eller ring 070-123 45 67 så hjälper vi dig. För större sällskap och catering går vi gärna igenom upplägget i förväg.",
  },
];

export const openingHours: OpeningHour[] = [
  {
    label: "Mån–Fre",
    hours: "11:00–22:00",
  },
  {
    label: "Lör–Sön",
    hours: "12:00–23:00",
  },
];

export const socialLinks: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/sjostadenbistro",
    handle: "@sjostadenbistro",
  },
  {
    label: "Facebook",
    href: "https://facebook.com/sjostadenbistro",
    handle: "Sjöstaden Bistro",
  },
];

export function createMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = new URL(path, siteConfig.url).toString();
  const fullTitle = `${title} | ${siteConfig.name}`;

  return {
    title,
    description,
    keywords: [...seoKeywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      locale: "sv_SE",
      type: "website",
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}