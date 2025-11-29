"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  FileText,
  Globe,
  LayoutDashboard,
  ShoppingCart,
  Briefcase,
  Gamepad2,
  Puzzle,
  LogIn,
  Sparkles,
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
      "Perfekt för produktlanseringar, startups och kampanjer. Innehåller hero-sektion, funktioner, priser och kontaktformulär.",
    helpValue: 9,
    helpTips: "Bäst för: Företag som vill visa upp en produkt eller tjänst",
  },
  {
    id: "website",
    title: "Hemsida",
    description: "Flersidiga webbplatser för företag",
    icon: Globe,
    helpText:
      "Komplett webbplats med flera sidor: hem, om oss, tjänster och kontakt. Passar företag och organisationer.",
    helpValue: 8,
    helpTips: "Bäst för: Företag, byråer, organisationer",
  },
  {
    id: "apps-games",
    title: "Apps & Spel",
    description: "Interaktiva applikationer",
    icon: Gamepad2,
    helpText:
      "Bygg funktionella webbapplikationer och spel med interaktiva element.",
    helpValue: 7,
    helpTips: "Bäst för: Verktyg, spel, specialiserade applikationer",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler, statistik, data",
    icon: LayoutDashboard,
    helpText:
      "Skapar ett administratörsgränssnitt med diagram, tabeller och statistik.",
    helpValue: 8,
    helpTips: "Bäst för: SaaS-produkter, admin-paneler, analysverktyg",
  },
  {
    id: "ecommerce",
    title: "E-commerce",
    description: "Webbshoppar, produktkataloger",
    icon: ShoppingCart,
    helpText:
      "Webbshop med produktlistor, kategorier och checkout. OBS: Kräver egen backend för betalning.",
    helpValue: 7,
    helpTips: "Bäst för: Onlinebutiker",
  },
  {
    id: "blog-portfolio",
    title: "Blogg & Portfolio",
    description: "Visa upp arbete och innehåll",
    icon: Briefcase,
    helpText:
      "Blogg eller portfolio med artikellistor, bildgallerier och projektbeskrivningar.",
    helpValue: 8,
    helpTips: "Bäst för: Innehållsskapare, fotografer, designers",
  },
  {
    id: "components",
    title: "Komponenter",
    description: "Enskilda UI-komponenter",
    icon: Puzzle,
    helpText:
      "Skapa enskilda komponenter som formulär, knappar, kort och modaler.",
    helpValue: 9,
    helpTips: "Bäst för: Utvecklare som vill bygga egna komponenter",
  },
  {
    id: "login-signup",
    title: "Login & Sign Up",
    description: "Autentiseringssidor",
    icon: LogIn,
    helpText:
      "Inloggnings- och registreringssidor med formulär och social login.",
    helpValue: 8,
    helpTips: "Bäst för: Appar som behöver användarautentisering",
  },
  {
    id: "animations",
    title: "Animationer",
    description: "Animerade komponenter",
    icon: Sparkles,
    helpText:
      "Animerade komponenter och effekter som ger liv åt din webbplats.",
    helpValue: 7,
    helpTips: "Bäst för: Kreativa projekt som behöver extra polish",
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
    // Navigate to category page instead of builder
    router.push(`/category/${categoryId}`);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
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
