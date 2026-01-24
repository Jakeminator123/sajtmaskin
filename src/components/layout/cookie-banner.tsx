"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Cookie Banner with Playable Pac-Man Game
 *
 * A stylish GDPR-compliant cookie consent banner featuring
 * an actual mini Pac-Man game on the side. Users can play while
 * deciding to accept or decline cookies.
 */

type Position = { x: number; y: number };
type Direction = "left" | "right" | "up" | "down" | null;

// Simple maze layout (0 = wall, 1 = path, 2 = dot)
const MAZE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 0],
  [0, 2, 0, 0, 2, 2, 2, 2, 0, 0, 2, 0],
  [0, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 0],
  [0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0],
  [0, 2, 2, 2, 0, 0, 0, 0, 2, 2, 2, 0],
  [0, 2, 0, 2, 2, 2, 2, 2, 2, 0, 2, 0],
  [0, 2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const CELL_SIZE = 18;
const START_POS: Position = { x: 1, y: 1 };
const COOKIE_POS: Position = { x: 10, y: 7 };

// Ghost positions and colors
const GHOSTS = [
  { start: { x: 5, y: 3 }, color: "#FF0000", name: "Blinky" },
  { start: { x: 6, y: 5 }, color: "#00FFFF", name: "Inky" },
];

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [pacmanPos, setPacmanPos] = useState<Position>(START_POS);
  const [direction, setDirection] = useState<Direction>("right");
  const [score, setScore] = useState(0);
  const [dots, setDots] = useState<Set<string>>(new Set());
  const [hasWon, setHasWon] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(true);
  const [ghosts, setGhosts] = useState(GHOSTS.map((g) => ({ ...g, pos: g.start })));
  const [gameOver, setGameOver] = useState(false);
  const gameRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<Position | null>(null);

  // Initialize dots
  useEffect(() => {
    const initialDots = new Set<string>();
    MAZE.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 2) {
          initialDots.add(`${x},${y}`);
        }
      });
    });
    // Remove start and cookie positions from dots
    initialDots.delete(`${START_POS.x},${START_POS.y}`);
    initialDots.delete(`${COOKIE_POS.x},${COOKIE_POS.y}`);
    setDots(initialDots);
  }, []);

  // Check cookie consent on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cookieConsent = localStorage.getItem("cookie-consent");
    if (!cookieConsent) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Animate mouth
  useEffect(() => {
    if (!gameStarted || hasWon) return;
    const interval = setInterval(() => setMouthOpen((m) => !m), 150);
    return () => clearInterval(interval);
  }, [gameStarted, hasWon]);

  // Move ghosts
  useEffect(() => {
    if (!gameStarted || hasWon || gameOver) return;

    const interval = setInterval(() => {
      setGhosts((prev) =>
        prev.map((ghost) => {
          // Simple AI: try to move towards Pac-Man
          const directions: Direction[] = ["up", "down", "left", "right"];
          const validMoves = directions.filter((dir) => {
            const newPos = getNewPosition(ghost.pos, dir);
            return canMove(newPos);
          });

          if (validMoves.length === 0) return ghost;

          // Prioritize moves that get closer to Pac-Man
          const bestMove = validMoves.reduce((best, move) => {
            const newPos = getNewPosition(ghost.pos, move);
            const bestPos = getNewPosition(ghost.pos, best);
            const newDist = Math.abs(newPos.x - pacmanPos.x) + Math.abs(newPos.y - pacmanPos.y);
            const bestDist = Math.abs(bestPos.x - pacmanPos.x) + Math.abs(bestPos.y - pacmanPos.y);
            return newDist < bestDist ? move : best;
          }, validMoves[0]);

          // Add some randomness so ghosts aren't too smart
          const move =
            Math.random() > 0.3
              ? bestMove
              : validMoves[Math.floor(Math.random() * validMoves.length)];

          return { ...ghost, pos: getNewPosition(ghost.pos, move) };
        }),
      );
    }, 400);

    return () => clearInterval(interval);
  }, [gameStarted, hasWon, gameOver, pacmanPos]);

  // Check ghost collision
  useEffect(() => {
    if (!gameStarted || hasWon || gameOver) return;

    const collision = ghosts.some(
      (ghost) => ghost.pos.x === pacmanPos.x && ghost.pos.y === pacmanPos.y,
    );

    if (collision) {
      setGameOver(true);
      setTimeout(() => {
        // Reset game
        setPacmanPos(START_POS);
        setGhosts(GHOSTS.map((g) => ({ ...g, pos: g.start })));
        setGameOver(false);
        setScore(0);
        // Re-initialize dots
        const initialDots = new Set<string>();
        MAZE.forEach((row, y) => {
          row.forEach((cell, x) => {
            if (cell === 2) initialDots.add(`${x},${y}`);
          });
        });
        initialDots.delete(`${START_POS.x},${START_POS.y}`);
        initialDots.delete(`${COOKIE_POS.x},${COOKIE_POS.y}`);
        setDots(initialDots);
      }, 1500);
    }
  }, [pacmanPos, ghosts, gameStarted, hasWon, gameOver]);

  const getNewPosition = (pos: Position, dir: Direction): Position => {
    switch (dir) {
      case "up":
        return { x: pos.x, y: pos.y - 1 };
      case "down":
        return { x: pos.x, y: pos.y + 1 };
      case "left":
        return { x: pos.x - 1, y: pos.y };
      case "right":
        return { x: pos.x + 1, y: pos.y };
      default:
        return pos;
    }
  };

  const canMove = (pos: Position): boolean => {
    if (pos.y < 0 || pos.y >= MAZE.length) return false;
    if (pos.x < 0 || pos.x >= MAZE[0].length) return false;
    return MAZE[pos.y][pos.x] !== 0;
  };

  const movePacman = useCallback(
    (dir: Direction) => {
      if (!gameStarted || hasWon || gameOver) return;

      setDirection(dir);
      const newPos = getNewPosition(pacmanPos, dir);

      if (canMove(newPos)) {
        setPacmanPos(newPos);

        // Eat dot
        const dotKey = `${newPos.x},${newPos.y}`;
        if (dots.has(dotKey)) {
          setDots((prev) => {
            const next = new Set(prev);
            next.delete(dotKey);
            return next;
          });
          setScore((s) => s + 10);
        }

        // Check win condition
        if (newPos.x === COOKIE_POS.x && newPos.y === COOKIE_POS.y) {
          setHasWon(true);
          setScore((s) => s + 100);
          setTimeout(() => {
            if (typeof window !== "undefined") {
              localStorage.setItem("cookie-consent", "accepted");
              localStorage.setItem("cookie-consent-date", new Date().toISOString());
            }
          }, 500);
          setTimeout(() => setIsVisible(false), 2500);
        }
      }
    },
    [pacmanPos, dots, gameStarted, hasWon, gameOver],
  );

  // Keyboard controls
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!isVisible) return;

      const keyMap: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        w: "up",
        s: "down",
        a: "left",
        d: "right",
      };

      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        if (!gameStarted) setGameStarted(true);
        movePacman(dir);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [movePacman, gameStarted, isVisible]);

  // Touch controls
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;

    const deltaX = e.changedTouches[0].clientX - touchStart.current.x;
    const deltaY = e.changedTouches[0].clientY - touchStart.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (!gameStarted) setGameStarted(true);
      movePacman(deltaX > 0 ? "right" : "left");
    } else if (Math.abs(deltaY) > 10) {
      if (!gameStarted) setGameStarted(true);
      movePacman(deltaY > 0 ? "down" : "up");
    }

    touchStart.current = null;
  };

  const handleAccept = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cookie-consent", "accepted");
      localStorage.setItem("cookie-consent-date", new Date().toISOString());
    }
    setIsVisible(false);
  };

  const handleDecline = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cookie-consent", "declined");
    }
    setIsVisible(false);
  };

  const getRotation = (): number => {
    switch (direction) {
      case "up":
        return -90;
      case "down":
        return 90;
      case "left":
        return 180;
      default:
        return 0;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      {/* Scanlines overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
        }}
      />

      <div
        className="relative w-full max-w-4xl border-2 border-[#1a1aff] bg-[#0a0a0a] shadow-[0_0_60px_rgba(26,26,255,0.3)]"
        style={{ fontFamily: "'Press Start 2P', monospace" }}
      >
        {/* CRT glow effect */}
        <div className="from-brand-blue/5 pointer-events-none absolute inset-0 bg-linear-to-b to-transparent" />

        {/* Layout: Side by side on desktop, stacked on mobile */}
        <div className="flex flex-col lg:flex-row">
          {/* Left side: Cookie consent info and buttons */}
          <div className="flex min-h-[300px] flex-1 flex-col justify-between p-6">
            {/* Header */}
            <div>
              <h2
                className="mb-4 text-xl font-bold md:text-2xl"
                style={{
                  background: "linear-gradient(180deg, #FFE135 0%, #FF9500 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 20px rgba(255,225,53,0.5)",
                }}
              >
                🍪 Cookies
              </h2>

              <p className="mb-4 text-sm leading-relaxed text-gray-300">
                Vi använder cookies för att förbättra din upplevelse på sajten, analysera trafik och
                visa relevant innehåll.
              </p>

              <p className="mb-6 text-xs text-gray-500">
                Du kan läsa mer i vår{" "}
                <a href="/privacy" className="text-brand-blue hover:text-brand-blue/80 underline">
                  integritetspolicy
                </a>
                .
              </p>
            </div>

            {/* Buttons - Always visible and accessible */}
            <div className="space-y-3">
              <button
                onClick={handleAccept}
                className="w-full transform bg-linear-to-r from-green-600 to-green-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/30 transition-all hover:scale-[1.02] hover:from-green-500 hover:to-green-400 active:scale-[0.98]"
              >
                ✓ Acceptera cookies
              </button>

              <button
                onClick={handleDecline}
                className="w-full border border-gray-700 bg-gray-800 px-6 py-3 text-sm font-bold text-gray-300 transition-all hover:border-gray-600 hover:bg-gray-700 hover:text-white"
              >
                ✗ Endast nödvändiga
              </button>
            </div>

            {/* Or play text */}
            <div className="mt-6 border-t border-gray-800 pt-4">
              <p className="text-center text-[10px] text-gray-500">
                💡 Eller spela Pac-Man för att acceptera! →
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="via-brand-blue/50 hidden w-px bg-linear-to-b from-transparent to-transparent lg:block" />
          <div className="via-brand-blue/50 mx-6 h-px bg-linear-to-r from-transparent to-transparent lg:hidden" />

          {/* Right side: Pac-Man game */}
          <div className="p-6">
            {/* Game header */}
            <div className="mb-3 text-center">
              <h3
                className="mb-1 text-sm font-bold"
                style={{
                  background: "linear-gradient(180deg, #FFE135 0%, #FF9500 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {hasWon ? "🎉 GRATTIS!" : gameOver ? "💀 SPÖKENA TOG DIG!" : "🎮 COOKIE QUEST"}
              </h3>
              <p className="text-brand-blue/80 text-[9px]">
                {hasWon
                  ? "Du accepterade cookies!"
                  : gameOver
                    ? "Försöker igen..."
                    : gameStarted
                      ? "Led Pac-Man till kakan! 🍪"
                      : "Piltangenter / WASD / swipa"}
              </p>
            </div>

            {/* Score */}
            <div className="mb-2 flex items-center justify-between text-[9px]">
              <span className="text-white">
                POÄNG: <span className="text-brand-amber">{score}</span>
              </span>
              <span className="text-gray-600">HIGH: 420</span>
            </div>

            {/* Game Board */}
            <div
              ref={gameRef}
              className="border-brand-blue/30 relative mx-auto overflow-hidden border bg-black"
              style={{
                width: MAZE[0].length * CELL_SIZE,
                height: MAZE.length * CELL_SIZE,
                boxShadow: "inset 0 0 30px rgba(26,26,255,0.2)",
              }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Maze walls and dots */}
              {MAZE.map((row, y) =>
                row.map((cell, x) => {
                  const isWall = cell === 0;
                  const hasDot = dots.has(`${x},${y}`);
                  const isCookie = x === COOKIE_POS.x && y === COOKIE_POS.y;

                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`absolute ${isWall ? "bg-[#1a1aff]/40" : ""}`}
                      style={{
                        left: x * CELL_SIZE,
                        top: y * CELL_SIZE,
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        borderRadius: isWall ? "2px" : 0,
                        boxShadow: isWall ? "inset 0 0 4px rgba(26,26,255,0.8)" : "none",
                      }}
                    >
                      {hasDot && !isWall && (
                        <div
                          className="bg-brand-amber absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{ boxShadow: "0 0 4px rgba(255,255,200,0.8)" }}
                        />
                      )}
                      {isCookie && (
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse text-sm"
                          style={{
                            filter: "drop-shadow(0 0 8px rgba(255,200,100,0.8))",
                          }}
                        >
                          🍪
                        </div>
                      )}
                    </div>
                  );
                }),
              )}

              {/* Ghosts */}
              {ghosts.map((ghost, i) => (
                <div
                  key={i}
                  className="absolute transition-all duration-300 ease-linear"
                  style={{
                    left: ghost.pos.x * CELL_SIZE,
                    top: ghost.pos.y * CELL_SIZE,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                  }}
                >
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    {/* Ghost body */}
                    <path
                      d="M50 5 C20 5, 5 30, 5 55 L5 95 L20 80 L35 95 L50 80 L65 95 L80 80 L95 95 L95 55 C95 30, 80 5, 50 5"
                      fill={ghost.color}
                      style={{ filter: `drop-shadow(0 0 4px ${ghost.color})` }}
                    />
                    {/* Eyes */}
                    <ellipse cx="35" cy="45" rx="12" ry="14" fill="white" />
                    <ellipse cx="65" cy="45" rx="12" ry="14" fill="white" />
                    <circle cx="38" cy="48" r="6" fill="#1a1aff" />
                    <circle cx="68" cy="48" r="6" fill="#1a1aff" />
                  </svg>
                </div>
              ))}

              {/* Pac-Man */}
              <div
                className={`absolute transition-all duration-100 ease-linear ${
                  gameOver ? "animate-pulse opacity-50" : ""
                }`}
                style={{
                  left: pacmanPos.x * CELL_SIZE,
                  top: pacmanPos.y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  transform: `rotate(${getRotation()}deg)`,
                }}
              >
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="#FACC15"
                    style={{
                      filter: "drop-shadow(0 0 8px rgba(250,204,21,0.6))",
                    }}
                  />
                  {/* Mouth */}
                  {mouthOpen ? (
                    <path d="M50,50 L95,25 L95,75 Z" fill="#0a0a0a" />
                  ) : (
                    <path d="M50,50 L95,45 L95,55 Z" fill="#0a0a0a" />
                  )}
                  {/* Eye */}
                  <circle cx="55" cy="25" r="6" fill="#0a0a0a" />
                </svg>
              </div>

              {/* Start overlay */}
              {!gameStarted && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="animate-pulse text-center">
                    <p className="text-brand-amber mb-1 text-[9px]">PILTANGENTER</p>
                    <p className="text-brand-blue text-[7px]">ELLER SWIPA</p>
                  </div>
                </div>
              )}

              {/* Win overlay */}
              {hasWon && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center">
                    <p className="mb-1 text-xl">🎮🍪🎉</p>
                    <p className="text-brand-amber animate-pulse text-[9px]">WAKA WAKA!</p>
                    <p className="mt-1 text-[7px] text-green-400">Cookies accepterade!</p>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile controls */}
            <div className="mt-3 flex justify-center gap-1 lg:hidden">
              {["⬆️", "⬇️", "⬅️", "➡️"].map((arrow, i) => (
                <button
                  key={i}
                  className="h-9 w-9 border border-gray-700 bg-gray-900 text-base active:bg-gray-800"
                  onClick={() => {
                    if (!gameStarted) setGameStarted(true);
                    const dirs: Direction[] = ["up", "down", "left", "right"];
                    movePacman(dirs[i]);
                  }}
                >
                  {arrow}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
