'use client';

import { motion } from 'framer-motion';

interface CompetitorBenchmarkProps {
  benchmarking: {
    industry_leaders: string[];
    common_features: string[];
    differentiation_opportunities: string[];
  };
}

const sections = [
  { key: 'industry_leaders', label: 'Ledande aktörer', icon: '🏆' },
  { key: 'common_features', label: 'Standardfunktioner', icon: '🧩' },
  { key: 'differentiation_opportunities', label: 'Möjligheter att sticka ut', icon: '🚀' },
] as const;

export default function CompetitorBenchmark({ benchmarking }: CompetitorBenchmarkProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">📌</span>
        <h3 className="text-xl font-bold text-white">Benchmark mot branschen</h3>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {sections.map((section) => {
          const values = benchmarking[section.key];
          if (!values || values.length === 0) return null;

          return (
            <motion.div
              key={section.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-white/5 border border-white/10"
            >
              <div className="flex items-center gap-2 mb-3">
                <span>{section.icon}</span>
                <p className="text-sm font-semibold text-gray-300">{section.label}</p>
              </div>
              <ul className="space-y-1 text-sm text-gray-400">
                {values.map((value) => (
                  <li key={value} className="flex items-start gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    <span>{value}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

