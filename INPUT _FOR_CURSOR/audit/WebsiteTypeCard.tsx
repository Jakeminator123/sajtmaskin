'use client';

import { motion } from 'framer-motion';

interface WebsiteTypeCardProps {
  recommendation: string;
}

export default function WebsiteTypeCard({ recommendation }: WebsiteTypeCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-white/20 rounded-3xl p-8"
    >
      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl" role="img" aria-label="Plan">
          🧭
        </span>
        <div>
          <p className="text-sm uppercase tracking-wider text-gray-400">Strategiskt fokus</p>
          <h3 className="text-2xl font-bold text-white">Rekommenderad webbplats</h3>
        </div>
      </div>
      <p className="text-gray-200 leading-relaxed">{recommendation}</p>
    </motion.div>
  );
}

