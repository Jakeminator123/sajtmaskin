/**
 * Avatar Module Exports
 * =====================
 * Public API for the 3D avatar system.
 */

// Main floating avatar component (use this in pages)
export { FloatingAvatar } from "./FloatingAvatar";

// Core 3D model component
export { AvatarModel, ANIMATION_FILES } from "./AvatarModel";

// UI components
export { AvatarTooltip } from "./AvatarTooltip";
export { AvatarChatModal } from "./AvatarChatModal";

// Hooks
export { useAvatarBehavior } from "./useAvatarBehavior";
export { useAvatarAgent } from "./useAvatarAgent";

// Configuration
export { AVATAR_CONFIG } from "./avatar-config";

// Types
export type { AvatarAnimation } from "./AvatarModel";
