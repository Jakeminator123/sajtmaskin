"use client";

import { useState, useEffect } from "react";

/**
 * ThinkingSpinner — Phase 3 of the kostnadsfri flow.
 * Full-screen animated overlay shown while generating the prompt + creating the project.
 *
 * Features:
 * - Animated gradient orb with morphing shapes
 * - Rotating phase text messages
 * - Time-based progress indicator
 */

const PHASE_MESSAGES = [
  "Förbereder din upplevelse...",
  "Analyserar företagsinformation...",
  "Bygger grunden för din sajt...",
  "Finputsar detaljerna...",
  "Nästan klar...",
];

interface ThinkingSpinnerProps {
  companyName: string;
}

export function ThinkingSpinner({ companyName }: ThinkingSpinnerProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Rotate messages every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PHASE_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Simulate progress (reaches ~90% then slows down)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev + 0.1;
        if (prev >= 70) return prev + 0.5;
        return prev + 2;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Primary orb */}
        <div
          className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #2dd4bf 0%, #6366f1 50%, #0f172a 100%)",
            animation: "morphOrb 8s ease-in-out infinite, rotateOrb 12s linear infinite",
          }}
        />

        {/* Secondary orb */}
        <div
          className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[60px]"
          style={{
            background: "radial-gradient(circle, #a78bfa 0%, #2dd4bf 60%, transparent 100%)",
            animation: "morphOrb 6s ease-in-out infinite reverse, rotateOrb 10s linear infinite reverse",
          }}
        />

        {/* Particle ring */}
        <div
          className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-teal/10 opacity-40"
          style={{ animation: "rotateOrb 20s linear infinite" }}
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-brand-teal/60" />
          <div className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-purple-400/60" />
          <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-teal/40" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center">
        {/* Company name */}
        <h2 className="mb-6 text-lg font-medium text-gray-400">{companyName}</h2>

        {/* Phase message */}
        <p
          key={messageIndex}
          className="mb-10 text-xl font-light text-white"
          style={{ animation: "fadeInUp 0.5s ease-out" }}
        >
          {PHASE_MESSAGES[messageIndex]}
        </p>

        {/* Progress bar */}
        <div className="mx-auto w-64">
          <div className="h-1 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-linear-to-r from-brand-teal to-purple-400 transition-all duration-300"
              style={{ width: `${Math.min(progress, 95)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes morphOrb {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            transform: translate(-50%, -50%) scale(1);
          }
          25% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
            transform: translate(-50%, -50%) scale(1.05);
          }
          50% {
            border-radius: 50% 60% 30% 60% / 30% 50% 70% 50%;
            transform: translate(-50%, -50%) scale(0.95);
          }
          75% {
            border-radius: 40% 60% 50% 40% / 60% 40% 60% 30%;
            transform: translate(-50%, -50%) scale(1.02);
          }
        }

        @keyframes rotateOrb {
          from { rotate: 0deg; }
          to { rotate: 360deg; }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
