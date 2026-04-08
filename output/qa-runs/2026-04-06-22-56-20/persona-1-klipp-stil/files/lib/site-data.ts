export type NavigationItem = {
  label: string;
  href: string;
};

export type Service = {
  id: string;
  name: string;
  price: string;
  description: string;
  summary: string;
};

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  image: string;
  alt: string;
};

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
  specialties: string[];
};

export type ValueItem = {
  title: string;
  description: string;
};

export type PackageItem = {
  name: string;
  price: string;
  description: string;
  features: string[];
  popular?: boolean;
};

export type PriceMenuItem = {
  name: string;
  price: string;
  description: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type GalleryCategory = "Klippning" | "Färgning" | "Styling" | "Skäggvård";

export type GalleryItem = {
  title: string;
  category: GalleryCategory;
  description: string;
  image: string;
  alt: string;
};

export const siteInfo = {
  name: "Klipp & Stil",
  city: "Göteborg",
  address: "Storgatan 12, 411 38 Göteborg",
  phone: "031-123 45 67",
  email: "hej@klippochstil.se",
  bookingResponse: "Vi återkommer vanligtvis inom två arbetstimmar.",
  rating: "4,9 av 5",
  intro:
    "Klipp & Stil är en varm och personlig frisörsalong i Göteborg där klippning, färgning, styling och skäggvård alltid anpassas efter din vardag, stil och hårkvalitet.",
};

export const openingHours = [
  { label: "Måndag–fredag", value: "09.00–19.00" },
  { label: "Lördag", value: "10.00–16.00" },
  { label: "Söndag", value: "Stängt" },
];

export const navigationItems: NavigationItem[] = [
  { label: "Hem", href: "/" },
  { label: "Om oss", href: "/om-oss" },
  { label: "Tjänster", href: "/#tjanster" },
  { label: "Priser", href: "/priser" },
  { label: "Galleri", href: "/galleri" },
  { label: "Kontakt", href: "/kontakt" },
];

export const services: Service[] = [
  {
    id: "klippning",
    name: "Klippning",
    price: "från 695 kr",
    summary: "Noggrann dam- och herrklippning med form, balans och hållbar styling.",
    description:
      "Vi börjar alltid med en kort konsultation där vi går igenom form, längd och hur du vill att håret ska fungera i vardagen. Du får en klippning som känns genomarbetad även när du stylar den själv hemma.",
  },
  {
    id: "fargning",
    name: "Färgning",
    price: "från 1 590 kr",
    summary: "Slingor, helfärg, nyansering och balayage med ett naturligt resultat.",
    description:
      "Oavsett om du vill ljusa upp, fördjupa tonen eller göra en större förändring arbetar vi med färg som tar hänsyn till hårkvalitet, underhåll och ansiktsdrag. Målet är en nyans som känns levande, personlig och lätt att bära.",
  },
  {
    id: "styling",
    name: "Styling",
    price: "från 495 kr",
    summary: "Föning, lockar, feststyling och uppsättningar för vardag och större tillfällen.",
    description:
      "Vi skapar allt från en polerad salongsfinish till mjuka vågor eller uppsättningar inför fest, middag och bröllop. Du får även råd kring produkter och verktyg så att känslan håller längre än samma kväll.",
  },
  {
    id: "skaggvard",
    name: "Skäggvård",
    price: "från 350 kr",
    summary: "Trimning, konturer och vård som ger ett välvårdat men avslappnat uttryck.",
    description:
      "För dig som vill kombinera klippning med skäggtrimning eller bara fräscha upp linjerna arbetar vi med precision och tydlig form. Resultatet ska kännas rent, välbalanserat och enkelt att underhålla mellan besöken.",
  },
];

export const testimonials: Testimonial[] = [
  {
    name: "Emma Larsson",
    role: "Projektledare, Linnéstaden",
    quote:
      "Jag kom in för en uppfräschning och gick därifrån med en färg som fortfarande får komplimanger veckor senare. Teamet är lyhört, tydligt i sin rådgivning och får hela besöket att kännas lugnt.",
    image:
      "https://images.unsplash.com/photo-1608231262089-12c6afe813ae?w=96&h=96&fit=crop&q=80",
    alt: "Porträtt av Emma Larsson",
  },
  {
    name: "Markus Holm",
    role: "Arkitekt, Göteborg",
    quote:
      "Jag bokar alltid klippning och skäggtrimning här inför intensiva jobbveckor. Det är noggrant, avslappnat och lätt att få en tid som passar även efter arbetsdagen.",
    image:
      "https://images.unsplash.com/photo-1766036387890-23afdb1a66ee?w=96&h=96&fit=crop&q=80",
    alt: "Porträtt av Markus Holm",
  },
  {
    name: "Sofia Bergman",
    role: "Marknadschef, Haga",
    quote:
      "Inför vårt bröllop hjälpte de mig med både färg, klippning och styling. Resultatet kändes fortfarande som jag, bara mer genomarbetat och hållbart från morgon till kväll.",
    image:
      "https://images.unsplash.com/photo-1731918314028-2abf4cd69324?w=96&h=96&fit=crop&q=80",
    alt: "Porträtt av Sofia Bergman",
  },
];

export const teamMembers: TeamMember[] = [
  {
    name: "Johanna Lindberg",
    role: "Grundare och senior stylist",
    bio:
      "Johanna startade Klipp & Stil efter många år på större citysalonger där hon saknade tid för ordentlig rådgivning. Hon är särskilt uppskattad för formstarka klippningar och färgförändringar som känns naturliga från första dagen.",
    image:
      "https://images.unsplash.com/photo-1730573520149-7a5b97d35ccc?w=480&h=600&fit=crop&q=80",
    alt: "Johanna Lindberg i salongen",
    specialties: ["Formklippning", "Balayage", "Personlig konsultation"],
  },
  {
    name: "Maja Svensson",
    role: "Färgspecialist",
    bio:
      "Maja arbetar med slingor, nyanseringar och glansbehandlingar där målet alltid är ett mjukt och hållbart resultat. Hon är extra bra på att hitta rätt ton för dig som vill förändra mycket utan att tappa känslan av dig själv.",
    image:
      "https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?w=480&h=600&fit=crop&q=80",
    alt: "Maja Svensson i salongen",
    specialties: ["Slingor", "Nyansering", "Glansbehandlingar"],
  },
  {
    name: "Sara Holm",
    role: "Stylist och barberare",
    bio:
      "Sara kombinerar ett lugnt handlag med precision i både styling och skäggvård. Hon hjälper gärna till inför fest, fotografering eller vardagsrutiner där du vill att formen ska sitta snyggt med så lite ansträngning som möjligt.",
    image:
      "https://images.unsplash.com/photo-1645106281508-25225f4c16d0?w=480&h=600&fit=crop&q=80",
    alt: "Sara Holm i salongen",
    specialties: ["Feststyling", "Föning", "Skäggtrimning"],
  },
];

export const values: ValueItem[] = [
  {
    title: "Lyhörd rådgivning",
    description:
      "Vi börjar varje behandling med att lyssna in din vardag, dina önskemål och hur mycket tid du faktiskt vill lägga på styling hemma. Det gör att resultatet blir både snyggt och realistiskt att leva med.",
  },
  {
    title: "Hållbara resultat",
    description:
      "Oavsett om det gäller klippning eller färg fokuserar vi på tekniker som åldras fint mellan besöken. Du ska känna att håret håller formen och tonen även när veckorna går.",
  },
  {
    title: "Varm salongskänsla",
    description:
      "Hos oss ska det kännas personligt från första hej till sista spegelblicken. Vi vill att salongen ska vara en lugn plats mitt i stan där du får landa en stund och gå därifrån med ny energi.",
  },
];

export const packages: PackageItem[] = [
  {
    name: "Klipp & form",
    price: "695 kr",
    description:
      "För dig som vill fräscha upp formen och gå härifrån med en lättstylad finish som fungerar direkt i vardagen.",
    features: [
      "Personlig konsultation",
      "Tvätt och avkopplande huvudmassage",
      "Klippning anpassad efter hårtyp",
      "Föning och enkel styling",
      "Råd om produkter och skötsel",
    ],
  },
  {
    name: "Färg & finish",
    price: "1 590 kr",
    description:
      "Vårt mest bokade paket för dig som vill förnya tonen, få mer liv i håret och lämna salongen med ett polerat resultat.",
    features: [
      "Utförlig färgkonsultation",
      "Slingor, helfärg eller nyansering",
      "Lätt klipp eller toppning",
      "Gloss för extra glans",
      "Föning och avslutande styling",
    ],
    popular: true,
  },
  {
    name: "Signaturhelhet",
    price: "2 290 kr",
    description:
      "För större förändringar där vi avsätter mer tid till färg, form, vård och styling för ett genomarbetat helhetsintryck.",
    features: [
      "Fördjupad konsultation",
      "Avancerad färgteknik eller större förändring",
      "Klippning och formjustering",
      "Intensiv vårdbehandling",
      "Styling med plan för underhåll hemma",
    ],
  },
];

export const priceMenu: PriceMenuItem[] = [
  {
    name: "Luggklippning",
    price: "190 kr",
    description: "En snabb uppfräschning mellan dina ordinarie besök.",
  },
  {
    name: "Skäggtrimning",
    price: "350 kr",
    description: "Trimning, form och rena konturer med vårdande finish.",
  },
  {
    name: "Tvätt & styling",
    price: "495 kr",
    description: "Perfekt inför middag, event eller en lång arbetsdag.",
  },
  {
    name: "Intensivkur",
    price: "250 kr",
    description: "Fördjupande behandling som stärker glans och mjukhet.",
  },
  {
    name: "Barnklippning",
    price: "395 kr",
    description: "Lugn och trygg klippning för yngre kunder.",
  },
  {
    name: "Konsultation inför färg",
    price: "0 kr",
    description: "Kort rådgivning för dig som vill planera en större förändring.",
  },
];

export const faqs: FaqItem[] = [
  {
    question: "Ingår konsultation i alla behandlingar?",
    answer:
      "Ja, vi börjar alltid med att prata igenom önskat resultat, hårkvalitet och hur mycket underhåll du vill lägga hemma. På så sätt kan vi rekommendera rätt behandling och rätt nivå på förändringen redan från start.",
  },
  {
    question: "Hur fungerar avbokning eller ombokning?",
    answer:
      "Vi ber dig att avboka eller boka om senast 24 timmar före din tid. Då hinner vi erbjuda platsen till någon annan och hjälpa dig att hitta en ny tid som passar bättre.",
  },
  {
    question: "Jag är osäker på vilken färgbehandling jag ska välja. Hur gör jag?",
    answer:
      "Boka gärna vårt färgpaket eller hör av dig via bokningssidan så guidar vi dig till rätt behandling. Vi hjälper dig att väga in nyans, underhåll, budget och hur stor förändring du vill göra.",
  },
  {
    question: "Kan jag kombinera klippning med skäggvård eller styling?",
    answer:
      "Absolut. Många kunder kombinerar sin klippning med skäggtrimning, tvätt eller styling för att få en komplett genomgång vid samma besök. Skriv gärna ditt önskemål i bokningsformuläret så planerar vi tiden rätt.",
  },
];

export const galleryItems: GalleryItem[] = [
  {
    title: "Mjuk balayage i honungston",
    category: "Färgning",
    description:
      "En varm balayage med naturliga övergångar och glans som lyfter både längder och ansiktsdrag.",
    image:
      "https://images.unsplash.com/photo-1671737929712-4c10cca3d45d?w=560&h=720&fit=crop&q=80",
    alt: "Balayage i honungston med glansiga längder",
  },
  {
    title: "Kort bob med rörelse",
    category: "Klippning",
    description:
      "En precis bob med mjuk textur som ger form utan att kännas stel eller tung.",
    image:
      "https://images.unsplash.com/photo-1581318694548-0fb6e47fe59b?w=560&h=720&fit=crop&q=80",
    alt: "Kort bobklippning med mjuk rörelse",
  },
  {
    title: "Feststyling med mjuka vågor",
    category: "Styling",
    description:
      "En polerad men avslappnad styling som håller formen genom både middag och dansgolv.",
    image:
      "https://images.unsplash.com/photo-1658932447775-dd78d1e7c369?w=560&h=720&fit=crop&q=80",
    alt: "Feststyling med mjuka vågor",
  },
  {
    title: "Skäggtrimning med rena linjer",
    category: "Skäggvård",
    description:
      "Tydlig form, snygga konturer och ett resultat som känns välvårdat utan att bli för hårt.",
    image:
      "https://images.unsplash.com/photo-1599941973480-33ce6bbca25d?w=560&h=720&fit=crop&q=80",
    alt: "Skäggtrimning med rena linjer",
  },
  {
    title: "Kopparfärg med djup och värme",
    category: "Färgning",
    description:
      "En rik kopparton med glans i längderna och mjuk övergång mot botten.",
    image:
      "/placeholder.svg?height=720&width=560&text=Kopparfärg+med+glans+och+djup+i+långt+hår",
    alt: "Kopparfärg med djup och värme",
  },
  {
    title: "Lagerklippning för mer volym",
    category: "Klippning",
    description:
      "Klippning som ger lätthet, rörelse och en form som är enkel att föna fram hemma.",
    image:
      "/placeholder.svg?height=720&width=560&text=Lagerklippning+med+volym+och+mjuk+fönad+finish",
    alt: "Lagerklippning för mer volym",
  },
  {
    title: "Uppsättning för högtid",
    category: "Styling",
    description:
      "Mjukt uppsatt hår med detaljer som ramar in ansiktet och håller hela dagen.",
    image:
      "/placeholder.svg?height=720&width=560&text=Elegant+uppsättning+för+högtid+med+mjuka+detaljer",
    alt: "Uppsättning för högtid",
  },
  {
    title: "Svala slingor med naturligt fall",
    category: "Färgning",
    description:
      "Blonda slingor med sval ton som skapar lyster och dimension utan skarpa kontraster.",
    image:
      "/placeholder.svg?height=720&width=560&text=Svala+slingor+med+naturligt+fall+och+lyster",
    alt: "Svala slingor med naturligt fall",
  },
];

export const socialLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/klippochstil.gbg",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/klippochstil.gbg",
  },
];