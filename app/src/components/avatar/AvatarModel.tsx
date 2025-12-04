"use client";

/**
 * AvatarModel.tsx
 * ===============
 * 3D Avatar component that loads GLB models and plays animations.
 *
 * Each animation is a separate GLB file containing both the mesh and animation data.
 * When the animation prop changes, a new GLB is loaded and played automatically.
 *
 * IMPORTANT: Uses the scene directly (not cloned) to ensure animations work correctly.
 * Cloning the scene breaks the animation bindings to the skinned mesh.
 */

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

// ============================================================================
// TYPES
// ============================================================================

/** Available animation types for the avatar */
export type AvatarAnimation =
  | "idle"
  | "idle2"
  | "idle3"
  | "talk"
  | "talk_hands"
  | "talk_left"
  | "walk"
  | "run"
  | "confident"
  | "shuffle"
  | "sleep";

// ============================================================================
// ANIMATION FILE MAPPING
// ============================================================================

/** Map animation names to their GLB file paths */
const ANIMATION_FILES: Record<AvatarAnimation, string> = {
  idle: "/models/avatar/Animation_Idle_02_withSkin.glb",
  idle2: "/models/avatar/Animation_Idle_3_withSkin.glb",
  idle3: "/models/avatar/Animation_Idle_9_withSkin.glb",
  talk: "/models/avatar/Animation_Talk_Passionately_withSkin.glb",
  talk_hands: "/models/avatar/Animation_Talk_with_Hands_Open_withSkin.glb",
  talk_left: "/models/avatar/Animation_Talk_with_Left_Hand_Raised_withSkin.glb",
  walk: "/models/avatar/Animation_Walking_withSkin.glb",
  run: "/models/avatar/Animation_Running_withSkin.glb",
  confident: "/models/avatar/Animation_Confident_Strut_withSkin.glb",
  shuffle: "/models/avatar/Animation_Arm_Circle_Shuffle_withSkin.glb",
  sleep: "/models/avatar/Animation_Cough_While_Sleeping_withSkin.glb",
};

/** Animations that should loop infinitely */
const LOOPING_ANIMATIONS: AvatarAnimation[] = [
  "idle",
  "idle2",
  "idle3",
  "walk",
  "run",
];

// Preload all GLB files for smooth transitions between animations
Object.values(ANIMATION_FILES).forEach((path) => {
  useGLTF.preload(path);
});

// ============================================================================
// COMPONENT
// ============================================================================

interface AvatarModelProps {
  /** Which animation to play */
  animation?: AvatarAnimation;
  /** Position in 3D space [x, y, z] */
  position?: [number, number, number];
  /** Rotation in radians [x, y, z] */
  rotation?: [number, number, number];
  /** Scale multiplier */
  scale?: number;
  /** Callback when non-looping animation completes */
  onAnimationComplete?: () => void;
}

export function AvatarModel({
  animation = "idle",
  position = [0, -1.5, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onAnimationComplete,
}: AvatarModelProps) {
  const group = useRef<THREE.Group>(null);
  const baseY = useRef(position[1]);

  // Load the GLB file for the current animation
  // IMPORTANT: Each GLB contains both mesh + animation data
  const { scene, animations } = useGLTF(ANIMATION_FILES[animation]);

  // Setup animation mixer and actions
  // Pass scene directly (not group) to bind animations to the actual skinned mesh
  const { actions, mixer } = useAnimations(animations, scene);

  // Play animation when loaded or when animation prop changes
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) {
      return;
    }

    // Get the first animation clip from the GLB (usually only one per file)
    const actionName = Object.keys(actions)[0];
    const action = actions[actionName];

    if (!action) {
      console.warn(`[AvatarModel] No action found for: ${animation}`);
      return;
    }

    // Fade out any currently playing animations
    Object.values(actions).forEach((a) => {
      if (a) a.fadeOut(0.2);
    });

    // Configure looping behavior
    const shouldLoop = LOOPING_ANIMATIONS.includes(animation);
    action.setLoop(
      shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce,
      shouldLoop ? Infinity : 1
    );

    if (!shouldLoop) {
      action.clampWhenFinished = true;
    }

    // Play the animation
    action.reset().fadeIn(0.3).play();

    // Handle completion callback for non-looping animations
    if (!shouldLoop && onAnimationComplete && mixer) {
      const handleFinished = () => onAnimationComplete();
      mixer.addEventListener("finished", handleFinished);
      return () => mixer.removeEventListener("finished", handleFinished);
    }
  }, [actions, mixer, animation, onAnimationComplete]);

  // Update base Y position when props change
  useEffect(() => {
    baseY.current = position[1];
  }, [position]);

  // Subtle floating/breathing animation
  useFrame((state) => {
    if (group.current) {
      group.current.position.y =
        baseY.current + Math.sin(state.clock.elapsedTime * 0.8) * 0.015;
    }
  });

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

export { ANIMATION_FILES };
