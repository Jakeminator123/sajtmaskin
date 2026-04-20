"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddleInstance() {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    const environment = process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production" | undefined;

    if (!token) {
      throw new Error("Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
    }

    if (!environment) {
      throw new Error("Missing NEXT_PUBLIC_PADDLE_ENV");
    }

    paddlePromise = initializePaddle({
      environment,
      token,
    });
  }

  return paddlePromise;
}
