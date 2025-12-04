/**
 * Avatar Configuration
 * ====================
 * Central configuration file for the 3D avatar.
 * Adjust these values to customize appearance and behavior.
 *
 * @see FloatingAvatar.tsx - Main component using these settings
 * @see AvatarModel.tsx - 3D model component
 */

export const AVATAR_CONFIG = {
  // ==========================================================================
  // CONTAINER SIZE (Tailwind CSS classes)
  // ==========================================================================
  containerWidth: "w-44", // w-32=128px, w-40=160px, w-44=176px, w-48=192px
  containerHeight: "h-72", // h-56=224px, h-64=256px, h-72=288px

  // ==========================================================================
  // CAMERA SETTINGS
  // ==========================================================================
  camera: {
    position: {
      x: 0,
      y: 0.5, // Height - higher = camera looks more upward
      z: 3.2, // Distance - lower = closer to avatar
    },
    fov: 35, // Field of view - lower = more zoom
  },

  // ==========================================================================
  // AVATAR MODEL SETTINGS
  // ==========================================================================
  avatar: {
    position: {
      x: 0,
      y: -1.0, // Vertical position - more negative = avatar moved down
      z: 0,
    },
    rotation: {
      x: 0,
      y: -0.2, // Slight angle towards user (negative = left)
      z: 0,
    },
    scale: 1.0, // Size multiplier - 1.0 = full size
  },

  // ==========================================================================
  // LIGHTING
  // ==========================================================================
  lighting: {
    ambient: 0.8, // Overall brightness
    directional1: 1.0, // Main light
    directional2: 0.5, // Fill light
  },

  // ==========================================================================
  // WALK-IN ANIMATION
  // ==========================================================================
  walkIn: {
    delay: 800, // Delay before walk-in starts (ms)
    duration: 2000, // Walk-in animation duration (ms)
    startX: 250, // Starting X position (pixels off-screen)
  },
};

/**
 * QUICK REFERENCE
 * ===============
 *
 * Avatar too small:
 * - Increase avatar.scale (e.g., 1.2)
 * - OR decrease camera.position.z (e.g., 2.5)
 * - OR increase containerWidth/Height
 *
 * Only see feet (head cut off):
 * - Make avatar.position.y more negative (e.g., -1.5)
 * - OR increase camera.position.y (e.g., 0.8)
 *
 * Only see head (feet cut off):
 * - Make avatar.position.y less negative (e.g., -0.5)
 * - OR decrease camera.position.y
 */
