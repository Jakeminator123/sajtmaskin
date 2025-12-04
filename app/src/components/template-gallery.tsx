"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { FileText, Globe, LayoutDashboard } from "lucide-react";

interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  helpText: string;
  examples: string[];
}

const categories: Category[] = [
  {
    id: "landing-page",
    title: "Landing Page",
    description: "Enkla one-pagers för produkter, startups och kampanjer",
    icon: FileText,
    helpText:
      "Perfekt för produktlanseringar, startups och kampanjer. En sida med hero-sektion, funktioner, priser och kontaktformulär.",
    examples: ["SaaS-produkter", "App-lansering", "Eventregistrering"],
  },
  {
    id: "website",
    title: "Hemsida",
    description: "Kompletta webbplatser med flera sidor",
    icon: Globe,
    helpText:
      "Komplett webbplats med flera sidor: hem, om oss, tjänster och kontakt. Passar företag och organisationer.",
    examples: ["Företagssajt", "Restaurang", "Konsultbyrå"],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Admin-paneler, statistik och datavisualisering",
    icon: LayoutDashboard,
    helpText:
      "Administratörsgränssnitt med diagram, tabeller och statistik. Perfekt för SaaS-produkter och interna verktyg.",
    examples: ["Försäljningsdata", "Projekthantering", "Analytics"],
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
    router.push(`/category/${categoryId}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
      {categories.map((category) => {
        const Icon: React.ComponentType<{ className?: string }> = category.icon;
        return (
          <Card
            key={category.id}
            onClick={() => handleSelect(category.id)}
            className="group cursor-pointer bg-black/50 border-gray-800 hover:border-teal-500/50 hover:bg-black/70 transition-all duration-300 hover:scale-[1.02]"
          >
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
              {/* Large icon */}
              <div className="p-5 bg-gray-900/50 group-hover:bg-teal-600/20 transition-all duration-300 border border-gray-800 group-hover:border-teal-500/30">
                <Icon className="h-10 w-10 text-gray-300 group-hover:text-teal-400 transition-colors" />
              </div>

              {/* Title and description */}
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white group-hover:text-white flex items-center justify-center gap-2">
                  {category.title}
                  <HelpTooltip text={category.helpText} />
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {category.description}
                </p>
              </div>

              {/* Examples */}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {category.examples.map((example) => (
                  <span
                    key={example}
                    className="text-xs px-2 py-1 bg-gray-800/50 text-gray-500 group-hover:bg-teal-500/10 group-hover:text-teal-300 transition-colors"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
