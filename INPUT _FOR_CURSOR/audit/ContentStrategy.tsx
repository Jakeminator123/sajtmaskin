'use client';

import { motion } from 'framer-motion';

interface ContentStrategyProps {
  strategy: {
    key_pages: string[];
    content_types: string[];
    seo_foundation: string;
    conversion_paths: string[];
  };
}

export default function ContentStrategy({ strategy }: ContentStrategyProps) {
  const renderList = (items?: string[], label?: string) => {
    if (!items || items.length === 0 || !label) return null;
    return (
      <div>
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</h4>
        <ul className="space-y-1 text-sm text-gray-300">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-accent mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">📝</span>
        <h3 className="text-xl font-bold text-white">Innehållsstrategi</h3>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {renderList(strategy.key_pages, 'Nyckelsidor')}
        {renderList(strategy.content_types, 'Innehållstyper')}
      </div>
      {strategy.seo_foundation && (
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-white/10">
          <p className="text-sm uppercase tracking-wider text-gray-400 mb-2">SEO-grund</p>
          <p className="text-gray-200">{strategy.seo_foundation}</p>
        </div>
      )}
      {renderList(strategy.conversion_paths, 'Konverteringsflöden')}
    </motion.div>
  );
}

