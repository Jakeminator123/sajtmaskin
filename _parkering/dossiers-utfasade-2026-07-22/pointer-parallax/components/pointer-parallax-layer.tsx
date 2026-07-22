"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePointerParallax } from "@/components/use-pointer-parallax";

export interface PointerParallaxLayerProps {
  targetRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** Translate intensity in pixels at pointer extremes. Default 8. */
  intensity?: number;
  /** Optional rotate intensity in degrees. Default 0 (translate-only). */
  rotateIntensity?: number;
  /** Easing factor (0..1, higher = snappier). Default 0.12. */
  damping?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * DOM-side wrapper that applies a translate (and optional rotate) transform
 * driven by `usePointerParallax`. Uses requestAnimationFrame + lerp so the
 * transform follows the cursor smoothly without a React re-render per move.
 *
 * For R3F scenes call `usePointerParallax(targetRef)` directly and read the
 * ref inside `useFrame` instead.
 */
export function PointerParallaxLayer({
  targetRef,
  children,
  intensity = 8,
  rotateIntensity = 0,
  damping = 0.12,
  className,
  style,
}: PointerParallaxLayerProps) {
  const pointerRef = usePointerParallax(targetRef);
  const layerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = pointerRef.current;
      currentRef.current.x += (target.x - currentRef.current.x) * damping;
      currentRef.current.y += (target.y - currentRef.current.y) * damping;
      const node = layerRef.current;
      if (node) {
        const tx = currentRef.current.x * intensity;
        const ty = currentRef.current.y * intensity;
        const rx = -currentRef.current.y * rotateIntensity;
        const ry = currentRef.current.x * rotateIntensity;
        node.style.transform =
          rotateIntensity > 0
            ? `translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateY(${ry}deg)`
            : `translate3d(${tx}px, ${ty}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef, intensity, rotateIntensity, damping]);

  return (
    <div
      ref={layerRef}
      className={className}
      style={{
        ...style,
        willChange: "transform",
        transformStyle: rotateIntensity > 0 ? "preserve-3d" : style?.transformStyle,
      }}
    >
      {children}
    </div>
  );
}
