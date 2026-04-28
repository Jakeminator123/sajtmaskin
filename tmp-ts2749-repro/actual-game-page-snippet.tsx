"use client";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
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
    return (
        <section ref={heroRef}>
            <Badge>{benefits.length}</Badge>
            <Button>
                <ArrowRight />
                <Target />
                <Gamepad2 />
            </Button>
            <Image src="/x.png" alt="x" width={1} height={1} />
            <Link href="/">link</Link>
        </section>
    );
}
