import { NextRequest } from "next/server";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const width = Math.min(
    Math.max(
      parseInt(params.get("width") || params.get("w") || "600") || 600,
      1,
    ),
    2000,
  );
  const height = Math.min(
    Math.max(
      parseInt(params.get("height") || params.get("h") || "400") || 400,
      1,
    ),
    2000,
  );
  const text = params.get("text") || `${width} × ${height}`;
  const fontSize = Math.max(12, Math.min(24, width / 20));
  const subFontSize = Math.max(10, Math.min(14, width / 30));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#334155" stroke-width="1" rx="4"/>
  <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="${fontSize}">
    ${escapeXml(text)}
  </text>
  <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-family="system-ui,sans-serif" font-size="${subFontSize}">
    Placeholder
  </text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
