import { z } from "zod";

export const validatedStatementSchema = z.object({
  classification: z
    .enum(["true", "dubious", "obviously-fake"])
    .describe("Whether the statement appears true, dubious, or obviously fake."),
  reasoning: z
    .string()
    .min(1)
    .describe("One short sentence explaining the classification."),
});

export type ValidatedStatement = z.infer<typeof validatedStatementSchema>;
