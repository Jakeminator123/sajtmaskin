import { LucideIcon, Sparkles } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  label: string;
};

const features: Feature[] = [{ icon: Sparkles, label: "x" }];

export function Page() {
  return <Sparkles />;
}

export { features };
