/** Browser-safe input normalization; network destinations still require SSRF validation. */
export function normalizeWebsiteInputUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("URL måste anges");

  // A domain followed by a port is not a URI scheme (example.se:8443/path).
  const bareHostWithPort = /^(?:localhost|[^/?#:\s]+\.[^/?#:\s]+):\d+(?:[/?#]|$)/i.test(input);
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input) && !bareHostWithPort;
  if (hasScheme && !/^https?:\/\//i.test(input)) {
    throw new Error("Endast http:// och https:// är tillåtna");
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("Ogiltig URL. Ange en giltig webbadress");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Webbadressen får inte innehålla inloggningsuppgifter");
  }
  return parsed.toString();
}
