"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  FileText,
  Globe,
  LayoutDashboard,
  ShoppingCart,
  FileEdit,
  Briefcase,
  Gamepad2,
} from "lucide-react";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  helpText: string;
  helpValue: number;
  helpTips: string;
}

const categories: Category[] = [
  {
    id: "landing-page",
    title: "Landing Page",
    description: "Produktsidor, startups, kampanjer",
    icon: FileText,
    helpText:
      "Perfekt för produktlanseringar, startups och kampanjer. Innehåller hero-sektion, funktioner, priser och kontaktformulär. Snabbast att komma igång med!",
    helpValue: 9,
    helpTips: "Bäst för: Företag som vill visa upp en produkt eller tjänst",
  },
  {
    id: "website",
    title: "Hemsida",
    description: "Flersidiga webbplatser för företag",
    icon: Globe,
    helpText:
      "Komplett webbplats med flera sidor: hem, om oss, tjänster och kontakt. Passar företag och organisationer som behöver en professionell närvaro online.",
    helpValue: 8,
    helpTips: "Bäst för: Företag, byråer, organisationer",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler, statistik, data",
    icon: LayoutDashboard,
    helpText:
      "Skapar ett administratörsgränssnitt med diagram, tabeller och statistik. Passar för interna verktyg och datavisualisering.",
    helpValue: 8,
    helpTips: "Bäst för: SaaS-produkter, admin-paneler, analysverktyg",
  },
  {
    id: "ecommerce",
    title: "Webbshop",
    description: "E-handel, produktkataloger",
    icon: ShoppingCart,
    helpText:
      "Webbshop med produktlistor, kategorier, kundvagn och checkout. OBS: Kräver egen backend för faktisk betalning.",
    helpValue: 7,
    helpTips: "Bäst för: Onlinebutiker. Komplexare att implementera fullt ut.",
  },
  {
    id: "blog",
    title: "Blogg",
    description: "Artiklar, nyheter, innehåll",
    icon: FileEdit,
    helpText:
      "Blogg eller nyhetssajt med artikellistor, kategorier och nyhetsbrev-signup. Enkel struktur, snabb att anpassa.",
    helpValue: 8,
    helpTips: "Bäst för: Innehållsskapare, företagsbloggar, nyhetssidor",
  },
  {
    id: "portfolio",
    title: "Portfolio",
    description: "Visa upp ditt arbete",
    icon: Briefcase,
    helpText:
      "Visa upp ditt arbete med bildgallerier, projektbeskrivningar och kontaktinfo. Perfekt för kreativa yrken.",
    helpValue: 8,
    helpTips: "Bäst för: Fotografer, designers, konstnärer, frilansare",
  },
  {
    id: "webapp",
    title: "Web App",
    description: "Interaktiva applikationer",
    icon: Gamepad2,
    helpText:
      "Bygg funktionella webbapplikationer med interaktiva element. Passar för verktyg, spel och specialanpassade lösningar.",
    helpValue: 7,
    helpTips: "Bäst för: Verktyg, spel, specialiserade applikationer",
  },
];

interface TemplateGalleryProps {
  onSelect?: (categoryId: string) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const router = useRouter();

  const handleSelect = (categoryId: string) => {
    if (onSelect) {
      onSelect(categoryId);
    }
    router.push(`/builder?type=${categoryId}`);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
      {categories.map((category) => {
        const Icon = category.icon;
        return (
          <Card
            key={category.id}
            onClick={() => handleSelect(category.id)}
            className="group cursor-pointer bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/5"
          >
            <CardContent className="p-5 flex flex-col items-center text-center space-y-3">
              <div className="p-3 rounded-xl bg-zinc-800/50 group-hover:bg-blue-500/10 transition-colors">
                <Icon className="h-7 w-7 text-zinc-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-zinc-100 flex items-center justify-center gap-1">
                  {category.title}
                  <HelpTooltip
                    text={category.helpText}
                    value={category.helpValue}
                    tips={category.helpTips}
                  />
                </h3>
                <p className="text-sm text-zinc-500">{category.description}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

