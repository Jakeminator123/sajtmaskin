"use client";
import { LucideIcon, ArrowRight, Target, TimerReset, Trophy } from "lucide-react";
import { useRef } from "react";
import { Gamepad as Gamepad2, Sparkles } from "lucide-react";

type Benefit = {
    icon: LucideIcon;
    title: string;
    text: string;
};

const benefits: Benefit[] = [
    { icon: Trophy, title: "x", text: "y" },
    { icon: TimerReset, title: "x", text: "y" },
    { icon: Sparkles, title: "x", text: "y" },
];

export default function GamePage() {
    const heroRef = useRef<HTMLElement>(null);
    return (<section ref={heroRef}>
        {benefits.length}
        <ArrowRight />
        <Target />
        <Gamepad2 />
    </section>);
}
