'use client';

import { motion } from 'framer-motion';

interface DesignDirectionProps {
  direction: {
    style: string;
    color_psychology: string;
    ui_patterns: string[];
    accessibility_level: string;
  };
}

export default function DesignDirection({ direction }: DesignDirectionProps) {
  const patternList = direction.ui_patterns || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🎨</span>
        <h3 className="text-xl font-bold text-white">Designriktning</h3>
      </div>
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Stil</p>
            <p className="text-gray-200 font-medium">{direction.style}</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Färgpsykologi</p>
            <p className="text-gray-200 font-medium">{direction.color_psychology}</p>
          </div>
        </div>
        {patternList.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Rekommenderade UI-mönster</p>
            <div className="flex flex-wrap gap-2">
              {patternList.map((pattern) => (
                <span
                  key={pattern}
                  className="px-3 py-1 rounded-full text-sm bg-white/10 border border-white/10 text-gray-200"
                >
                  {pattern}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-white/10">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Tillgänglighet</p>
          <p className="text-gray-200 font-medium">{direction.accessibility_level}</p>
        </div>
      </div>
    </motion.div>
  );
}

