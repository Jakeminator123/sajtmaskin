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
  const [ghosts, setGhosts] = useState(
    GHOSTS.map((g) => ({ ...g, pos: g.start }))
  );
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
            const newDist =
              Math.abs(newPos.x - pacmanPos.x) +
              Math.abs(newPos.y - pacmanPos.y);
            const bestDist =
              Math.abs(bestPos.x - pacmanPos.x) +
              Math.abs(bestPos.y - pacmanPos.y);
            return newDist < bestDist ? move : best;
          }, validMoves[0]);

          // Add some randomness so ghosts aren't too smart
          const move =
            Math.random() > 0.3
              ? bestMove
              : validMoves[Math.floor(Math.random() * validMoves.length)];

          return { ...ghost, pos: getNewPosition(ghost.pos, move) };
        })
      );
    }, 400);

    return () => clearInterval(interval);
  }, [gameStarted, hasWon, gameOver, pacmanPos]);

  // Check ghost collision
  useEffect(() => {
    if (!gameStarted || hasWon || gameOver) return;

    const collision = ghosts.some(
      (ghost) => ghost.pos.x === pacmanPos.x && ghost.pos.y === pacmanPos.y
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
              localStorage.setItem(
                "cookie-consent-date",
                new Date().toISOString()
              );
            }
          }, 500);
          setTimeout(() => setIsVisible(false), 2500);
        }
      }
    },
    [pacmanPos, dots, gameStarted, hasWon, gameOver]
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
        }}
      />

      <div
        className="relative bg-[#0a0a0a] border-2 border-[#1a1aff] shadow-[0_0_60px_rgba(26,26,255,0.3)] max-w-4xl w-full"
        style={{ fontFamily: "'Press Start 2P', monospace" }}
      >
        {/* CRT glow effect */}
        <div className="absolute inset-0 bg-linear-to-b from-brand-blue/5 to-transparent pointer-events-none" />

        {/* Layout: Side by side on desktop, stacked on mobile */}
        <div className="flex flex-col lg:flex-row">
          {/* Left side: Cookie consent info and buttons */}
          <div className="flex-1 p-6 flex flex-col justify-between min-h-[300px]">
            {/* Header */}
            <div>
              <h2
                className="text-xl md:text-2xl font-bold mb-4"
                style={{
                  background:
                    "linear-gradient(180deg, #FFE135 0%, #FF9500 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "0 0 20px rgba(255,225,53,0.5)",
                }}
              >
                🍪 Cookies
              </h2>

              <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                Vi använder cookies för att förbättra din upplevelse på sajten,
                analysera trafik och visa relevant innehåll.
              </p>

              <p className="text-xs text-gray-500 mb-6">
                Du kan läsa mer i vår{" "}
                <a
                  href="/privacy"
                  className="text-brand-blue hover:text-brand-blue/80 underline"
                >
                  integritetspolicy
                </a>
                .
              </p>
            </div>

            {/* Buttons - Always visible and accessible */}
            <div className="space-y-3">
              <button
                onClick={handleAccept}
                className="w-full py-3 px-6 bg-linear-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-500/30"
              >
                ✓ Acceptera cookies
              </button>

              <button
                onClick={handleDecline}
                className="w-full py-3 px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold text-sm transition-all border border-gray-700 hover:border-gray-600"
              >
                ✗ Endast nödvändiga
              </button>
            </div>

            {/* Or play text */}
            <div className="mt-6 pt-4 border-t border-gray-800">
              <p className="text-[10px] text-gray-500 text-center">
                💡 Eller spela Pac-Man för att acceptera! →
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px bg-linear-to-b from-transparent via-brand-blue/50 to-transparent" />
          <div className="lg:hidden h-px bg-linear-to-r from-transparent via-brand-blue/50 to-transparent mx-6" />

          {/* Right side: Pac-Man game */}
          <div className="p-6">
            {/* Game header */}
            <div className="text-center mb-3">
              <h3
                className="text-sm font-bold mb-1"
                style={{
                  background:
                    "linear-gradient(180deg, #FFE135 0%, #FF9500 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {hasWon
                  ? "🎉 GRATTIS!"
                  : gameOver
                    ? "💀 SPÖKENA TOG DIG!"
                    : "🎮 COOKIE QUEST"}
              </h3>
              <p className="text-[9px] text-brand-blue/80">
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
            <div className="flex justify-between items-center mb-2 text-[9px]">
              <span className="text-white">
                POÄNG: <span className="text-brand-amber">{score}</span>
              </span>
              <span className="text-gray-600">HIGH: 420</span>
            </div>

            {/* Game Board */}
            <div
              ref={gameRef}
              className="relative mx-auto bg-black border border-brand-blue/30 overflow-hidden"
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
                        boxShadow: isWall
                          ? "inset 0 0 4px rgba(26,26,255,0.8)"
                          : "none",
                      }}
                    >
                      {hasDot && !isWall && (
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-brand-amber rounded-full"
                          style={{ boxShadow: "0 0 4px rgba(255,255,200,0.8)" }}
                        />
                      )}
                      {isCookie && (
                        <div
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm animate-pulse"
                          style={{
                            filter:
                              "drop-shadow(0 0 8px rgba(255,200,100,0.8))",
                          }}
                        >
                          🍪
                        </div>
                      )}
                    </div>
                  );
                })
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
                  <svg viewBox="0 0 100 100" className="w-full h-full">
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
                className={`absolute transition-all duration-100 ease-linear ${gameOver ? "animate-pulse opacity-50" : ""
                  }`}
                style={{
                  left: pacmanPos.x * CELL_SIZE,
                  top: pacmanPos.y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  transform: `rotate(${getRotation()}deg)`,
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
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
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center animate-pulse">
                    <p className="text-brand-amber text-[9px] mb-1">
                      PILTANGENTER
                    </p>
                    <p className="text-brand-blue text-[7px]">ELLER SWIPA</p>
                  </div>
                </div>
              )}

              {/* Win overlay */}
              {hasWon && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xl mb-1">🎮🍪🎉</p>
                    <p className="text-brand-amber text-[9px] animate-pulse">
                      WAKA WAKA!
                    </p>
                    <p className="text-green-400 text-[7px] mt-1">
                      Cookies accepterade!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile controls */}
            <div className="flex justify-center gap-1 mt-3 lg:hidden">
              {["⬆️", "⬇️", "⬅️", "➡️"].map((arrow, i) => (
                <button
                  key={i}
                  className="w-9 h-9 bg-gray-900 border border-gray-700 text-base active:bg-gray-800"
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
