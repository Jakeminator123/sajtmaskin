"use client";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  TimerReset,
  Trophy,
} from "lucide-react";



import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type GameStatus = "idle" | "running" | "ended";
type IngredientKind = "lettuce" | "cheese" | "patty" | "tomato";

type Ingredient = {
  id: number;
  lane: number;
  y: number;
  kind: IngredientKind;
};

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 520;
const LANE_COUNT = 4;
const LANE_WIDTH = CANVAS_WIDTH / LANE_COUNT;
const GAME_DURATION = 30;
const PLAYER_Y = CANVAS_HEIGHT - 86;
const STORAGE_KEY = "glod-burger-high-score";

const ingredientPalette: Record<
  IngredientKind,
  { fill: string; stroke: string; label: string }
> = {
  lettuce: { fill: "#48A34D", stroke: "#23612B", label: "Sallad" },
  cheese: { fill: "#F1C232", stroke: "#B78300", label: "Ost" },
  patty: { fill: "#6C3C22", stroke: "#3C1F0F", label: "Patty" },
  tomato: { fill: "#D62828", stroke: "#8C1A1A", label: "Tomat" },
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function randomKind(): IngredientKind {
  const kinds: IngredientKind[] = ["lettuce", "cheese", "patty", "tomato"];
  return kinds[Math.floor(Math.random() * kinds.length)];
}

export default function BurgerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const spawnIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const ingredientIdRef = useRef(0);
  const ingredientsRef = useRef<Ingredient[]>([]);
  const playerLaneRef = useRef(1);
  const scoreRef = useRef(0);
  const timeLeftRef = useRef(GAME_DURATION);
  const highScoreRef = useRef(0);

  const [status, setStatus] = useState<GameStatus>("idle");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [playerLane, setPlayerLane] = useState(1);
  const [highScore, setHighScore] = useState(0);
  const [liveMessage, setLiveMessage] = useState(
    "Tryck på starta spelet och fånga ingredienserna.",
  );

  const clearGameTimers = useCallback(() => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (spawnIntervalRef.current) {
      window.clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }

    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) {
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#24171B");
    gradient.addColorStop(1, "#130C10");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let lane = 1; lane < LANE_COUNT; lane += 1) {
      ctx.fillRect(lane * LANE_WIDTH - 1, 0, 2, CANVAS_HEIGHT);
    }

    ctx.fillStyle = "rgba(32, 207, 207, 0.12)";
    for (let row = 0; row < 12; row += 1) {
      ctx.fillRect(0, row * 44, CANVAS_WIDTH, 1);
    }

    for (const ingredient of ingredientsRef.current) {
      const centerX = ingredient.lane * LANE_WIDTH + LANE_WIDTH / 2;
      const palette = ingredientPalette[ingredient.kind];

      ctx.save();
      ctx.translate(centerX, ingredient.y);

      if (ingredient.kind === "lettuce") {
        ctx.fillStyle = palette.fill;
        ctx.beginPath();
        ctx.moveTo(-24, 0);
        ctx.quadraticCurveTo(-10, -14, 0, 0);
        ctx.quadraticCurveTo(10, 14, 24, 0);
        ctx.quadraticCurveTo(10, -12, 0, 0);
        ctx.quadraticCurveTo(-12, 12, -24, 0);
        ctx.fill();
      } else if (ingredient.kind === "cheese") {
        ctx.fillStyle = palette.fill;
        ctx.strokeStyle = palette.stroke;
        drawRoundedRect(ctx, -22, -14, 44, 24, 6);
        ctx.fill();
        ctx.stroke();
      } else if (ingredient.kind === "patty") {
        ctx.fillStyle = palette.fill;
        ctx.strokeStyle = palette.stroke;
        drawRoundedRect(ctx, -24, -12, 48, 20, 10);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = palette.fill;
        ctx.strokeStyle = palette.stroke;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    const playerX = playerLaneRef.current * LANE_WIDTH + 12;

    ctx.fillStyle = "#F0B978";
    drawRoundedRect(ctx, playerX, PLAYER_Y + 26, 66, 18, 9);
    ctx.fill();

    ctx.fillStyle = "#6C3C22";
    drawRoundedRect(ctx, playerX + 6, PLAYER_Y + 12, 54, 14, 7);
    ctx.fill();

    ctx.fillStyle = "#48A34D";
    drawRoundedRect(ctx, playerX + 4, PLAYER_Y + 6, 58, 10, 5);
    ctx.fill();

    ctx.fillStyle = "#F5D34A";
    drawRoundedRect(ctx, playerX + 8, PLAYER_Y, 50, 8, 4);
    ctx.fill();

    ctx.fillStyle = "#F3C68A";
    drawRoundedRect(ctx, playerX, PLAYER_Y - 14, 66, 18, 9);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 15px Inter, Arial, sans-serif";
    ctx.fillText(`Poäng: ${scoreRef.current}`, 18, 28);
    ctx.fillText(`Tid: ${timeLeftRef.current}s`, 280, 28);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 12px Inter, Arial, sans-serif";
    ctx.fillText("Fånga ingredienserna innan tiden tar slut", 18, 48);
  }, []);

  const stopGame = useCallback(
    (finalMessage: string) => {
      clearGameTimers();

      let nextBest = highScoreRef.current;
      if (scoreRef.current > highScoreRef.current) {
        nextBest = scoreRef.current;
        highScoreRef.current = nextBest;
        setHighScore(nextBest);
        window.localStorage.setItem(STORAGE_KEY, String(nextBest));
      }

      setStatus("ended");
      setLiveMessage(
        scoreRef.current >= nextBest
          ? `Nytt high score! ${finalMessage}`
          : finalMessage,
      );
      drawScene();
    },
    [clearGameTimers, drawScene],
  );

  const stepFrame = useCallback(
    (time: number) => {
      if (!lastFrameRef.current) {
        lastFrameRef.current = time;
      }

      const delta = (time - lastFrameRef.current) / 16.67;
      lastFrameRef.current = time;

      ingredientsRef.current = ingredientsRef.current.flatMap((ingredient) => {
        const nextIngredient = {
          ...ingredient,
          y: ingredient.y + 4.8 * delta,
        };

        const isCaught =
          nextIngredient.lane === playerLaneRef.current &&
          nextIngredient.y >= PLAYER_Y - 6 &&
          nextIngredient.y <= PLAYER_Y + 18;

        if (isCaught) {
          scoreRef.current += 10;
          setScore(scoreRef.current);
          setLiveMessage(
            `Snyggt! +10 poäng för ${ingredientPalette[nextIngredient.kind].label.toLowerCase()}.`,
          );
          return [];
        }

        if (nextIngredient.y > CANVAS_HEIGHT + 24) {
          return [];
        }

        return [nextIngredient];
      });

      drawScene();
      animationFrameRef.current = window.requestAnimationFrame(stepFrame);
    },
    [drawScene],
  );

  const startGame = useCallback(() => {
    clearGameTimers();
    ingredientsRef.current = [];
    ingredientIdRef.current = 0;
    scoreRef.current = 0;
    timeLeftRef.current = GAME_DURATION;
    lastFrameRef.current = 0;
    playerLaneRef.current = 1;
    setPlayerLane(1);
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setStatus("running");
    setLiveMessage("Spelet är igång. Fånga ingredienserna!");

    spawnIntervalRef.current = window.setInterval(() => {
      ingredientsRef.current.push({
        id: ingredientIdRef.current,
        lane: Math.floor(Math.random() * LANE_COUNT),
        y: -24,
        kind: randomKind(),
      });
      ingredientIdRef.current += 1;
    }, 650);

    countdownIntervalRef.current = window.setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);

      if (timeLeftRef.current <= 0) {
        stopGame(`Tiden är ute. Du fick ${scoreRef.current} poäng.`);
      }
    }, 1000);

    animationFrameRef.current = window.requestAnimationFrame(stepFrame);
  }, [clearGameTimers, stepFrame, stopGame]);

  const movePlayer = useCallback((direction: -1 | 1) => {
    const nextLane = Math.max(
      0,
      Math.min(LANE_COUNT - 1, playerLaneRef.current + direction),
    );

    playerLaneRef.current = nextLane;
    setPlayerLane(nextLane);
    drawScene();
  }, [drawScene]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePlayer(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        movePlayer(1);
      }

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (status !== "running") {
          startGame();
        }
      }
    },
    [movePlayer, startGame, status],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = Number(saved);

    if (!Number.isNaN(parsed) && parsed > 0) {
      highScoreRef.current = parsed;
      setHighScore(parsed);
    }

    drawScene();
  }, [drawScene]);

  useEffect(() => {
    return () => {
      clearGameTimers();
    };
  }, [clearGameTimers]);

  useEffect(() => {
    drawScene();
  }, [drawScene, playerLane, score, timeLeft]);

  return (
    <Card className="surface-panel-strong rounded-[2rem] border-border/80">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-primary/12 px-4 py-1.5 text-primary hover:bg-primary/12">
            Interaktiv demo
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-border/70 bg-card/80"
          >
            Touch + tangentbord
          </Badge>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="font-display text-3xl tracking-tight">
              Bygg din burgare på tid
            </CardTitle>
            <CardDescription className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">
              Fånga fallande ingredienser med burgaren längst ner. Ju fler du
              plockar upp på 30 sekunder, desto högre score.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
              Poäng: {score}
            </Badge>
            <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
              Tid: {timeLeft}s
            </Badge>
            <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
              Bana {playerLane + 1}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-describedby="burger-game-help"
          className="rounded-[1.75rem] border border-border/70 bg-foreground/95 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            aria-label="Spelyta där du fångar fallande burgeringredienser"
            className="mx-auto block h-auto w-full max-w-[360px] rounded-[1.25rem]"
          />
        </div>

        <p
          id="burger-game-help"
          className="text-sm leading-relaxed text-muted-foreground"
        >
          Använd vänster- och högerknapparna på skärmen eller piltangenterna på
          tangentbordet. Tryck Enter eller mellanslag för att starta om.
        </p>

        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Flytta vänster"
              onClick={() => movePlayer(-1)}
              className="rounded-full bg-card/90 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Flytta höger"
              onClick={() => movePlayer(1)}
              className="rounded-full bg-card/90 active:scale-95"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            type="button"
            onClick={startGame}
            className="rounded-full px-6 active:scale-95"
          >
            {status === "running" ? "Starta om rundan" : "Starta spelet"}
          </Button>

          <div className="rounded-[1.25rem] border border-border/70 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
            {status === "ended"
              ? `Rundan är klar. Din senaste score: ${score}.`
              : "Tips: patty, ost, sallad och tomat ger alla 10 poäng."}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Trophy className="h-4 w-4 text-primary" />
              High score
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {highScore}
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TimerReset className="h-4 w-4 text-primary" />
              Tidsläge
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              30 sekunder per runda
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <RotateCcw className="h-4 w-4 text-primary" />
              Omstart
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Du kan alltid köra en ny runda direkt.
            </p>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>
      </CardContent>
    </Card>
  );
}