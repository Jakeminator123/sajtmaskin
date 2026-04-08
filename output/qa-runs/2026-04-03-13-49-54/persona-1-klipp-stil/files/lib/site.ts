import type { Metadata } from "next";

export const siteUrl = "https://www.klippochstil.se";
export const siteName = "Klipp & Stil";
export const siteTitle = "Klipp & Stil — Vi driver en frisörsalong som heter Klipp & Stil i Göteborg";
export const siteDescription =
  "Klipp & Stil är en varm frisörsalong i Göteborg med klippning, färgning, styling och skäggvård. Se priser, galleri och boka tid online.";
export const ogImage =
  "https://images.unsplash.com/photo-1626379499242-52863d313084?w=1200&h=630&fit=crop&q=80";

export const keywords: string[] = [
  "frisör Göteborg",
  "frisörsalong Göteborg",
  "klippning Göteborg",
  "färgning Göteborg",
  "slingor Göteborg",
  "hårstyling Göteborg",
  "skäggtrim Göteborg",
  "barberare Göteborg",
  "boka frisör online",
  "Klipp & Stil",
];

export type NavItem = {
  label: string;
  href: string;
  isAnchor: boolean;
};

export const navItems: NavItem[] = [
  { label: "Hem", href: "/", isAnchor: false },
  { label: "Om oss", href: "/om-oss", isAnchor: false },
  { label: "Tjänster", href: "/#tjanster", isAnchor: true },
  { label: "Priser", href: "/priser", isAnchor: false },
  { label: "Galleri", href: "/galleri", isAnchor: false },
  { label: "Kontakt", href: "/kontakt", isAnchor: false },
];

export type SocialLink = {
  label: string;
  href: string;
  handle: string;
};

export const socialLinks: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/klippochstil",
    handle: "@klippochstil",
  },
  {
    label: "Facebook",
    href: "https://facebook.com/klippochstilgoteborg",
    handle: "Klipp & Stil Göteborg",
  },
];

export const businessInfo = {
  name: "Klipp & Stil",
  tagline: "Varm frisörsalong i Göteborg med klippning, färgning, styling och skäggvård.",
  address: "Storgatan 12",
  postalCode: "411 38",
  city: "Göteborg",
  phone: "031-123 45 67",
  phoneHref: "tel:0311234567",
  email: "hej@klippochstil.se",
  emailHref: "mailto:hej@klippochstil.se",
  googleMaps: "https://www.google.com/maps/search/?api=1&query=Storgatan+12,+411+38+Göteborg",
  mapEmbed: "https://www.google.com/maps?q=Storgatan%2012,%20411%2038%20Göteborg&z=15&output=embed",
  hours: [
    { days: "Mån–Fre", hours: "10–18" },
    { days: "Lör", hours: "10–14" },
    { days: "Sön", hours: "Stängt" },
  ],
};

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

export const testimonials: Testimonial[] = [
  {
    quote: "Jag kände mig verkligen lyssnad på och blev supernöjd med både klipp och färg.",
    name: "Sofia Andersson",
    role: "Kund",
  },
  {
    quote: "Proffsigt, varmt bemötande och snyggt resultat som höll länge.",
    name: "Lina Karlsson",
    role: "Kund",
  },
  {
    quote: "En trygg salong där man alltid får bra råd utan att det känns stressigt.",
    name: "Maria Ek",
    role: "Kund",
  },
];

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
};

export const teamMembers: TeamMember[] = [
  {
    name: "Anna Lindqvist",
    role: "Frisör & färgspecialist",
    bio: "Anna brinner för naturliga nyanser, slingor och mjuka övergångar som växer ut snyggt. Hon arbetar lugnt och metodiskt för att du ska känna dig trygg genom hela behandlingen.",
    image: "https://images.unsplash.com/photo-1617125203718-668061bd0429?w=520&h=640&fit=crop&q=80",
    alt: "Porträtt av Anna Lindqvist i salongen",
  },
  {
    name: "Elin Berg",
    role: "Frisör & styling",
    bio: "Elin är expert på klippform och styling som håller från morgon till kväll. Hon hjälper dig hitta en frisyr som fungerar både till vardag, jobb och fest.",
    image: "https://images.unsplash.com/photo-1610067762007-1ca5a93f72b3?w=520&h=640&fit=crop&q=80",
    alt: "Porträtt av Elin Berg med stylingverktyg",
  },
  {
    name: "Johan Sjöström",
    role: "Barberare",
    bio: "Johan fokuserar på skäggtrim, form och en balanserad helhetslook med lugn hand. Han gillar tydliga linjer, detaljarbete och personliga rekommendationer som är enkla att följa hemma.",
    image: "https://images.unsplash.com/photo-1730573520149-7a5b97d35ccc?w=520&h=640&fit=crop&q=80",
    alt: "Porträtt av Johan Sjöström i salongen",
  },
];

export type PricingPackage = {
  name: string;
  price: string;
  duration: string;
  description: string;
  features: string[];
  featured: boolean;
};

export const pricingPackages: PricingPackage[] = [
  {
    name: "Klipp & Form",
    price: "690 kr",
    duration: "ca 45 min",
    description:
      "Passar dig som vill fräscha upp formen, få rådgivning och avsluta med en lätt styling som håller för vardagen.",
    features: [
      "Konsultation före behandling",
      "Klippning anpassad efter hårtyp och form",
      "Tvätt och avslappnande huvudmassage",
      "Föning och stylingtips inför vardagen",
    ],
    featured: false,
  },
  {
    name: "Färg & Klipp",
    price: "1 690 kr",
    duration: "ca 2 h",
    description:
      "Ett helhetslyft med färgning och klipp inklusive nyansering vid behov. Perfekt när du vill uppdatera både ton och form samtidigt.",
    features: [
      "Grundlig konsultation och planering",
      "Färgning med fokus på hållbar kvalitet",
      "Klippning för helhet och balans",
      "Föning, finish och råd för underhåll hemma",
    ],
    featured: true,
  },
  {
    name: "Styling & Finish",
    price: "590 kr",
    duration: "ca 30 min",
    description:
      "För dig som vill känna dig extra fin inför event, fotografering eller en kväll ute. Vi skapar en look som håller och känns genomarbetad.",
    features: [
      "Kort genomgång av önskat uttryck",
      "Föning, formning eller uppsättning",
      "Finish med produkter anpassade efter håret",
      "Tips för att looken ska hålla längre",
    ],
    featured: false,
  },
];

export type AddOn = {
  name: string;
  price: string;
  duration: string;
  description: string;
};

export const addOns: AddOn[] = [
  {
    name: "Skäggtrim",
    price: "390 kr",
    duration: "20 min",
    description: "Trim, form och rådgivning för ett välvårdat helhetsintryck.",
  },
  {
    name: "Nyansering / toning",
    price: "Från 490 kr",
    duration: "beroende på upplägg",
    description: "Tillägg för att fördjupa, fräscha upp eller balansera tonen.",
  },
  {
    name: "Bryn & frans-färg",
    price: "350 kr",
    duration: "20–30 min",
    description: "En snabb behandling som ramar in ansiktet och ger ett piggare uttryck.",
  },
  {
    name: "Extra tid för långt / tjockt hår",
    price: "Från 200 kr",
    duration: "vid behov",
    description: "När håret kräver mer tid planerar vi det tydligt redan från start.",
  },
];

export type GalleryItem = {
  title: string;
  category: string;
  description: string;
  image: string;
  alt: string;
};

export const galleryItems: GalleryItem[] = [
  {
    title: "Mjuk lob med naturlig rörelse",
    category: "Klippning",
    description: "En mjuk klippning med tydlig form och lätt styling för ett luftigt och följsamt resultat.",
    image: "https://images.unsplash.com/photo-1644976914567-7fce1957e540?w=800&h=1000&fit=crop&q=80",
    alt: "Bakifrån på en mjuk lob-klippning med naturlig rörelse",
  },
  {
    title: "Beige slingor med djup",
    category: "Färgning",
    description: "Ljusa slingor och nyansering som ger djup, lyster och en mjuk utväxt.",
    image: "https://images.unsplash.com/photo-1612041714878-997e3fe9cd13?w=800&h=1000&fit=crop&q=80",
    alt: "Närbild på beige slingor med mjuka övergångar",
  },
  {
    title: "Fönad finish för vardag och jobb",
    category: "Styling",
    description: "En följsam styling med glans och kontroll utan att kännas stel.",
    image: "https://images.unsplash.com/photo-1739890806588-4ace4e25c753?w=800&h=1000&fit=crop&q=80",
    alt: "Färdigfönad styling med glans och mjuk form",
  },
  {
    title: "Ren skägglinje med lugn hand",
    category: "Skägg",
    description: "Skäggtrim med fokus på tydliga linjer, balans och ett naturligt resultat.",
    image: "https://images.unsplash.com/photo-1758069982992-43c569adac63?w=800&h=1000&fit=crop&q=80",
    alt: "Detaljbild på skäggtrim med tydlig form",
  },
  {
    title: "Långt hår med mjuka lager",
    category: "Klippning",
    description: "Lager som ger rörelse och form utan att ta bort känslan av längd.",
    image: "https://images.unsplash.com/photo-1664994466226-123caf0f20e1?w=800&h=1000&fit=crop&q=80",
    alt: "Bakifrån på långt hår med mjuka lager",
  },
  {
    title: "Honungstonad balayage",
    category: "Färgning",
    description: "En varm balayage med naturliga skiftningar som är lätt att underhålla mellan besöken.",
    image: "https://images.unsplash.com/photo-1612041719716-8db1f9a7de96?w=800&h=1000&fit=crop&q=80",
    alt: "Halvprofil på honungstonad balayage med mjuka skiftningar",
  },
  {
    title: "Uppsättning med modern enkelhet",
    category: "Styling",
    description: "En polerad uppsättning med mjuk struktur för fest, middag eller fotografering.",
    image: "https://images.unsplash.com/photo-1739890806588-4ace4e25c753?w=800&h=1000&fit=crop&q=80",
    alt: "Uppsättning med mjuk struktur och modern känsla",
  },
  {
    title: "Kort klippning med tydlig siluett",
    category: "Klippning",
    description: "En kortare frisyr där formen är lätt att styla och håller sig fin mellan besöken.",
    image: "https://images.unsplash.com/flagged/photo-1575494539155-6af0f84aa076?w=800&h=1000&fit=crop&q=80",
    alt: "Kort klippning med tydlig siluett bakifrån",
  },
  {
    title: "Glansig finish efter toning",
    category: "Färgning",
    description: "Toning som jämnar ut tonen och ger extra glans efter färgbehandling.",
    image: "https://images.unsplash.com/photo-1612041714878-997e3fe9cd13?w=800&h=1000&fit=crop&q=80",
    alt: "Närbild på glansigt hår efter toning",
  },
];

export const bookingTimes: string[] = [
  "10.00",
  "10.30",
  "11.00",
  "11.30",
  "12.00",
  "13.00",
  "13.30",
  "14.00",
  "15.00",
  "16.00",
  "16.30",
  "17.00",
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
  const openGraphTitle = `${title} | ${siteTitle}`;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: openGraphTitle,
      description,
      url: path,
      siteName,
      locale: "sv_SE",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "Klipp & Stil i Göteborg",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: openGraphTitle,
      description,
      images: [ogImage],
    },
  };
}