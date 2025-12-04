'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

interface Improvement {
  item: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  why?: string;
  how?: string;
  code_example?: string;
  estimated_time?: string;
}

interface ImprovementMatrixProps {
  improvements: Improvement[];
  priorityMatrix?: {
    quick_wins: string[];
    major_projects: string[];
    fill_ins: string[];
    thankless_tasks?: string[];
  };
}

export default function ImprovementMatrix({ improvements, priorityMatrix: _priorityMatrix }: ImprovementMatrixProps) {
  const [selectedImprovement, setSelectedImprovement] = useState<Improvement | null>(null);
  const [hoveredQuadrant, setHoveredQuadrant] = useState<string | null>(null);

  // Map improvements to quadrants
  const getQuadrant = (improvement: Improvement) => {
    const { impact, effort } = improvement;
    if (impact === 'high' && effort === 'low') return 'quick_wins';
    if (impact === 'high' && (effort === 'medium' || effort === 'high')) return 'major_projects';
    if ((impact === 'low' || impact === 'medium') && effort === 'low') return 'fill_ins';
    return 'thankless_tasks';
  };

  const quadrantInfo = {
    quick_wins: {
      label: 'Snabba vinster',
      description: 'Hög påverkan, låg insats',
      color: 'green',
      bgColor: 'bg-green-500/20',
      borderColor: 'border-green-500/30',
      textColor: 'text-green-400',
      emoji: '🚀'
    },
    major_projects: {
      label: 'Stora projekt',
      description: 'Hög påverkan, hög insats',
      color: 'blue',
      bgColor: 'bg-blue-500/20',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-400',
      emoji: '🏗️'
    },
    fill_ins: {
      label: 'Utfyllnad',
      description: 'Låg påverkan, låg insats',
      color: 'yellow',
      bgColor: 'bg-yellow-500/20',
      borderColor: 'border-yellow-500/30',
      textColor: 'text-yellow-400',
      emoji: '✨'
    },
    thankless_tasks: {
      label: 'Undvik',
      description: 'Låg påverkan, hög insats',
      color: 'red',
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-400',
      emoji: '⚠️'
    }
  };

  // Group improvements by quadrant
  const groupedImprovements = improvements.reduce((acc, improvement) => {
    const quadrant = getQuadrant(improvement);
    if (!acc[quadrant]) acc[quadrant] = [];
    acc[quadrant].push(improvement);
    return acc;
  }, {} as Record<string, Improvement[]>);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
      >
        <h3 className="text-2xl font-bold text-white mb-6">Prioriteringsmatris</h3>

        {/* Matrix Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {Object.entries(quadrantInfo).map(([key, info]) => {
            const items = groupedImprovements[key] || [];
            const isHovered = hoveredQuadrant === key;

            return (
              <motion.div
                key={key}
                onMouseEnter={() => setHoveredQuadrant(key)}
                onMouseLeave={() => setHoveredQuadrant(null)}
                className={`relative p-6 rounded-2xl border-2 transition-all cursor-pointer ${
                  info.bgColor
                } ${info.borderColor} ${isHovered ? 'transform scale-105' : ''}`}
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className={`text-lg font-bold ${info.textColor} flex items-center gap-2`}>
                      <span className="text-2xl">{info.emoji}</span>
                      {info.label}
                    </h4>
                    <p className="text-sm text-gray-400 mt-1">{info.description}</p>
                  </div>
                  <div className={`text-3xl font-bold ${info.textColor}`}>
                    {items.length}
                  </div>
                </div>

                {/* Items Preview */}
                <div className="space-y-2">
                  {items.slice(0, 3).map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImprovement(item);
                      }}
                      className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <p className="text-sm text-gray-300 line-clamp-2">{item.item}</p>
                      {item.estimated_time && (
                        <p className="text-xs text-gray-500 mt-1">⏱️ {item.estimated_time}</p>
                      )}
                    </motion.div>
                  ))}
                  {items.length > 3 && (
                    <p className="text-sm text-gray-500 text-center mt-2">
                      +{items.length - 3} fler
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Matrix Visualization */}
        <div className="relative h-96 bg-white/5 rounded-2xl p-8">
          {/* Axes */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-white/20" />
          <div className="absolute left-8 right-8 bottom-8 h-px bg-white/20" />

          {/* Axis Labels */}
          <div className="absolute left-2 top-8 text-sm text-gray-400 -rotate-90 origin-left">
            Påverkan →
          </div>
          <div className="absolute left-8 bottom-2 text-sm text-gray-400">
            Insats →
          </div>

          {/* Quadrant Labels */}
          <div className="absolute inset-8 grid grid-cols-2 grid-rows-2">
            <div className="border-r border-b border-white/10 flex items-center justify-center">
              <span className="text-green-400 text-sm">Snabba vinster</span>
            </div>
            <div className="border-b border-white/10 flex items-center justify-center">
              <span className="text-blue-400 text-sm">Stora projekt</span>
            </div>
            <div className="border-r border-white/10 flex items-center justify-center">
              <span className="text-yellow-400 text-sm">Utfyllnad</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-red-400 text-sm">Undvik</span>
            </div>
          </div>

          {/* Plot improvements as dots */}
          {improvements.map((improvement, index) => {
            const quadrant = getQuadrant(improvement);
            const info = quadrantInfo[quadrant];

            // Calculate position based on impact and effort
            const x = improvement.effort === 'low' ? 25 : improvement.effort === 'medium' ? 50 : 75;
            const y = improvement.impact === 'high' ? 25 : improvement.impact === 'medium' ? 50 : 75;

            return (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.05, type: "spring" }}
                className={`absolute w-3 h-3 rounded-full cursor-pointer ${
                  info.bgColor
                } ${info.borderColor} border-2 hover:scale-150 transition-transform`}
                style={{
                  left: `${x}%`,
                  bottom: `${y}%`,
                  transform: 'translate(-50%, 50%)'
                }}
                onClick={() => setSelectedImprovement(improvement)}
              />
            );
          })}
        </div>
      </motion.div>

      {/* Improvement Detail Modal */}
      <AnimatePresence>
        {selectedImprovement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImprovement(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-white/20 rounded-2xl p-6 max-w-2xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-bold text-white pr-4">{selectedImprovement.item}</h3>
                <button
                  onClick={() => setSelectedImprovement(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className={`px-4 py-2 rounded-lg ${
                    selectedImprovement.impact === 'high' ? 'bg-green-500/20 text-green-400' :
                    selectedImprovement.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    Påverkan: {selectedImprovement.impact}
                  </div>
                  <div className={`px-4 py-2 rounded-lg ${
                    selectedImprovement.effort === 'low' ? 'bg-green-500/20 text-green-400' :
                    selectedImprovement.effort === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    Insats: {selectedImprovement.effort}
                  </div>
                  {selectedImprovement.estimated_time && (
                    <div className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400">
                      ⏱️ {selectedImprovement.estimated_time}
                    </div>
                  )}
                </div>

                {selectedImprovement.why && (
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Varför?</h4>
                    <p className="text-gray-300">{selectedImprovement.why}</p>
                  </div>
                )}

                {selectedImprovement.how && (
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Hur?</h4>
                    <p className="text-gray-300">{selectedImprovement.how}</p>
                  </div>
                )}

                {selectedImprovement.code_example && (
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-2">Kodexempel</h4>
                    <pre className="bg-black/50 p-4 rounded-lg overflow-x-auto">
                      <code className="text-sm text-gray-300">{selectedImprovement.code_example}</code>
                    </pre>
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
