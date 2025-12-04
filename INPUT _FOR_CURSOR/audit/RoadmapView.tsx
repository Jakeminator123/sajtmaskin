'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface RoadmapPhase {
  duration?: string;
  deliverables?: string[];
  activities?: string[];
}

interface RoadmapViewProps {
  roadmap: {
    [phase: string]: RoadmapPhase;
  };
}

export default function RoadmapView({ roadmap }: RoadmapViewProps) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  const phases = [
    { key: 'phase_1', label: 'Fas 1', icon: '🏁', color: 'blue' },
    { key: 'phase_2', label: 'Fas 2', icon: '🚀', color: 'purple' },
    { key: 'phase_3', label: 'Fas 3', icon: '⚡', color: 'green' },
    { key: 'launch', label: 'Lansering', icon: '🎉', color: 'yellow' }
  ];

  const getPhaseColor = (color: string) => {
    const colors: { [key: string]: string } = {
      blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
      purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
      green: 'from-green-500/20 to-green-600/20 border-green-500/30',
      yellow: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    };
    return colors[color] || colors.blue;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8">
        <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
          <span className="text-3xl">🗺️</span>
          Implementeringsplan
        </h3>

        {/* Timeline Overview */}
        <div className="relative mb-12">
          <div className="absolute left-0 right-0 top-1/2 h-1 bg-white/10 -translate-y-1/2" />
          <div className="relative flex justify-between">
            {phases.map((phase, index) => {
              const phaseData = roadmap[phase.key];
              if (!phaseData) return null;

              return (
                <motion.button
                  key={phase.key}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1, type: "spring" }}
                  onClick={() => setSelectedPhase(phase.key)}
                  className={`relative z-10 ${
                    selectedPhase === phase.key ? 'scale-110' : ''
                  }`}
                >
                  <div
                    className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all ${
                      selectedPhase === phase.key
                        ? 'bg-accent shadow-xl shadow-accent/50'
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  >
                    {phase.icon}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{phase.label}</p>
                  {phaseData.duration && (
                    <p className="text-xs text-gray-400">{phaseData.duration}</p>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Phase Details */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {phases.map((phase, index) => {
            const phaseData = roadmap[phase.key];
            if (!phaseData) return null;

            return (
              <motion.div
                key={phase.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onMouseEnter={() => setSelectedPhase(phase.key)}
                className={`relative p-6 rounded-2xl border bg-gradient-to-br ${getPhaseColor(phase.color)} hover:scale-105 transition-transform cursor-pointer`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{phase.icon}</span>
                  <div>
                    <h4 className="text-lg font-bold text-white">{phase.label}</h4>
                    {phaseData.duration && (
                      <p className="text-sm text-gray-400">{phaseData.duration}</p>
                    )}
                  </div>
                </div>

                {phaseData.deliverables && phaseData.deliverables.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Leverabler
                    </h5>
                    <ul className="space-y-1">
                      {phaseData.deliverables.slice(0, 3).map((deliverable, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-1">
                          <span className="text-green-400 mt-0.5">✓</span>
                          <span className="line-clamp-2">{deliverable}</span>
                        </li>
                      ))}
                      {phaseData.deliverables.length > 3 && (
                        <li className="text-xs text-gray-500">
                          +{phaseData.deliverables.length - 3} fler
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {phaseData.activities && phaseData.activities.length > 0 && (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Aktiviteter
                    </h5>
                    <ul className="space-y-1">
                      {phaseData.activities.slice(0, 2).map((activity, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-1">
                          <span className="text-blue-400 mt-0.5">•</span>
                          <span className="line-clamp-2">{activity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Selected Phase Details */}
      {selectedPhase && roadmap[selectedPhase] && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8"
        >
          <h4 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">
              {phases.find(p => p.key === selectedPhase)?.icon}
            </span>
            {phases.find(p => p.key === selectedPhase)?.label} - Detaljerad översikt
          </h4>

          <div className="grid md:grid-cols-2 gap-8">
            {roadmap[selectedPhase].deliverables && (
              <div>
                <h5 className="text-lg font-semibold text-gray-300 mb-4">Leverabler</h5>
                <ul className="space-y-3">
                  {roadmap[selectedPhase].deliverables?.map((deliverable, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span className="text-gray-300">{deliverable}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}

            {roadmap[selectedPhase].activities && (
              <div>
                <h5 className="text-lg font-semibold text-gray-300 mb-4">Aktiviteter</h5>
                <ul className="space-y-3">
                  {roadmap[selectedPhase].activities?.map((activity, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      <span className="text-blue-400 mt-0.5">→</span>
                      <span className="text-gray-300">{activity}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Success Criteria */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="backdrop-blur-xl bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-white/10 rounded-3xl p-8"
      >
        <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          Framgångskriterier
        </h4>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-4xl mb-2">📈</div>
            <h5 className="font-semibold text-white mb-1">Ökad konvertering</h5>
            <p className="text-sm text-gray-400">Minst 25% förbättring</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-2">⚡</div>
            <h5 className="font-semibold text-white mb-1">Snabbare laddningstid</h5>
            <p className="text-sm text-gray-400">Under 3 sekunder</p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-2">♿</div>
            <h5 className="font-semibold text-white mb-1">Tillgänglighet</h5>
            <p className="text-sm text-gray-400">WCAG AA-standard</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
