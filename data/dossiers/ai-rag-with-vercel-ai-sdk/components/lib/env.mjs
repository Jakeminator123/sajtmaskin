import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AI_GATEWAY_API_KEY: z.string().min(1)
  },
  experimental__runtimeEnv: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY
  }
});
