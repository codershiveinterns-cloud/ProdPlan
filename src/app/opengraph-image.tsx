import { ImageResponse } from "next/og";

/**
 * Social preview (1200 × 630) drawn with `next/og`: the brand mark and the hero headline on the tinted-teal band
 * with the amber accent (docs/LANDING_REFERENCE.md §4). Uses the bundled default font (no font files to ship);
 * only flexbox, as Satori requires.
 */
export const alt = "ProdPlan — Plan production against real orders, machines and materials.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BAND = "#0b2b2a";
const BAND_END = "#0f3d3a";
const TEAL_200 = "#99f6e4";
const BAND_SUBTLE = "#9fc2bd";
const TEAL_700 = "#0f766e";
const AMBER_400 = "#fbbf24";

export default function OpenGraphImage() {
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
          backgroundColor: BAND,
          backgroundImage: `linear-gradient(160deg, ${BAND} 0%, ${BAND_END} 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill={TEAL_700} />
            <rect x="7" y="7" width="12" height="4" rx="1.25" fill="#ffffff" />
            <rect x="10" y="14" width="15" height="4" rx="1.25" fill="#ffffff" />
            <rect x="13" y="21" width="6" height="4" rx="1.25" fill="#ffffff" />
            <rect x="21" y="21" width="4" height="4" rx="1.25" fill={AMBER_400} />
          </svg>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>ProdPlan</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", width: 96, height: 8, borderRadius: 4, background: AMBER_400 }} />
          <div
            style={{
              display: "flex",
              maxWidth: 980,
              fontSize: 64,
              lineHeight: 1.08,
              letterSpacing: -2,
              fontWeight: 700,
            }}
          >
            Plan production against real orders, machines and materials.
          </div>
          <div style={{ display: "flex", fontSize: 28, color: TEAL_200 }}>
            One live record of customer orders, shift capacity and material stock.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: BAND_SUBTLE }}>
          <div style={{ display: "flex" }}>Production planning for discrete manufacturers</div>
          <div style={{ display: "flex" }}>Orders · Capacity · Materials · Dashboard</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
