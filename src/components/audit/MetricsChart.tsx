"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface MetricsChartProps {
  scores: {
    [key: string]: number;
  };
}

export default function MetricsChart({ scores }: MetricsChartProps) {
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  const getColorForScore = (score: number) => {
    if (score >= 80) return "#22c55e"; // green
    if (score >= 60) return "#4ade80"; // green (matches sajtmaskin theme)
    return "#ef4444"; // red
  };

  const getGradeForScore = (score: number) => {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  };

  const metricLabels: { [key: string]: string } = {
    seo: "SEO",
    technical_seo: "Teknisk SEO",
    ux: "Användarupplevelse",
    content: "Innehåll",
    performance: "Prestanda",
    accessibility: "Tillgänglighet",
    security: "Säkerhet",
    mobile: "Mobilanpassning",
  };

  const averageScore =
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-gray-800 bg-black/50 p-6"
    >
      <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-white">
        <span className="text-brand-teal">📊</span> Poängöversikt
      </h2>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Average Score Circle */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative h-40 w-40">
            <svg className="h-full w-full -rotate-90 transform">
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="12"
                fill="none"
              />
              <motion.circle
                cx="80"
                cy="80"
                r="70"
                stroke={getColorForScore(averageScore)}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(averageScore / 100) * 439.6} 439.6`}
                initial={{ strokeDasharray: "0 439.6" }}
                animate={{
                  strokeDasharray: `${(averageScore / 100) * 439.6} 439.6`,
                }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
                className="text-center"
              >
                <span className="text-4xl font-bold text-white">{Math.round(averageScore)}</span>
                <span className="block text-sm text-gray-400">Snittpoäng</span>
                <span
                  className="text-2xl font-bold"
                  style={{ color: getColorForScore(averageScore) }}
                >
                  {getGradeForScore(averageScore)}
                </span>
              </motion.div>
            </div>
          </div>

          <p className="mt-4 max-w-xs text-center text-sm text-gray-400">
            {averageScore >= 80 && "Utmärkt! Sajten presterar bra."}
            {averageScore >= 60 && averageScore < 80 && "Bra grund med förbättringsmöjligheter."}
            {averageScore < 60 && "Betydande förbättringsmöjligheter."}
          </p>
        </div>

        {/* Individual Metrics */}
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(scores).map(([key, score], index) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredMetric(key)}
              onMouseLeave={() => setHoveredMetric(null)}
              className="relative"
            >
              <div
                className={`border bg-black/30 p-4 transition-all ${
                  hoveredMetric === key ? "border-brand-teal/50 bg-black/50" : "border-gray-800"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">{metricLabels[key] || key}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold" style={{ color: getColorForScore(score) }}>
                      {score}
                    </span>
                    <span className="text-xs text-gray-500">/100</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 w-full overflow-hidden bg-gray-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                    className="h-full"
                    style={{ backgroundColor: getColorForScore(score) }}
                  />
                </div>

                {/* Grade Badge */}
                <div className="absolute -top-2 -right-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8 + index * 0.1, type: "spring" }}
                    className="flex h-8 w-8 items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: getColorForScore(score) }}
                  >
                    {getGradeForScore(score)}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-800 pt-6 text-center">
        <div>
          <p className="text-xl font-bold text-green-400">
            {Object.values(scores).filter((s) => s >= 80).length}
          </p>
          <p className="text-xs text-gray-400">Utmärkta</p>
        </div>
        <div>
          <p className="text-brand-teal text-xl font-bold">
            {Object.values(scores).filter((s) => s >= 60 && s < 80).length}
          </p>
          <p className="text-xs text-gray-400">Godkända</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-400">
            {Object.values(scores).filter((s) => s < 60).length}
          </p>
          <p className="text-xs text-gray-400">Kritiska</p>
        </div>
      </div>
    </motion.div>
  );
}
