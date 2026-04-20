export async function getDeepgramAccessToken() {
  const response = await fetch("/api/authenticate", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Deepgram access token");
  }

  return response.json();
}

export async function createDeepgramRealtimeConnection(options = {}) {
  const auth = await getDeepgramAccessToken();
  const token = auth.access_token || auth.token || auth.key;

  if (!token) {
    throw new Error("Deepgram auth response did not include a usable token");
  }

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    interim_results: "true",
    endpointing: "300",
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, String(value)])
    ),
  });

  const socket = new WebSocket(
    `wss://api.deepgram.com/v1/listen?${params.toString()}`,
    ["token", token]
  );

  return socket;
}
