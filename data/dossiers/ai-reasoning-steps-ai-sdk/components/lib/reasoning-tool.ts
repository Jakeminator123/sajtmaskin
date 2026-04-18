import { tool } from 'ai';
import { z } from 'zod';
import { reasoningStepSchema } from './schema';

export const addReasoningStep = tool({
  description:
    'Emit a structured reasoning step for the UI before continuing or producing the final answer.',
  inputSchema: reasoningStepSchema,
  execute: async (input: z.infer<typeof reasoningStepSchema>) => input,
});
