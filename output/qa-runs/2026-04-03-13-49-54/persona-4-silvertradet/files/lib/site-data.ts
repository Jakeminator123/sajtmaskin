export type NavItem = {
  name: string;
  href: string;
};

export type FeaturedProduct = {
  slug: string;
  category: string;
  name: string;
  price: string;
  description: string;
  badge: string;
  image: string;
  alt: string;
};

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
};

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
};

export type PricingTier = {
  name: string;
  priceRange: string;
  description: string;
  features: string[];
  ctaLabel: string;
  featured: boolean;
  note: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type GalleryItem = {
  id: string;
  title: string;
  category: string;
  material: string;
  description: string;
  price: string;
  image: string;
  alt: string;
};

export type SocialLink = {
  name: string;
  href: string;
};

export const siteName = "Silverträdet";
export const siteUrl = "https://silvertradet.se";
export const siteDescription =
  "Silverträdet säljer handgjorda silversmycken online – ringar, halsband, armband och örhängen i 925 silver. Ljust, minimalistiskt och tryggt att handla.";

export const baseKeywords: string[] = [
  "handgjorda silversmycken",
  "silversmycken online",
  "silverring",
  "silverhalsband",
  "silverarmband",
  "silverörhängen",
  "925 sterling silver",
  "minimalistiska smycken",
  "svenska smycken",
  "unika smycken",
  "smycken Göteborg",
  "present smycken",
];

export const navigation: NavItem[] = [
  { name: "Hem", href: "/" },
  { name: "Om oss", href: "/om-oss" },
  { name: "Priser", href: "/priser" },
  { name: "Galleri", href: "/galleri" },
  { name: "Kontakt", href: "/kontakt" },
];

export const socialLinks: SocialLink[] = [
  { name: "Instagram", href: "https://instagram.com/silvertradet" },
  { name: "Facebook", href: "https://facebook.com/silvertradet" },
  { name: "Pinterest", href: "https://pinterest.com/silvertradet" },
];

export const contactDetails = {
  phone: "070-123 45 67",
  email: "hej@silvertradet.se",
  address: "Storgatan 12, 411 38 Göteborg",
  hours: "Mån–Fre 09.00–17.00",
  mapLink:
    "https://www.google.com/maps/search/?api=1&query=Storgatan+12,+411+38+Göteborg",
};

export const featuredProducts: FeaturedProduct[] = [
  {
    slug: "manskara",
    category: "Ring",
    name: "Månskära",
    price: "Från 690 kr",
    description:
      "En ren, mjukt välvd ring i 925 silver med diskret lyster och en form som känns självklar från första dagen.",
    badge: "Nyhet",
    image:
      "https://images.unsplash.com/photo-1571859906623-9612b0f58b86?w=500&h=500&fit=crop&q=80",
    alt: "Minimalistisk silverring på ljus stenbakgrund",
  },
  {
    slug: "granljus",
    category: "Halsband",
    name: "Granljus",
    price: "Från 890 kr",
    description:
      "Tunn kedja med handslipad bricka som fångar ljuset mjukt och passar lika fint ensam som i lager.",
    badge: "",
    image:
      "https://images.unsplash.com/photo-1571859906623-9612b0f58b86?w=500&h=500&fit=crop&q=80",
    alt: "Tunt silverhalsband med rund bricka på ljus linnebakgrund",
  },
  {
    slug: "lovverk",
    category: "Armband",
    name: "Lövverk",
    price: "Från 790 kr",
    description:
      "Lätt och justerbart armband med följsam passform, skapat för att bäras varje dag utan att kännas påträngande.",
    badge: "Bästsäljare",
    image:
      "https://images.unsplash.com/photo-1678270661784-134cfa9bcb98?w=500&h=500&fit=crop&q=80",
    alt: "Justerbart silverarmband med mjuk struktur",
  },
  {
    slug: "stillhet",
    category: "Örhängen",
    name: "Stillhet",
    price: "Från 590 kr",
    description:
      "Små stift i sterling silver med avskalad form som ger ett lugnt uttryck och fungerar till allt.",
    badge: "",
    image:
      "https://images.unsplash.com/photo-1680099580695-f5d127f803a9?w=500&h=500&fit=crop&q=80",
    alt: "Små silverörhängen på neutral bakgrund",
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Anna Karlsson",
    role: "Kund i Göteborg",
    quote:
      "Ringen är ännu finare i verkligheten. Enkel, men med precis rätt känsla, och den har blivit det smycke jag använder mest.",
  },
  {
    name: "Elin Sjöberg",
    role: "Projektledare",
    quote:
      "Snabb leverans och väldigt fint hantverk. Jag använder örhängena varje dag och de känns lika genomarbetade nu som när jag öppnade asken.",
  },
  {
    name: "Sara Lind",
    role: "Egenföretagare",
    quote:
      "Jag uppskattar den minimalistiska stilen eftersom smyckena fungerar till hela min garderob. Det känns personligt utan att bli för mycket.",
  },
];

export const teamMembers: TeamMember[] = [
  {
    name: "Maja Ekström",
    role: "Grundare & silversmed",
    bio: "Maja formger, tillverkar och kvalitetssäkrar varje smycke innan det lämnar studion. Hennes fokus ligger på rena former, bra proportioner och ett hantverk som håller länge.",
    image:
      "https://images.unsplash.com/photo-1625768489432-32b1fe61be6d?w=640&h=760&fit=crop&q=80",
    alt: "Silversmed i ljus verkstad med silverdetaljer",
  },
  {
    name: "Linnea Berg",
    role: "Kundservice & packning",
    bio: "Linnea hjälper till med storlekar, presentinslagning och leveranser. Hon ser till att varje beställning känns genomtänkt från första frågan till färdig ask.",
    image:
      "https://images.unsplash.com/photo-1692473301173-a7b3d324b239?w=640&h=760&fit=crop&q=80",
    alt: "Person som packar smycken i naturligt ljus",
  },
];

export const workValues = [
  {
    title: "Handgjort på riktigt",
    description:
      "Varje steg sker i vår studio – från formning och lödning till polering och slutkontroll. Det ger ett smycke med tydlig känsla och ett lugn i detaljerna.",
  },
  {
    title: "Tryggt köp",
    description:
      "Vi arbetar med tydliga storlekar, smidig leverans och snabb återkoppling när du behöver hjälp. Det ska kännas enkelt att välja rätt även när du handlar online.",
  },
  {
    title: "Hållbara val",
    description:
      "Vi prioriterar material och arbetssätt som ger lång livslängd och minskat svinn. Tidlös design är också en form av hållbarhet – smycken ska bäras länge, inte bara en säsong.",
  },
];

export const pricingTiers: PricingTier[] = [
  {
    name: "Vardagsfavorit",
    priceRange: "590–890 kr",
    description:
      "För dig som vill börja med ett enda smycke som känns lätt att bära varje dag.",
    features: [
      "1 valfritt smycke",
      "Presentask",
      "Skötselråd",
      "14 dagars öppet köp",
    ],
    ctaLabel: "Välj Vardagsfavorit",
    featured: false,
    note: "Passar dig som vill ge bort en fin gåva eller hitta en ny personlig favorit.",
  },
  {
    name: "Set i silver",
    priceRange: "1 290–1 690 kr",
    description:
      "Två smycken som matchar i uttryck och finish, till exempel ring och örhängen.",
    features: [
      "2 matchande smycken",
      "Presentask",
      "Fri frakt",
      "Matchningshjälp vid behov",
    ],
    ctaLabel: "Välj Set i silver",
    featured: true,
    note: "Ett uppskattat val när du vill bygga ett sammanhållet uttryck eller ge bort något extra.",
  },
  {
    name: "Gåva deluxe",
    priceRange: "1 990–2 490 kr",
    description:
      "Tre smycken eller ett set med extra omsorg, premiumask och prioriterad hantering.",
    features: [
      "3 smycken eller set",
      "Premiumask",
      "Fri frakt",
      "Prioriterad packning",
    ],
    ctaLabel: "Välj Gåva deluxe",
    featured: false,
    note: "För högtider, minnesgåvor och tillfällen då presenten ska kännas särskilt genomtänkt.",
  },
];

export const faqItems: FaqItem[] = [
  {
    question: "Varför varierar priserna?",
    answer:
      "Varje smycke görs för hand och priset påverkas av modell, vikt i silver och finish. Ett tunnare vardagssmycke kräver andra moment än ett mer arbetat set eller en gravyrförberedd gåva.",
  },
  {
    question: "Ingår frakt?",
    answer:
      "Fri frakt gäller över 599 kr. Exakta fraktvillkor visas alltid tydligt innan du går vidare, så att du vet vad som gäller för just din beställning.",
  },
  {
    question: "Kan jag byta storlek på en ring?",
    answer:
      "Ja, i mån av modell. Hör av dig med ditt ordernummer så tittar vi på vad som är möjligt och hjälper dig vidare med bästa lösningen.",
  },
  {
    question: "Kan jag beställa som present?",
    answer:
      "Ja, presentask ingår i alla paket och du kan ange en hälsning i kassan eller skriva till oss efter beställning. Vi hjälper gärna till om du vill göra gåvan lite mer personlig.",
  },
];

export const galleryItems: GalleryItem[] = [
  {
    id: "1",
    title: "Månskära",
    category: "Ringar",
    material: "925 sterling silver",
    description:
      "Mjukt välvd ring med lugn profil och handpolerad yta som fångar ljuset diskret.",
    price: "690 kr",
    image:
      "https://images.unsplash.com/photo-1671737929712-4c10cca3d45d?w=700&h=700&fit=crop&q=80",
    alt: "Silverring på ljus sten med mjuk skugga",
  },
  {
    id: "2",
    title: "Stilla linje",
    category: "Ringar",
    material: "925 sterling silver",
    description:
      "Smal ring med rak siluett för dig som vill ha ett rent uttryck nära handen.",
    price: "720 kr",
    image:
      "https://images.unsplash.com/photo-1568219396383-6c8e87dadbe0?w=700&h=700&fit=crop&q=80",
    alt: "Smal silverring i makro mot neutral bakgrund",
  },
  {
    id: "3",
    title: "Granljus",
    category: "Halsband",
    material: "Sterling silver med handslipad bricka",
    description:
      "Luftigt halsband med rund bricka som ger en mjuk reflektion mot hud och tyg.",
    price: "890 kr",
    image:
      "https://images.unsplash.com/photo-1571859906623-9612b0f58b86?w=700&h=700&fit=crop&q=80",
    alt: "Silverhalsband med rund bricka på linne",
  },
  {
    id: "4",
    title: "Skogsglänta",
    category: "Halsband",
    material: "925 sterling silver",
    description:
      "Lite längre kedja med oval form, tänkt för lager på lager eller ensam mot stickat.",
    price: "940 kr",
    image:
      "https://images.unsplash.com/photo-1594399011567-c992faac7f8d?w=700&h=700&fit=crop&q=80",
    alt: "Längre silverhalsband mot ljus textil",
  },
  {
    id: "5",
    title: "Lövverk",
    category: "Armband",
    material: "Justerbart sterling silver",
    description:
      "Lätt armband med mjuk struktur och följsam form som sitter fint genom hela dagen.",
    price: "790 kr",
    image:
      "https://images.unsplash.com/photo-1727775428977-9d47112e013b?w=700&h=700&fit=crop&q=80",
    alt: "Silverarmband på handled i naturligt ljus",
  },
  {
    id: "6",
    title: "Dagg",
    category: "Armband",
    material: "925 sterling silver",
    description:
      "Fin kedja med liten detalj i mitten, framtagen för ett diskret och tidlöst uttryck.",
    price: "760 kr",
    image:
      "https://images.unsplash.com/photo-1623052627525-4841af32f200?w=700&h=700&fit=crop&q=80",
    alt: "Tunt silverarmband på neutral bakgrund",
  },
  {
    id: "7",
    title: "Stillhet",
    category: "Örhängen",
    material: "Sterling silver",
    description:
      "Små stift med avskalad form som blir en naturlig del av vardagen.",
    price: "590 kr",
    image:
      "https://images.unsplash.com/photo-1671737929712-4c10cca3d45d?w=700&h=700&fit=crop&q=80",
    alt: "Små silverörhängen på ljus yta",
  },
  {
    id: "8",
    title: "Morgonljus",
    category: "Örhängen",
    material: "925 sterling silver",
    description:
      "Nätta hängande örhängen med balanserad längd och mjuk rörelse.",
    price: "690 kr",
    image:
      "https://images.unsplash.com/photo-1673424341930-f29081dfcb6d?w=700&h=700&fit=crop&q=80",
    alt: "Hängande silverörhängen i makro",
  },
  {
    id: "9",
    title: "Hamrad yta",
    category: "Ringar",
    material: "Handbearbetat sterling silver",
    description:
      "Detaljbild som visar hur ytan får liv genom små slag och varsam polering.",
    price: "810 kr",
    image:
      "https://images.unsplash.com/photo-1645536989394-621275dcbabb?w=700&h=700&fit=crop&q=80",
    alt: "Makrodetalj av hamrad silveryta",
  },
  {
    id: "10",
    title: "Polerad bricka",
    category: "Halsband",
    material: "Sterling silver",
    description:
      "Närbild av handpolerad bricka där finishen ger ett mjukt, silvrigt djup.",
    price: "910 kr",
    image:
      "https://images.unsplash.com/photo-1645536989394-621275dcbabb?w=700&h=700&fit=crop&q=80",
    alt: "Makro av polerad silverbricka",
  },
  {
    id: "11",
    title: "Vardagslager",
    category: "Halsband",
    material: "925 sterling silver",
    description:
      "Lifestylebild med två tunna halsband i lager för ett lätt och modernt uttryck.",
    price: "1 290 kr",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=700&h=700&fit=crop&q=80",
    alt: "Två tunna silverhalsband på hals",
  },
  {
    id: "12",
    title: "Studiohörn",
    category: "Armband",
    material: "Sterling silver i arbete",
    description:
      "En lugn glimt från studion där verktyg, putsduk och halvfärdiga smycken möts.",
    price: "790 kr",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=700&h=700&fit=crop&q=80",
    alt: "Verktyg och silverdetaljer i ljus studio",
  },
];