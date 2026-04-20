import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get mock weather data for a given city.",
  inputSchema: z.object({
    city: z.string().min(1),
  }),
  execute: async ({ city }) => {
    return {
      city,
      temperatureC: 22,
      condition: "sunny",
    };
  },
});
