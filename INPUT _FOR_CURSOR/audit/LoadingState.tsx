'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

interface LoadingStateProps {
  stage: 'connecting' | 'scraping' | 'analyzing' | 'generating';
  progress?: number;
  onCancel?: () => void;
}

export default function LoadingState({ stage, progress = 0, onCancel }: LoadingStateProps) {
  const [backgroundElements] = useState(() => {
    return Array.from({ length: 5 }, (_, i) => ({
      id: i,
      x: Math.random() * 1920,
      y: Math.random() * 1080
    }));
  });

  const stages = {
    connecting: {
      title: 'Ansluter till webbplatsen',
      description: 'Etablerar säker anslutning...',
      icon: '🔌',
      color: 'blue'
    },
    scraping: {
      title: 'Skannar innehåll',
      description: 'Analyserar sidstruktur och innehåll...',
      icon: '🔍',
      color: 'purple'
    },
    analyzing: {
      title: 'AI-analys pågår',
      description: 'Utför djupgående analys av webbplatsen...',
      icon: '🧠',
      color: 'green'
    },
    generating: {
      title: 'Genererar rapport',
      description: 'Sammanställer resultat och insikter...',
      icon: '📊',
      color: 'yellow'
    }
  };

  const currentStage = stages[stage];
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600'
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {/* Animated Icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", damping: 12, stiffness: 200 }}
        className="relative mb-8"
      >
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            rotate: { duration: 15, repeat: Infinity, ease: "linear" },
            scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }}
          className="absolute inset-0 rounded-full bg-gradient-to-r from-accent/20 to-tertiary/20 blur-3xl"
          style={{ width: 150, height: 150, margin: -25 }}
        />
        <motion.div
          animate={{ 
            y: [0, -12, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 3, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="relative text-7xl"
        >
          {currentStage.icon}
        </motion.div>
      </motion.div>

      {/* Stage Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-bold text-white mb-2">{currentStage.title}</h2>
        <p className="text-gray-400">{currentStage.description}</p>
      </motion.div>

      {/* Progress Bar */}
      <div className="w-full max-w-md">
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>Progress</span>
          <div className="flex items-center gap-2">
            <span>{progress}%</span>
            {progress > 0 && progress < 100 && (
              <span className="text-xs text-gray-600">
                (~{Math.max(1, Math.ceil((100 - progress) / 10))} min kvar)
              </span>
            )}
          </div>
        </div>
        <div className="relative h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ willChange: "width" }}
            className={`absolute left-0 top-0 h-full bg-gradient-to-r ${colorMap[currentStage.color]} rounded-full`}
          >
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full"
              style={{ width: '40%' }}
            />
          </motion.div>
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-full"
          />
        </div>
      </div>

      {/* Stage Steps */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-12 flex gap-8"
      >
        {Object.entries(stages).map(([key, stageInfo], index) => {
          const isActive = key === stage;
          const isPast = Object.keys(stages).indexOf(key) < Object.keys(stages).indexOf(stage);

          return (
            <motion.div
              key={key}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 200, damping: 15 }}
              className={`flex flex-col items-center transition-all ${
                isActive ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-30'
              }`}
            >
              <motion.div 
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mb-2 ${
                  isActive ? 'bg-accent' : isPast ? 'bg-green-500' : 'bg-white/10'
                }`}
                animate={isActive ? {
                  scale: [1, 1.15, 1],
                  boxShadow: [
                    "0 0 0px rgba(59, 130, 246, 0)",
                    "0 0 20px rgba(59, 130, 246, 0.5)",
                    "0 0 0px rgba(59, 130, 246, 0)"
                  ]
                } : {}}
                transition={isActive ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                } : {}}
              >
                {isPast ? '✓' : stageInfo.icon}
              </motion.div>
              <span className="text-xs text-gray-400 text-center max-w-[80px]">
                {stageInfo.title.split(' ')[0]}
              </span>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Cancel Button */}
      {onCancel && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.05, borderColor: "rgba(255, 255, 255, 0.3)" }}
          whileTap={{ scale: 0.95 }}
          onClick={onCancel}
          className="mt-8 px-6 py-2 text-sm text-gray-400 hover:text-white transition-colors border border-white/10 hover:border-white/20 rounded-lg backdrop-blur-sm"
        >
          Avbryt
        </motion.button>
      )}

      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {backgroundElements.map(({ id, x, y }) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.1, 0],
              scale: [0, 2, 0],
              x,
              y
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              delay: id * 2,
              ease: "easeInOut"
            }}
            className="absolute w-64 h-64 bg-accent/10 rounded-full blur-3xl"
          />
        ))}
      </div>
    </div>
  );
}
