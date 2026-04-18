import { createCable } from "@anycable/web";

let cable: ReturnType<typeof createCable> | null = null;

export async function getAuthorizedCable() {
  if (cable) return cable;

  const response = await fetch("/api/auth/cable", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to authorize realtime connection");
  }

  const data = (await response.json()) as { url: string };

  cable = createCable({
    url: data.url,
  });

  return cable;
}
