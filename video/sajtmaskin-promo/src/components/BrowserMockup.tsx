import React from "react";
import { COLORS, FONT } from "../styles/colors";

export function BrowserMockup({
  url = "sajtmaskin.se",
  routes,
  activeRoute = "/",
  children,
}: {
  url?: string;
  routes?: string[];
  activeRoute?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 20,
        overflow: "hidden",
        border: `1px solid ${COLORS.borderLight}`,
        boxShadow: "0 8px 40px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
        backgroundColor: COLORS.white,
      }}
    >
      {/* ── Chrome bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 56,
          backgroundColor: COLORS.card,
          borderBottom: `1px solid ${COLORS.borderLight}`,
          padding: "0 20px",
          gap: 14,
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: c,
              }}
            />
          ))}
        </div>

        {/* URL bar */}
        <div
          style={{
            flex: 1,
            height: 34,
            borderRadius: 10,
            backgroundColor: COLORS.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT.sans,
            fontSize: 14,
            color: COLORS.mutedForeground,
            letterSpacing: "0.01em",
          }}
        >
          {url}
        </div>
      </div>

      {/* ── Route pills ── */}
      {routes && routes.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 20px",
            borderBottom: `1px solid ${COLORS.borderLight}`,
            backgroundColor: COLORS.card,
          }}
        >
          {routes.map((r) => (
            <div
              key={r}
              style={{
                padding: "4px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: FONT.mono,
                backgroundColor:
                  r === activeRoute ? COLORS.primary : COLORS.muted,
                color:
                  r === activeRoute ? COLORS.white : COLORS.mutedForeground,
                letterSpacing: "0.02em",
              }}
            >
              {r}
            </div>
          ))}
        </div>
      )}

      {/* ── Content area ── */}
      <div
        style={{
          position: "relative",
          height: 660,
          backgroundColor: COLORS.white,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
