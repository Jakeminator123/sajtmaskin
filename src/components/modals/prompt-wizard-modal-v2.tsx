/**
 * Facade for the prompt wizard. The implementation was split into cohesive
 * modules under prompt-wizard/ (2026-07); this file re-exports the same
 * public symbols so existing importers keep working unchanged.
 */
export { PromptWizardModalV2 } from "@/components/modals/prompt-wizard/prompt-wizard-modal-v2";
export type { ComponentChoices, WizardData } from "@/components/modals/prompt-wizard/types";
