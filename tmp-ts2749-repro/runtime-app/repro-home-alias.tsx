"use client";
import { Circle as LucideIcon, Flame, Leaf, MapPin, ArrowRight, TimerReset, Sparkles, Clock3, Star } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
};

const features: Feature[] = [{ icon: Flame, title: "x" }];

export default function Home() {
  return <div>{features.length}<LucideIcon /><Leaf /><MapPin /><ArrowRight /><TimerReset /><Sparkles /><Clock3 /><Star /></div>;
}
