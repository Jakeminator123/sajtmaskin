import type { Metadata } from "next";

export type NavigationItem = {
  label: string;
  href: string;
  description: string;
  activeMatch: "exact" | "never" | "startsWith";
};

export type SocialLink = {
  label: string;
  href: string;
  handle: string;
};

export const siteConfig = {
  name: "Klipp & Stil",
  legalTitle: "Klipp & Stil — Vi driver en frisörsalong som heter Klipp & Stil i Göteborg",
  description:
    "Klipp & Stil är en varm och personlig frisörsalong i Göteborg. Klippning, färgning, styling och skäggvård – boka tid online enkelt och snabbt.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.klippostil.se",
  ogImage:
    "https://images.unsplash.com/photo-1751872326221-865ac5da7825?w=1200&h=630&fit=crop&q=80",
  phone: "031-123 45 67",
  email: "boka@klippostil.se",
  address: {
    street: "Storgatan 12",
    postalCode: "411 38",
    city: "Göteborg",
    region: "Västra Götalands län",
    country: "SE",
  },
  hours: [
    { label: "Mån–Fre", opens: "10:00", closes: "18:00" },
    { label: "Lör", opens: "10:00", closes: "14:00" },
  ],
  keywords: [
    "frisör Göteborg",
    "frisörsalong Göteborg",
    "klippning Göteborg",
    "hårfärg Göteborg",
    "slingor Göteborg",
    "balayage Göteborg",
    "styling Göteborg",
    "skäggtrim Göteborg",
    "barber Göteborg",
    "boka frisör Göteborg",
    "Klipp & Stil",
  ],
  socials: [
    {
      label: "Instagram",
      href: "https://instagram.com/klippostilgbg",
      handle: "@klippostilgbg",
    },
    {
      label: "Facebook",
      href: "https://facebook.com/klippostilgbg",
      handle: "Klipp & Stil Göteborg",
    },
  ] as SocialLink[],
};

export const navigation: NavigationItem[] = [
  {
    label: "Hem",
    href: "/",
    description: "Till startsidan",
    activeMatch: "exact",
  },
  {
    label: "Om oss",
    href: "/om-oss",
    description: "Läs mer om salongen och teamet",
    activeMatch: "exact",
  },
  {
    label: "Tjänster",
    href: "/#tjanster",
    description: "Se våra tjänster på startsidan",
    activeMatch: "never",
  },
  {
    label: "Priser",
    href: "/priser",
    description: "Se priser och paket",
    activeMatch: "exact",
  },
  {
    label: "Galleri",
    href: "/galleri",
    description: "Utforska vårt galleri",
    activeMatch: "exact",
  },
  {
    label: "Kontakt",
    href: "/kontakt",
    description: "Kontakta salongen",
    activeMatch: "exact",
  },
];

export const footerNavigation: NavigationItem[] = [
  {
    label: "Hem",
    href: "/",
    description: "Till startsidan",
    activeMatch: "exact",
  },
  {
    label: "Om oss",
    href: "/om-oss",
    description: "Läs om Klipp & Stil",
    activeMatch: "exact",
  },
  {
    label: "Priser",
    href: "/priser",
    description: "Se våra paket",
    activeMatch: "exact",
  },
  {
    label: "Galleri",
    href: "/galleri",
    description: "Se resultat från salongen",
    activeMatch: "exact",
  },
  {
    label: "Boka tid",
    href: "/boka",
    description: "Skicka bokningsförfrågan",
    activeMatch: "exact",
  },
  {
    label: "Kontakt",
    href: "/kontakt",
    description: "Kontakta oss",
    activeMatch: "exact",
  },
];

export const googleMapsUrl =
  "https://www.google.com/maps/search/?api=1&query=Storgatan+12,+411+38+G%C3%B6teborg";

type CreateMetadataOptions = {
  title?: string;
  description?: string;
  path: string;
};

export function createPageMetadata({
  title,
  description,
  path,
}: CreateMetadataOptions): Metadata {
  const pageTitle = title ? `${title} | ${siteConfig.legalTitle}` : siteConfig.legalTitle;
  const resolvedDescription = description || siteConfig.description;
  const canonical = new URL(path, siteConfig.url).toString();

  return {
    title: pageTitle,
    description: resolvedDescription,
    keywords: [...siteConfig.keywords],
    alternates: {
      canonical,
    },
    openGraph: {
      title: pageTitle,
      description: resolvedDescription,
      url: canonical,
      siteName: siteConfig.name,
      locale: "sv_SE",
      type: "website",
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: "Klipp & Stil i Göteborg",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: resolvedDescription,
      images: [siteConfig.ogImage],
    },
  };
}