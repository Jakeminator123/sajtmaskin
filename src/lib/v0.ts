import { v0 } from "v0-sdk";

export function assertV0Key(): void {
  if (!process.env.V0_API_KEY) {
    throw new Error("Missing V0_API_KEY. Set it in your environment.");
  }
}

export { v0 };
