"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useAvatar } from "@/contexts/AvatarContext";

interface PongGameProps {
  compact?: boolean;
}

export function PongGame({ compact = false }: PongGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const animationRef = useRef<number | null>(null);

  // Avatar reacts to playing game
  const { triggerReaction } = useAvatar();

  // Game state refs (to avoid re-renders)
  const gameState = useRef({
    ball: { x: 150, y: 100, vx: 3, vy: 2, radius: 6 },
    playerPaddle: { y: 70, height: 40, width: 8 },
    aiPaddle: { y: 70, height: 40, width: 8 },
    canvasWidth: compact ? 280 : 320,
    canvasHeight: compact ? 160 : 200,
    paddleSpeed: 4,
    maxScore: 5,
  });

  const resetBall = useCallback(() => {
    const { canvasWidth, canvasHeight } = gameState.current;
    gameState.current.ball = {
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      vx: (Math.random() > 0.5 ? 1 : -1) * 3,
      vy: (Math.random() - 0.5) * 4,
      radius: 6,
    };
  }, []);

  const resetGame = useCallback(() => {
    setScore({ player: 0, ai: 0 });
    resetBall();
    gameState.current.playerPaddle.y = gameState.current.canvasHeight / 2 - 20;
    gameState.current.aiPaddle.y = gameState.current.canvasHeight / 2 - 20;
    setGameStarted(true);
    setIsPaused(false);
    // Avatar gets excited when user starts playing
    triggerReaction("user_playing_game", "Kör hårt! 🎮");
  }, [resetBall, triggerReaction]);

  // Mouse/touch control
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const paddleHeight = gameState.current.playerPaddle.height;
      const canvasHeight = gameState.current.canvasHeight;

      gameState.current.playerPaddle.y = Math.max(
        0,
        Math.min(canvasHeight - paddleHeight, relativeY - paddleHeight / 2)
      );
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientY);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (!gameStarted || isPaused) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gameLoop = () => {
      const { ball, playerPaddle, aiPaddle, canvasWidth, canvasHeight } =
        gameState.current;

      // Clear canvas
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw center line
      ctx.strokeStyle = "#333";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, 0);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // AI movement (follows ball with some delay)
      const aiCenter = aiPaddle.y + aiPaddle.height / 2;
      const diff = ball.y - aiCenter;
      if (Math.abs(diff) > 10) {
        aiPaddle.y += diff > 0 ? 2.5 : -2.5;
      }
      aiPaddle.y = Math.max(
        0,
        Math.min(canvasHeight - aiPaddle.height, aiPaddle.y)
      );

      // Ball movement
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Ball collision with top/bottom
      if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= canvasHeight) {
        ball.vy *= -1;
        ball.y = Math.max(
          ball.radius,
          Math.min(canvasHeight - ball.radius, ball.y)
        );
      }

      // Ball collision with paddles
      // Player paddle (left)
      if (
        ball.x - ball.radius <= playerPaddle.width + 10 &&
        ball.y >= playerPaddle.y &&
        ball.y <= playerPaddle.y + playerPaddle.height &&
        ball.vx < 0
      ) {
        ball.vx *= -1.1; // Speed up slightly
        ball.vx = Math.min(ball.vx, 8); // Cap speed
        const hitPos =
          (ball.y - playerPaddle.y - playerPaddle.height / 2) /
          (playerPaddle.height / 2);
        ball.vy = hitPos * 4;
      }

      // AI paddle (right)
      if (
        ball.x + ball.radius >= canvasWidth - aiPaddle.width - 10 &&
        ball.y >= aiPaddle.y &&
        ball.y <= aiPaddle.y + aiPaddle.height &&
        ball.vx > 0
      ) {
        ball.vx *= -1.1;
        ball.vx = Math.max(ball.vx, -8);
        const hitPos =
          (ball.y - aiPaddle.y - aiPaddle.height / 2) / (aiPaddle.height / 2);
        ball.vy = hitPos * 4;
      }

      // Score
      if (ball.x < 0) {
        setScore((prev) => ({ ...prev, ai: prev.ai + 1 }));
        resetBall();
      } else if (ball.x > canvasWidth) {
        setScore((prev) => ({ ...prev, player: prev.player + 1 }));
        resetBall();
      }

      // Draw paddles
      ctx.fillStyle = "#14b8a6"; // teal-500
      ctx.fillRect(10, playerPaddle.y, playerPaddle.width, playerPaddle.height);

      ctx.fillStyle = "#f97316"; // orange-500
      ctx.fillRect(
        canvasWidth - aiPaddle.width - 10,
        aiPaddle.y,
        aiPaddle.width,
        aiPaddle.height
      );

      // Draw ball with glow
      ctx.shadowColor = "#14b8a6";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw score
      ctx.fillStyle = "#666";
      ctx.font = compact ? "16px monospace" : "20px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${score.player}`, canvasWidth / 2 - 30, compact ? 20 : 25);
      ctx.fillText(`${score.ai}`, canvasWidth / 2 + 30, compact ? 20 : 25);

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameStarted, isPaused, resetBall, score.player, score.ai, compact]);

  // Check for winner
  useEffect(() => {
    if (score.player >= gameState.current.maxScore) {
      setIsPaused(true);
    } else if (score.ai >= gameState.current.maxScore) {
      setIsPaused(true);
    }
  }, [score]);

  const isGameOver =
    score.player >= gameState.current.maxScore ||
    score.ai >= gameState.current.maxScore;
  const winner =
    score.player >= gameState.current.maxScore ? "Du vann! 🎉" : "AI vann! 🤖";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={gameState.current.canvasWidth}
          height={gameState.current.canvasHeight}
          className="border border-gray-700 rounded cursor-none bg-[#0a0a0a]"
        />

        {/* Start screen */}
        {!gameStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
            <div className="text-center space-y-3">
              <div className="text-2xl">🏓</div>
              <p className="text-gray-300 text-sm font-medium">Pong</p>
              <p className="text-gray-500 text-xs">
                Flytta musen för att spela
              </p>
              <Button
                size="sm"
                onClick={resetGame}
                className="bg-teal-600 hover:bg-teal-500"
              >
                <Play className="h-3 w-3 mr-1" />
                Starta
              </Button>
            </div>
          </div>
        )}

        {/* Game over screen */}
        {isGameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
            <div className="text-center space-y-3">
              <p className="text-gray-200 font-bold">{winner}</p>
              <p className="text-gray-500 text-sm">
                {score.player} - {score.ai}
              </p>
              <Button
                size="sm"
                onClick={resetGame}
                className="bg-teal-600 hover:bg-teal-500"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Spela igen
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {gameStarted && !isGameOver && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsPaused(!isPaused)}
            className="h-7 px-2 text-xs border-gray-700"
          >
            {isPaused ? (
              <>
                <Play className="h-3 w-3 mr-1" /> Fortsätt
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 mr-1" /> Paus
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetGame}
            className="h-7 px-2 text-xs border-gray-700"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Börja om
          </Button>
        </div>
      )}
    </div>
  );
}
