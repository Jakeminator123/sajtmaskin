"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { Improvement } from "@/types/audit";

interface ImprovementsListProps {
  improvements: Improvement[];
}

export default function ImprovementsList({ improvements }: ImprovementsListProps) {
  const [selectedImprovement, setSelectedImprovement] = useState<Improvement | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "bg-brand-amber/20 text-brand-amber border-brand-amber/30";
      case "medium":
        return "bg-brand-teal/20 text-brand-teal border-brand-teal/30";
      case "low":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const getEffortColor = (effort: string) => {
    switch (effort) {
      case "low":
        return "bg-brand-teal/20 text-brand-teal";
      case "medium":
        return "bg-brand-amber/20 text-brand-amber";
      case "high":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const filteredImprovements =
    filter === "all" ? improvements : improvements.filter((i) => i.impact === filter);

  // Sort by impact (high first)
  const sortedImprovements = [...filteredImprovements].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.impact] ?? 3) - (order[b.impact] ?? 3);
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-gray-800 bg-black/50 p-6"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <span className="text-brand-teal">✨</span> Förbättringsförslag
          </h2>

          {/* Filter */}
          <div className="flex gap-2">
            {(["all", "high", "medium", "low"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs transition-colors ${
                  filter === f
                    ? "bg-brand-teal/20 text-brand-teal border-brand-teal/30 border"
                    : "border border-gray-700 bg-black/30 text-gray-400 hover:border-gray-600"
                }`}
              >
                {f === "all" ? "Alla" : f === "high" ? "Hög" : f === "medium" ? "Medium" : "Låg"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {sortedImprovements.map((improvement, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedImprovement(improvement)}
              className="hover:border-brand-teal/30 group cursor-pointer border border-gray-800 bg-black/30 p-4 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="group-hover:text-brand-teal font-medium text-white transition-colors">
                    {improvement.item}
                  </h4>
                  {improvement.why && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-400">{improvement.why}</p>
                  )}
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <span className={`px-2 py-1 text-xs ${getImpactColor(improvement.impact)}`}>
                    {improvement.impact === "high"
                      ? "Hög"
                      : improvement.impact === "medium"
                        ? "Medium"
                        : "Låg"}{" "}
                    påverkan
                  </span>
                  <span className={`px-2 py-1 text-xs ${getEffortColor(improvement.effort)}`}>
                    {improvement.effort === "low"
                      ? "Liten"
                      : improvement.effort === "medium"
                        ? "Medium"
                        : "Stor"}{" "}
                    insats
                  </span>
                </div>
              </div>

              {improvement.estimated_time && (
                <p className="mt-2 text-xs text-gray-500">⏱️ {improvement.estimated_time}</p>
              )}
            </motion.div>
          ))}
        </div>

        {sortedImprovements.length === 0 && (
          <p className="py-8 text-center text-gray-500">
            Inga förbättringsförslag med vald prioritet.
          </p>
        )}
      </motion.div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedImprovement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setSelectedImprovement(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-h-[80vh] w-full max-w-2xl overflow-y-auto border border-gray-800 bg-black p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-start justify-between">
                <h3 className="pr-4 text-xl font-bold text-white">{selectedImprovement.item}</h3>
                <button
                  onClick={() => setSelectedImprovement(null)}
                  className="p-1 text-gray-400 transition-colors hover:text-white"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <span
                    className={`px-3 py-1.5 text-sm ${getImpactColor(selectedImprovement.impact)}`}
                  >
                    Påverkan: {selectedImprovement.impact}
                  </span>
                  <span
                    className={`px-3 py-1.5 text-sm ${getEffortColor(selectedImprovement.effort)}`}
                  >
                    Insats: {selectedImprovement.effort}
                  </span>
                  {selectedImprovement.estimated_time && (
                    <span className="bg-brand-blue/20 text-brand-blue px-3 py-1.5 text-sm">
                      ⏱️ {selectedImprovement.estimated_time}
                    </span>
                  )}
                </div>

                {selectedImprovement.why && (
                  <div>
                    <h4 className="text-brand-teal mb-2 text-sm font-semibold">Varför?</h4>
                    <p className="text-sm text-gray-300">{selectedImprovement.why}</p>
                  </div>
                )}

                {selectedImprovement.how && (
                  <div>
                    <h4 className="text-brand-teal mb-2 text-sm font-semibold">Hur?</h4>
                    <p className="text-sm text-gray-300">{selectedImprovement.how}</p>
                  </div>
                )}

                {selectedImprovement.technologies &&
                  selectedImprovement.technologies.length > 0 && (
                    <div>
                      <h4 className="text-brand-teal mb-2 text-sm font-semibold">Tekniker</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedImprovement.technologies.map((tech, i) => (
                          <span key={i} className="bg-gray-800 px-2 py-1 text-xs text-gray-300">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
