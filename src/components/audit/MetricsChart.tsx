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
    if (score >= 60) return "#14b8a6"; // teal (matches sajtmaskin theme)
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
    Object.values(scores).reduce((a, b) => a + b, 0) /
    Object.values(scores).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-gray-800 p-6"
    >
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="text-teal-400">📊</span> Poängöversikt
      </h2>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Average Score Circle */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90">
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
                <span className="text-4xl font-bold text-white">
                  {Math.round(averageScore)}
                </span>
                <span className="text-sm text-gray-400 block">Snittpoäng</span>
                <span
                  className="text-2xl font-bold"
                  style={{ color: getColorForScore(averageScore) }}
                >
                  {getGradeForScore(averageScore)}
                </span>
              </motion.div>
            </div>
          </div>

          <p className="text-gray-400 text-center mt-4 text-sm max-w-xs">
            {averageScore >= 80 && "Utmärkt! Sajten presterar bra."}
            {averageScore >= 60 &&
              averageScore < 80 &&
              "Bra grund med förbättringsmöjligheter."}
            {averageScore < 60 && "Betydande förbättringsmöjligheter."}
          </p>
        </div>

        {/* Individual Metrics */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                className={`p-4 bg-black/30 border transition-all ${
                  hoveredMetric === key
                    ? "border-teal-500/50 bg-black/50"
                    : "border-gray-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-white text-sm">
                    {metricLabels[key] || key}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xl font-bold"
                      style={{ color: getColorForScore(score) }}
                    >
                      {score}
                    </span>
                    <span className="text-xs text-gray-500">/100</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-gray-800 overflow-hidden">
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
                    className="w-8 h-8 flex items-center justify-center font-bold text-white text-sm"
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
      <div className="mt-6 pt-6 border-t border-gray-800 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xl font-bold text-green-400">
            {Object.values(scores).filter((s) => s >= 80).length}
          </p>
          <p className="text-xs text-gray-400">Utmärkta</p>
        </div>
        <div>
          <p className="text-xl font-bold text-teal-400">
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
