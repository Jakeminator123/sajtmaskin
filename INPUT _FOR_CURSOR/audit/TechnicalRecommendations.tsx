'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

interface TechnicalRecommendation {
  area: string;
  current_state: string;
  recommendation: string;
  implementation?: string;
}

interface TechnicalRecommendationsProps {
  recommendations: TechnicalRecommendation[];
}

export default function TechnicalRecommendations({ recommendations }: TechnicalRecommendationsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);

  const getAreaIcon = (area: string) => {
    const areaLower = area.toLowerCase();
    if (areaLower.includes('seo')) return '🔍';
    if (areaLower.includes('performance') || areaLower.includes('prestanda')) return '⚡';
    if (areaLower.includes('security') || areaLower.includes('säkerhet')) return '🔒';
    if (areaLower.includes('mobile') || areaLower.includes('mobil')) return '📱';
    if (areaLower.includes('accessibility') || areaLower.includes('tillgänglighet')) return '♿';
    if (areaLower.includes('ux') || areaLower.includes('design')) return '🎨';
    return '⚙️';
  };

  const copyToClipboard = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(index);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
    >
      <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
        <span className="text-3xl">🔧</span>
        Tekniska rekommendationer
      </h3>

      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-white/20 transition-all"
          >
            <button
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              className="w-full p-6 text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{getAreaIcon(rec.area)}</span>
                  <div>
                    <h4 className="text-lg font-semibold text-white">{rec.area}</h4>
                    <p className="text-sm text-gray-400 mt-1">Nuläge: {rec.current_state}</p>
                  </div>
                </div>
                <motion.svg
                  animate={{ rotate: expandedIndex === index ? 180 : 0 }}
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </motion.svg>
              </div>
            </button>

            <AnimatePresence>
              {expandedIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-white/10"
                >
                  <div className="p-6 space-y-4">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        Rekommendation
                      </h5>
                      <p className="text-gray-300">{rec.recommendation}</p>
                    </div>

                    {rec.implementation && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                            Implementation
                          </h5>
                          <button
                            onClick={() => rec.implementation && copyToClipboard(rec.implementation, index)}
                            className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                          >
                            {copiedCode === index ? (
                              <>
                                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Kopierat!
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Kopiera kod
                              </>
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <pre className="bg-black/50 p-4 rounded-lg overflow-x-auto">
                            <code className="text-sm text-gray-300 font-mono">{rec.implementation}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-white/10"
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">💡</span>
          <h4 className="text-lg font-semibold text-white">Implementeringstips</h4>
        </div>
        <ul className="space-y-2 text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Börja med rekommendationer som har låg komplexitet men hög påverkan</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Testa alla ändringar i en staging-miljö innan produktion</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Dokumentera alla ändringar för framtida referens</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Använd versionskontroll för att enkelt kunna återställa vid behov</span>
          </li>
        </ul>
      </motion.div>
    </motion.div>
  );
}
