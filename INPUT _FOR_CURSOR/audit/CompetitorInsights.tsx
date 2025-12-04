'use client';

import { motion } from 'framer-motion';

interface CompetitorInsightsProps {
  insights: {
    industry_standards: string;
    missing_features: string;
    unique_strengths: string;
  };
}

export default function CompetitorInsights({ insights }: CompetitorInsightsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
    >
      <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="text-3xl">🎯</span>
        Konkurrentanalys
      </h3>

      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6"
        >
          <h4 className="text-lg font-bold text-blue-400 mb-3 flex items-center gap-2">
            <span>📊</span>
            Branschstandarder
          </h4>
          <p className="text-gray-300 leading-relaxed">{insights.industry_standards}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6"
        >
          <h4 className="text-lg font-bold text-yellow-400 mb-3 flex items-center gap-2">
            <span>🔍</span>
            Saknade funktioner
          </h4>
          <p className="text-gray-300 leading-relaxed">{insights.missing_features}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-green-500/10 border border-green-500/20 rounded-xl p-6"
        >
          <h4 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
            <span>💎</span>
            Unika styrkor
          </h4>
          <p className="text-gray-300 leading-relaxed">{insights.unique_strengths}</p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-white/10"
      >
        <h4 className="text-lg font-semibold text-white mb-3">Strategisk rekommendation</h4>
        <p className="text-gray-300">
          Baserat på konkurrentanalysen rekommenderar vi att fokusera på era unika styrkor samtidigt som ni
          adresserar de saknade funktionerna. Prioritera de funktioner som är standard i branschen men som
          saknas på er sajt för att säkerställa konkurrenskraft.
        </p>
      </motion.div>
    </motion.div>
  );
}
