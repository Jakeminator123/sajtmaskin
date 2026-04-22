"use client";

import dynamic from "next/dynamic";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";

// IMPORTANT: load the Canvas only on the client. Importing @react-three/fiber
// at module scope crashes Next.js Server Components because it touches
// `window` during initialisation.
const Canvas = dynamic(
  () => import("@react-three/fiber").then((mod) => mod.Canvas),
  { ssr: false },
);

interface ThreeCanvasErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ThreeCanvasErrorBoundaryState {
  hasError: boolean;
}

class ThreeCanvasErrorBoundary extends Component<
  ThreeCanvasErrorBoundaryProps,
  ThreeCanvasErrorBoundaryState
> {
  state: ThreeCanvasErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ThreeCanvasErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[three-canvas] error caught:", error.message, info.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useIsLowEndDevice(): boolean {
  const [isLowEnd, setIsLowEnd] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const cores =
      typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : 4;
    const memory =
      typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory ===
      "number"
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
        : 4;
    setIsLowEnd(cores <= 2 || memory <= 2);
  }, []);
  return isLowEnd;
}

export interface ThreeCanvasShellProps {
  /** Tailwind classes that bound the canvas size. The canvas collapses to 0x0 without explicit dimensions. */
  className?: string;
  /** Aria label. Pass empty string for purely decorative scenes (sets aria-hidden=true). */
  ariaLabel?: string;
  /** Static fallback shown on SSR, on WebGL context loss, on low-end devices and when reduced-motion is forced + the scene is purely decorative. */
  fallback: ReactNode;
  /** When true, treat the scene as decorative (skips animation under reduced-motion). Defaults to true. */
  decorative?: boolean;
  /** Camera position. Defaults to [0, 0.4, 3]. */
  cameraPosition?: [number, number, number];
  /** Camera FOV. Defaults to 40. */
  cameraFov?: number;
  /** Children passed inside the Canvas (lights, meshes, etc). */
  children: ReactNode;
}

export function ThreeCanvasShell({
  className,
  ariaLabel,
  fallback,
  decorative = true,
  cameraPosition = [0, 0.4, 3],
  cameraFov = 40,
  children,
}: ThreeCanvasShellProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isLowEnd = useIsLowEndDevice();
  const ariaProps = ariaLabel
    ? { role: "img", "aria-label": ariaLabel }
    : { "aria-hidden": true as const };

  if (isLowEnd || (reducedMotion && decorative)) {
    return (
      <div className={className} {...ariaProps}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={className} {...ariaProps}>
      <ThreeCanvasErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <Canvas
            camera={{ position: cameraPosition, fov: cameraFov }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, powerPreference: "low-power" }}
            onCreated={({ gl }) => {
              const canvas = gl.domElement;
              const handleLost = (event: Event) => {
                event.preventDefault();
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[three-canvas] webgl context lost");
                }
              };
              canvas.addEventListener("webglcontextlost", handleLost, false);
            }}
          >
            {children}
          </Canvas>
        </Suspense>
      </ThreeCanvasErrorBoundary>
    </div>
  );
}
