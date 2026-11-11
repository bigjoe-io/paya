import { ImageResponse } from "next/og";

/** Shared 1200x630 social card: grey gradient, Paya mark, big title. */
export function ogCard(title: string, kicker: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(180deg, #f1f1f1 0%, #cfcfcf 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 100 100">
            <circle cx="32" cy="50" r="30" fill="#111" />
            <path d="M68 20a30 30 0 0 1 0 60z" fill="#111" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#111", letterSpacing: -1.5 }}>Paya</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#6e6e73", marginBottom: 18 }}>{kicker}</div>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#111", letterSpacing: -3, lineHeight: 1.02 }}>{title}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
