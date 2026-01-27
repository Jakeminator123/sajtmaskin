'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Play, RotateCcw, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Game constants
const CELL_SIZE = 20;
const GRID_WIDTH = 19;
const GRID_HEIGHT = 21;
const GAME_SPEED = 150;
const GHOST_SPEED = 200;

// Direction constants
const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// Maze layout: 0 = wall, 1 = dot, 2 = empty, 3 = power pellet, 4 = ghost house
const INITIAL_MAZE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,3,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,3,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,0,0],
  [2,2,2,0,1,0,1,1,1,1,1,1,1,0,1,0,2,2,2],
  [0,0,0,0,1,0,1,0,0,4,0,0,1,0,1,0,0,0,0],
  [1,1,1,1,1,1,1,0,4,4,4,0,1,1,1,1,1,1,1],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [2,2,2,0,1,0,1,1,1,1,1,1,1,0,1,0,2,2,2],
  [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,1,0],
  [0,3,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,3,0],
  [0,0,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,0],
  [0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

interface Position {
  x: number;
  y: number;
}

interface Ghost {
  position: Position;
  direction: keyof typeof DIRECTIONS;
  color: string;
  scared: boolean;
}

interface HighScore {
  score: number;
  date: string;
}

export function PacmanGame() {
  const [maze, setMaze] = useState<number[][]>([]);
  const [pacman, setPacman] = useState<Position>({ x: 9, y: 15 });
  const [pacmanDirection, setPacmanDirection] = useState<keyof typeof DIRECTIONS>('RIGHT');
  const [nextDirection, setNextDirection] = useState<keyof typeof DIRECTIONS | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover' | 'won'>('idle');
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [powerMode, setPowerMode] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(true);
  
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const ghostLoopRef = useRef<NodeJS.Timeout | null>(null);
  const powerModeRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load high scores from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pacman-highscores');
    if (saved) {
      setHighScores(JSON.parse(saved));
    }
  }, []);

  // Save high score
  const saveHighScore = useCallback((newScore: number) => {
    const newHighScore: HighScore = {
      score: newScore,
      date: new Date().toLocaleDateString('sv-SE'),
    };
    const updated = [...highScores, newHighScore]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    setHighScores(updated);
    localStorage.setItem('pacman-highscores', JSON.stringify(updated));
  }, [highScores]);

  // Initialize game
  const initGame = useCallback(() => {
    setMaze(INITIAL_MAZE.map(row => [...row]));
    setPacman({ x: 9, y: 15 });
    setPacmanDirection('RIGHT');
    setNextDirection(null);
    setGhosts([
      { position: { x: 9, y: 9 }, direction: 'UP', color: '#ff0000', scared: false },
      { position: { x: 8, y: 9 }, direction: 'UP', color: '#00ffff', scared: false },
      { position: { x: 10, y: 9 }, direction: 'UP', color: '#ffb8ff', scared: false },
      { position: { x: 9, y: 10 }, direction: 'UP', color: '#ffb852', scared: false },
    ]);
    setScore(0);
    setLives(3);
    setPowerMode(false);
  }, []);

  // Start game
  const startGame = () => {
    initGame();
    setGameState('playing');
  };

  // Pause/Resume game
  const togglePause = () => {
    if (gameState === 'playing') {
      setGameState('paused');
    } else if (gameState === 'paused') {
      setGameState('playing');
    }
  };

  // Check if position is valid
  const isValidMove = useCallback((x: number, y: number, currentMaze: number[][]) => {
    // Handle tunnel wrapping
    if (x < 0 || x >= GRID_WIDTH) return true;
    if (y < 0 || y >= GRID_HEIGHT) return false;
    return currentMaze[y][x] !== 0;
  }, []);

  // Move Pac-Man
  const movePacman = useCallback(() => {
    if (gameState !== 'playing') return;

    setPacman(prev => {
      let newDirection = pacmanDirection;
      
      // Try to change to next direction if set
      if (nextDirection) {
        const testX = prev.x + DIRECTIONS[nextDirection].x;
        const testY = prev.y + DIRECTIONS[nextDirection].y;
        if (isValidMove(testX, testY, maze)) {
          newDirection = nextDirection;
          setPacmanDirection(nextDirection);
          setNextDirection(null);
        }
      }

      const dir = DIRECTIONS[newDirection];
      let newX = prev.x + dir.x;
      let newY = prev.y + dir.y;

      // Handle tunnel wrapping
      if (newX < 0) newX = GRID_WIDTH - 1;
      if (newX >= GRID_WIDTH) newX = 0;

      if (!isValidMove(newX, newY, maze)) {
        return prev;
      }

      // Eat dot
      if (maze[newY][newX] === 1) {
        setMaze(prevMaze => {
          const newMaze = prevMaze.map(row => [...row]);
          newMaze[newY][newX] = 2;
          return newMaze;
        });
        setScore(s => s + 10);
      }

      // Eat power pellet
      if (maze[newY][newX] === 3) {
        setMaze(prevMaze => {
          const newMaze = prevMaze.map(row => [...row]);
          newMaze[newY][newX] = 2;
          return newMaze;
        });
        setScore(s => s + 50);
        setPowerMode(true);
        setGhosts(prevGhosts => prevGhosts.map(g => ({ ...g, scared: true })));
        
        // Clear existing power mode timeout
        if (powerModeRef.current) {
          clearTimeout(powerModeRef.current);
        }
        
        // Set new timeout
        powerModeRef.current = setTimeout(() => {
          setPowerMode(false);
          setGhosts(prevGhosts => prevGhosts.map(g => ({ ...g, scared: false })));
        }, 7000);
      }

      return { x: newX, y: newY };
    });

    // Toggle mouth animation
    setMouthOpen(prev => !prev);
  }, [gameState, pacmanDirection, nextDirection, maze, isValidMove]);

  // Move ghosts with simple AI
  const moveGhosts = useCallback(() => {
    if (gameState !== 'playing') return;

    setGhosts(prevGhosts => {
      return prevGhosts.map(ghost => {
        const possibleDirections: (keyof typeof DIRECTIONS)[] = [];
        const opposites: Record<string, string> = {
          UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT'
        };

        // Find valid directions
        (Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]).forEach(dir => {
          const newX = ghost.position.x + DIRECTIONS[dir].x;
          const newY = ghost.position.y + DIRECTIONS[dir].y;
          
          // Don't go back the way we came unless necessary
          if (dir !== opposites[ghost.direction] && isValidMove(newX, newY, maze) && maze[newY]?.[newX] !== 4) {
            possibleDirections.push(dir);
          }
        });

        // If no valid directions, allow going back
        if (possibleDirections.length === 0) {
          (Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]).forEach(dir => {
            const newX = ghost.position.x + DIRECTIONS[dir].x;
            const newY = ghost.position.y + DIRECTIONS[dir].y;
            if (isValidMove(newX, newY, maze)) {
              possibleDirections.push(dir);
            }
          });
        }

        if (possibleDirections.length === 0) return ghost;

        // Choose direction based on AI
        let newDirection: keyof typeof DIRECTIONS;
        
        if (ghost.scared) {
          // Run away from Pac-Man
          newDirection = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
        } else {
          // Chase Pac-Man (simple AI)
          const distances = possibleDirections.map(dir => {
            const newX = ghost.position.x + DIRECTIONS[dir].x;
            const newY = ghost.position.y + DIRECTIONS[dir].y;
            return {
              dir,
              dist: Math.abs(newX - pacman.x) + Math.abs(newY - pacman.y)
            };
          });
          
          // 70% chance to chase, 30% random
          if (Math.random() < 0.7) {
            distances.sort((a, b) => a.dist - b.dist);
            newDirection = distances[0].dir;
          } else {
            newDirection = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
          }
        }

        const dir = DIRECTIONS[newDirection];
        let newX = ghost.position.x + dir.x;
        let newY = ghost.position.y + dir.y;

        // Handle tunnel wrapping for ghosts too
        if (newX < 0) newX = GRID_WIDTH - 1;
        if (newX >= GRID_WIDTH) newX = 0;

        return {
          ...ghost,
          position: { x: newX, y: newY },
          direction: newDirection,
        };
      });
    });
  }, [gameState, maze, pacman, isValidMove]);

  // Check collisions
  useEffect(() => {
    if (gameState !== 'playing') return;

    ghosts.forEach((ghost, index) => {
      if (ghost.position.x === pacman.x && ghost.position.y === pacman.y) {
        if (powerMode && ghost.scared) {
          // Eat ghost
          setScore(s => s + 200);
          setGhosts(prev => {
            const newGhosts = [...prev];
            newGhosts[index] = {
              ...newGhosts[index],
              position: { x: 9, y: 9 },
              scared: false,
            };
            return newGhosts;
          });
        } else {
          // Lose life
          setLives(l => {
            const newLives = l - 1;
            if (newLives <= 0) {
              setGameState('gameover');
              saveHighScore(score);
            } else {
              // Reset positions
              setPacman({ x: 9, y: 15 });
              setPacmanDirection('RIGHT');
              setGhosts([
                { position: { x: 9, y: 9 }, direction: 'UP', color: '#ff0000', scared: false },
                { position: { x: 8, y: 9 }, direction: 'UP', color: '#00ffff', scared: false },
                { position: { x: 10, y: 9 }, direction: 'UP', color: '#ffb8ff', scared: false },
                { position: { x: 9, y: 10 }, direction: 'UP', color: '#ffb852', scared: false },
              ]);
            }
            return newLives;
          });
        }
      }
    });
  }, [pacman, ghosts, gameState, powerMode, score, saveHighScore]);

  // Check win condition
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const dotsRemaining = maze.flat().filter(cell => cell === 1 || cell === 3).length;
    if (dotsRemaining === 0 && maze.length > 0) {
      setGameState('won');
      saveHighScore(score + 1000); // Bonus for winning
    }
  }, [maze, gameState, score, saveHighScore]);

  // Game loop
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = setInterval(movePacman, GAME_SPEED);
      ghostLoopRef.current = setInterval(moveGhosts, GHOST_SPEED);
    }

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      if (ghostLoopRef.current) clearInterval(ghostLoopRef.current);
    };
  }, [gameState, movePacman, moveGhosts]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'playing' && gameState !== 'paused') return;
      
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setNextDirection('UP');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setNextDirection('DOWN');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          setNextDirection('LEFT');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          setNextDirection('RIGHT');
          break;
        case ' ':
          e.preventDefault();
          togglePause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Touch controls
  const handleTouch = (direction: keyof typeof DIRECTIONS) => {
    if (gameState === 'playing') {
      setNextDirection(direction);
    }
  };

  // Draw game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw maze
    maze.forEach((row, y) => {
      row.forEach((cell, x) => {
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        if (cell === 0) {
          // Wall
          ctx.fillStyle = '#4a4a8a';
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          
          // Add 3D effect
          ctx.fillStyle = '#3a3a6a';
          ctx.fillRect(px, py, CELL_SIZE - 2, CELL_SIZE - 2);
          ctx.fillStyle = '#5a5aaa';
          ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        } else if (cell === 1) {
          // Dot
          ctx.fillStyle = '#ffff00';
          ctx.beginPath();
          ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 3) {
          // Power pellet (animated)
          ctx.fillStyle = '#ffff00';
          ctx.beginPath();
          const size = 5 + Math.sin(Date.now() / 200) * 2;
          ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });

    // Draw Pac-Man
    const pacX = pacman.x * CELL_SIZE + CELL_SIZE / 2;
    const pacY = pacman.y * CELL_SIZE + CELL_SIZE / 2;
    
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    
    const mouthAngle = mouthOpen ? 0.25 : 0.05;
    let startAngle = 0;
    let endAngle = 0;
    
    switch (pacmanDirection) {
      case 'RIGHT':
        startAngle = mouthAngle * Math.PI;
        endAngle = (2 - mouthAngle) * Math.PI;
        break;
      case 'LEFT':
        startAngle = (1 + mouthAngle) * Math.PI;
        endAngle = (1 - mouthAngle) * Math.PI;
        break;
      case 'UP':
        startAngle = (1.5 + mouthAngle) * Math.PI;
        endAngle = (1.5 - mouthAngle) * Math.PI;
        break;
      case 'DOWN':
        startAngle = (0.5 + mouthAngle) * Math.PI;
        endAngle = (0.5 - mouthAngle) * Math.PI;
        break;
    }
    
    ctx.arc(pacX, pacY, CELL_SIZE / 2 - 2, startAngle, endAngle);
    ctx.lineTo(pacX, pacY);
    ctx.fill();

    // Draw ghosts
    ghosts.forEach(ghost => {
      const gx = ghost.position.x * CELL_SIZE + CELL_SIZE / 2;
      const gy = ghost.position.y * CELL_SIZE + CELL_SIZE / 2;
      
      // Ghost body
      ctx.fillStyle = ghost.scared ? '#0000ff' : ghost.color;
      ctx.beginPath();
      ctx.arc(gx, gy - 2, CELL_SIZE / 2 - 2, Math.PI, 0);
      ctx.lineTo(gx + CELL_SIZE / 2 - 2, gy + CELL_SIZE / 2 - 4);
      
      // Wavy bottom
      for (let i = 0; i < 3; i++) {
        const waveX = gx + CELL_SIZE / 2 - 2 - (i + 1) * (CELL_SIZE - 4) / 3;
        ctx.quadraticCurveTo(
          waveX + (CELL_SIZE - 4) / 6, 
          gy + CELL_SIZE / 2 - 4 + (i % 2 === 0 ? 4 : -2),
          waveX, 
          gy + CELL_SIZE / 2 - 4
        );
      }
      
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 3, 3, 0, Math.PI * 2);
      ctx.arc(gx + 3, gy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Pupils
      ctx.fillStyle = ghost.scared ? '#ffffff' : '#000000';
      ctx.beginPath();
      const pupilOffsetX = DIRECTIONS[ghost.direction].x * 1.5;
      const pupilOffsetY = DIRECTIONS[ghost.direction].y * 1.5;
      ctx.arc(gx - 3 + pupilOffsetX, gy - 3 + pupilOffsetY, 1.5, 0, Math.PI * 2);
      ctx.arc(gx + 3 + pupilOffsetX, gy - 3 + pupilOffsetY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

  }, [maze, pacman, pacmanDirection, ghosts, mouthOpen]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Score and Lives */}
      <div className="flex w-full max-w-md items-center justify-between rounded-2xl bg-gray-900 px-6 py-4">
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase">Poang</p>
          <p className="font-bold text-2xl text-yellow-400">{score}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase">Liv</p>
          <div className="flex gap-1">
            {Array.from({ length: lives }).map((_, i) => (
              <div key={i} className="h-5 w-5 rounded-full bg-yellow-400" />
            ))}
          </div>
        </div>
        {powerMode && (
          <div className="animate-pulse rounded-full bg-blue-500 px-3 py-1 text-sm font-bold text-white">
            POWER!
          </div>
        )}
      </div>

      {/* Game Canvas */}
      <div className="relative rounded-2xl border-4 border-indigo-900 bg-gray-900 p-2 shadow-2xl">
        <canvas
          ref={canvasRef}
          width={GRID_WIDTH * CELL_SIZE}
          height={GRID_HEIGHT * CELL_SIZE}
          className="rounded-lg"
        />

        {/* Overlay states */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/80">
            <h3 className="mb-4 font-bold text-3xl text-yellow-400">PAC-MAN</h3>
            <Button
              onClick={startGame}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <Play className="mr-2 h-5 w-5" />
              Starta spelet
            </Button>
            <p className="mt-4 text-sm text-gray-400">
              Piltangenter eller WASD for att styra
            </p>
          </div>
        )}

        {gameState === 'paused' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/80">
            <h3 className="mb-4 font-bold text-2xl text-white">PAUSAD</h3>
            <Button
              onClick={togglePause}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <Play className="mr-2 h-5 w-5" />
              Fortsatt
            </Button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/80">
            <h3 className="mb-2 font-bold text-3xl text-red-500">GAME OVER</h3>
            <p className="mb-4 text-xl text-white">Poang: {score}</p>
            <Button
              onClick={startGame}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Spela igen
            </Button>
          </div>
        )}

        {gameState === 'won' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/80">
            <h3 className="mb-2 font-bold text-3xl text-green-400">DU VANN!</h3>
            <p className="mb-4 text-xl text-white">Poang: {score + 1000}</p>
            <Button
              onClick={startGame}
              className="bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Spela igen
            </Button>
          </div>
        )}
      </div>

      {/* Touch Controls */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        <div />
        <Button
          variant="outline"
          size="lg"
          className="h-14 w-14 rounded-xl border-2 border-indigo-400 bg-indigo-950"
          onClick={() => handleTouch('UP')}
        >
          <span className="text-2xl">^</span>
        </Button>
        <div />
        <Button
          variant="outline"
          size="lg"
          className="h-14 w-14 rounded-xl border-2 border-indigo-400 bg-indigo-950"
          onClick={() => handleTouch('LEFT')}
        >
          <span className="text-2xl">{'<'}</span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-14 w-14 rounded-xl border-2 border-indigo-400 bg-indigo-950"
          onClick={() => handleTouch('DOWN')}
        >
          <span className="text-2xl">v</span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-14 w-14 rounded-xl border-2 border-indigo-400 bg-indigo-950"
          onClick={() => handleTouch('RIGHT')}
        >
          <span className="text-2xl">{'>'}</span>
        </Button>
      </div>

      {/* Game Controls */}
      {gameState === 'playing' && (
        <Button
          variant="outline"
          onClick={togglePause}
          className="border-indigo-400 bg-transparent"
        >
          <Pause className="mr-2 h-4 w-4" />
          Pausa
        </Button>
      )}

      {/* High Scores */}
      <div className="w-full max-w-md rounded-2xl border-2 border-indigo-900 bg-gray-900 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          <h3 className="font-bold text-xl text-white">Topplista</h3>
        </div>
        {highScores.length > 0 ? (
          <ol className="space-y-2">
            {highScores.map((hs, index) => (
              <li
                key={`${hs.score}-${hs.date}-${index}`}
                className="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-2"
              >
                <span className="flex items-center gap-3">
                  <span className={`font-bold ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                    #{index + 1}
                  </span>
                  <span className="text-white">{hs.score} poang</span>
                </span>
                <span className="text-sm text-gray-500">{hs.date}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-center text-gray-500">Inga poang annu - bli forsta!</p>
        )}
      </div>
    </div>
  );
}
