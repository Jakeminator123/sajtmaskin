import { Paddle } from '@paddle/paddle-node-sdk';

let paddleInstance: Paddle | null = null;

export function getPaddleInstance() {
  if (!paddleInstance) {
    paddleInstance = new Paddle(process.env.PADDLE_API_KEY!, {
      environment:
        process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
    });
  }

  return paddleInstance;
}
