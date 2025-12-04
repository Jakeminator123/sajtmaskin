'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface Audit3DVisualizationProps {
  scores?: {
    seo?: number;
    ux?: number;
    performance?: number;
    accessibility?: number;
    security?: number;
    [key: string]: number | undefined;
  };
  className?: string;
}

export default function Audit3DVisualization({ scores, className = '' }: Audit3DVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);

  // Mouse tracking for 3D rotation
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth spring animations
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [15, -15]), {
    stiffness: 150,
    damping: 15,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-15, 15]), {
    stiffness: 150,
    damping: 15,
  });

  // Default scores if not provided
  const defaultScores = {
    seo: 75,
    ux: 80,
    performance: 70,
    accessibility: 85,
    security: 90,
  };

  const auditScores = scores || defaultScores;
  const scoreEntries = Object.entries(auditScores)
    .filter(([_, value]) => typeof value === 'number' && value >= 0 && value <= 100)
    .slice(0, 8); // Limit to 8 cards max for better performance and layout

  useEffect(() => {
    // Use requestAnimationFrame to avoid setState in effect warning
    // Only run on client side
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        setMounted(true);
        setWindowWidth(window.innerWidth);
      });
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    // On server, mounted stays false (component won't render anyway)
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !mounted) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Normalize to -0.5 to 0.5 range for smoother rotation
    const x = Math.max(-0.5, Math.min(0.5, (e.clientX - centerX) / rect.width));
    const y = Math.max(-0.5, Math.min(0.5, (e.clientY - centerY) / rect.height));

    mouseX.set(x);
    mouseY.set(y);
  };

  // Touch support for mobile
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current || !mounted) return;
    const touch = e.touches[0];
    if (!touch) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const x = Math.max(-0.5, Math.min(0.5, (touch.clientX - centerX) / rect.width));
    const y = Math.max(-0.5, Math.min(0.5, (touch.clientY - centerY) / rect.height));

    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const getScoreColor = (score: number) => {
    // Ensure score is within valid range
    const normalizedScore = Math.max(0, Math.min(100, score));
    if (normalizedScore >= 80) return '#10b981'; // green
    if (normalizedScore >= 60) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  const getScoreLabel = (key: string) => {
    const labels: Record<string, string> = {
      seo: 'SEO',
      ux: 'UX',
      performance: 'Prestanda',
      accessibility: 'Tillgänglighet',
      security: 'Säkerhet',
      content: 'Innehåll',
      technical_seo: 'Teknisk SEO',
      mobile: 'Mobil',
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[500px] md:h-[600px] ${className}`}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={handleMouseLeave}
      style={{
        perspective: '1000px',
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* 3D Container */}
      <motion.div
        className="relative w-full h-full"
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        animate={!isHovered ? {
          rotateY: [0, 360],
        } : {}}
        transition={!isHovered ? {
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        } : {}}
      >
        {/* Central 3D Website Structure */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Main Cube Structure */}
          <motion.div
            className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80"
            style={{
              transformStyle: 'preserve-3d',
            }}
            animate={{
              rotateY: mounted ? 360 : 0,
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            {/* Front Face - Website Preview */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl overflow-hidden"
              style={{
                transform: 'translateZ(80px)',
                transformStyle: 'preserve-3d',
              }}
              whileHover={{ scale: 1.1, z: 20 }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="text-6xl md:text-7xl"
                  animate={{
                    rotateY: [0, 360],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    rotateY: {
                      duration: 10,
                      repeat: Infinity,
                      ease: 'linear',
                    },
                    scale: {
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                >
                  🌐
                </motion.div>
              </div>
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <p className="text-white font-bold text-lg">Webbplats</p>
                <p className="text-white/60 text-xs mt-1">Analys</p>
              </div>
              {/* Animated grid pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: '20px 20px',
                }} />
              </div>
            </motion.div>

            {/* Back Face */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl overflow-hidden"
              style={{
                transform: 'translateZ(-80px) rotateY(180deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="text-6xl md:text-7xl"
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                >
                  📊
                </motion.div>
              </div>
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <p className="text-white font-bold text-lg">Rapport</p>
              </div>
            </motion.div>

            {/* Top Face */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-green-500/20 to-blue-500/20 backdrop-blur-xl"
              style={{
                transform: 'rotateX(90deg) translateZ(80px)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-6xl">⚡</div>
              </div>
            </motion.div>

            {/* Bottom Face */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-xl"
              style={{
                transform: 'rotateX(-90deg) translateZ(80px)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-6xl">🔒</div>
              </div>
            </motion.div>

            {/* Right Face */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-pink-500/20 to-red-500/20 backdrop-blur-xl"
              style={{
                transform: 'rotateY(90deg) translateZ(80px)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-6xl">🎨</div>
              </div>
            </motion.div>

            {/* Left Face */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-white/20 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 backdrop-blur-xl"
              style={{
                transform: 'rotateY(-90deg) translateZ(80px)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-6xl">♿</div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Floating Score Cards around the cube */}
        {scoreEntries.length > 0 ? scoreEntries.map(([key, value], index) => {
          const score = Math.max(0, Math.min(100, value || 0));
          const angle = (index / scoreEntries.length) * Math.PI * 2;
          // Responsive radius based on screen size
          const radius = windowWidth < 640 ? 140 : windowWidth < 768 ? 160 : 200;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = Math.sin(index * 0.5) * 50;

          return (
            <motion.div
              key={key}
              className="absolute w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40"
              style={{
                transform: `translate3d(${x}px, ${y}px, ${z}px)`,
                transformStyle: 'preserve-3d',
                left: '50%',
                top: '50%',
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: mounted ? 1 : 0,
                scale: mounted ? 1 : 0,
                y: [0, -20, 0],
              }}
              transition={{
                opacity: { delay: index * 0.1 },
                scale: { delay: index * 0.1 },
                y: {
                  duration: 2 + index * 0.2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                },
              }}
              whileHover={{ scale: 1.2, z: 50 }}
            >
              <div
                className="relative w-full h-full rounded-2xl border-2 backdrop-blur-xl p-4 flex flex-col items-center justify-center"
                style={{
                  borderColor: `${getScoreColor(score)}40`,
                  background: `linear-gradient(135deg, ${getScoreColor(score)}20, ${getScoreColor(score)}10)`,
                }}
              >
                {/* Score Circle */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-2">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="40%"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="3"
                    />
                    <motion.circle
                      cx="50%"
                      cy="50%"
                      r="40%"
                      fill="none"
                      stroke={getScoreColor(score)}
                      strokeWidth="3"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: Math.max(0, Math.min(1, score / 100)) }}
                      transition={{ duration: 1.5, delay: index * 0.2, ease: 'easeOut' }}
                      strokeDasharray={`${2 * Math.PI * 40}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold text-white">{score}</span>
                  </div>
                </div>
                <p className="text-xs md:text-sm font-semibold text-white/80 text-center">
                  {getScoreLabel(key)}
                </p>
              </div>
            </motion.div>
          );
        }) : (
          // Fallback when no scores available
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="text-center text-white/60">
              <p className="text-xl mb-2">Inga scores tillgängliga</p>
              <p className="text-sm">Väntar på analysresultat...</p>
            </div>
          </motion.div>
        )}

        {/* Energy Beams connecting cards to center */}
        {mounted && scoreEntries.length > 0 && scoreEntries.map(([key, value], index) => {
          const angle = (index / scoreEntries.length) * Math.PI * 2;
          // Responsive radius
          const radius = windowWidth < 640 ? 140 : windowWidth < 768 ? 160 : 200;
          const score = Math.max(0, Math.min(100, value || 0));

          return (
            <motion.div
              key={`beam-${key}`}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: '2px',
                height: `${radius}px`,
                background: `linear-gradient(to bottom, ${getScoreColor(score)}60, transparent)`,
                transform: `translate(-50%, -50%) rotate(${angle * (180 / Math.PI)}deg) translateY(-${radius / 2}px) translateZ(-50px)`,
                transformStyle: 'preserve-3d',
                transformOrigin: 'center bottom',
              }}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scaleY: 1,
              }}
              transition={{
                opacity: {
                  duration: 2,
                  repeat: Infinity,
                  delay: index * 0.2,
                },
                scaleY: {
                  duration: 1,
                  delay: index * 0.1,
                },
              }}
            />
          );
        })}
      </motion.div>

      {/* Ambient Glow Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {scoreEntries.length > 0 && scoreEntries.map(([key, value], index) => {
          const score = Math.max(0, Math.min(100, value || 0));
          const angle = (index / scoreEntries.length) * Math.PI * 2;
          // Responsive radius
          const radius = windowWidth < 640 ? 140 : windowWidth < 768 ? 160 : 200;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;

          return (
            <motion.div
              key={`glow-${key}`}
              className="absolute w-32 h-32 rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${getScoreColor(score)}40, transparent)`,
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${z}px)`,
                marginLeft: '-64px',
                marginTop: '-64px',
              }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2 + index * 0.3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          );
        })}
      </div>

      {/* Instructions */}
      {scoreEntries.length > 0 && (
        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-white/60 text-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <p className="hidden md:block">
            Håll muspekaren över för att rotera i 3D • Hovra över kort för detaljer
          </p>
          <p className="md:hidden">
            Tryck och dra för att rotera • Tryck på kort för detaljer
          </p>
        </motion.div>
      )}
    </div>
  );
}

