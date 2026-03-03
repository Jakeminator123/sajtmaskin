import Redis from "ioredis";
import { REDIS_CONFIG } from "@/lib/config";

function createConnection(): Redis | null {
  if (!REDIS_CONFIG.enabled) return null;

  const useTls = REDIS_CONFIG.url.startsWith("rediss://");
  return new Redis({
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    username: REDIS_CONFIG.username,
    password: REDIS_CONFIG.password,
    ...(useTls ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
}

export function createRedisPublisher(): Redis | null {
  return createConnection();
}

export function createRedisSubscriber(): Redis | null {
  return createConnection();
}

export function deployStatusChannel(vercelDeploymentId: string): string {
  return `deploy:status:${vercelDeploymentId}`;
}
