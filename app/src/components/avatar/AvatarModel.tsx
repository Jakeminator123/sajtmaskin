"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

// Animation type mapping
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

// Map animation names to GLB files
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

// Preload all animations
Object.values(ANIMATION_FILES).forEach((path) => {
  useGLTF.preload(path);
});

interface AvatarModelProps {
  animation?: AvatarAnimation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
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
  const [currentAnimation, setCurrentAnimation] =
    useState<AvatarAnimation>(animation);

  // Load the GLB file for current animation
  const { scene, animations } = useGLTF(ANIMATION_FILES[currentAnimation]);

  // Clone the scene to avoid sharing issues
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Setup animations
  const { actions, mixer } = useAnimations(animations, group);

  // Play animation when it changes
  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      // Get the first (and usually only) animation
      const actionName = Object.keys(actions)[0];
      const action = actions[actionName];

      if (action) {
        // Reset and play
        action.reset();
        action.fadeIn(0.3);
        action.play();

        // Handle animation completion for non-looping animations
        if (
          animation !== "idle" &&
          animation !== "idle2" &&
          animation !== "idle3"
        ) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;

          const onFinished = () => {
            onAnimationComplete?.();
          };

          mixer?.addEventListener("finished", onFinished);
          return () => {
            mixer?.removeEventListener("finished", onFinished);
          };
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
      }
    }
  }, [actions, mixer, animation, onAnimationComplete]);

  // Update animation when prop changes
  useEffect(() => {
    if (animation !== currentAnimation) {
      setCurrentAnimation(animation);
    }
  }, [animation, currentAnimation]);

  // Subtle idle movement
  useFrame((state) => {
    if (group.current) {
      // Gentle floating effect
      group.current.position.y =
        position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });

  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

// Export for preloading
export { ANIMATION_FILES };

