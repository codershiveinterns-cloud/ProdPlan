import { ImageResponse } from "next/og";

/**
 * Social preview (1200 × 630) drawn with `next/og`: the brand lockup, the hero headline with its teal highlight on a
 * pale stone card, over the tinted-teal band with the amber accent (docs/LANDING_REFERENCE.md §4). Uses the bundled
 * default font (no font files to ship); flexbox only, as Satori requires.
 */
export const alt = "ProdPlan — Production planning for discrete manufacturers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BAND = "#0b2b2a";
const BAND_END = "#0f3d3a";
const TEAL_200 = "#99f6e4";
const TEAL_700 = "#0f766e";
const AMBER_400 = "#fbbf24";
const STONE_50 = "#fafaf9";
const STONE_900 = "#1c1917";
const STONE_600 = "#57534e";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 56,
          backgroundColor: BAND,
          backgroundImage: `linear-gradient(160deg, ${BAND} 0%, ${BAND_END} 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="56" height="56" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="8" fill={TEAL_700} />
              <rect x="7" y="7" width="12" height="4" rx="1.25" fill="#ffffff" />
              <rect x="10" y="14" width="15" height="4" rx="1.25" fill="#ffffff" />
              <rect x="13" y="21" width="6" height="4" rx="1.25" fill="#ffffff" />
              <rect x="21" y="21" width="4" height="4" rx="1.25" fill={AMBER_400} />
            </svg>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>ProdPlan</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "10px 20px",
              fontSize: 20,
              color: TEAL_200,
            }}
          >
            <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: AMBER_400 }} />
            Built for discrete manufacturing plants
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            marginTop: 40,
            borderRadius: 24,
            background: STONE_50,
            padding: "52px 56px",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 62, lineHeight: 1.05, letterSpacing: -2.5, fontWeight: 800, color: STONE_900, maxWidth: 1000 }}>
              Plan production against
            </div>
            <div style={{ display: "flex", fontSize: 62, lineHeight: 1.05, letterSpacing: -2.5, fontWeight: 800, color: STONE_900 }}>
              <span style={{ color: TEAL_700 }}>real capacity,</span>&nbsp;not a whiteboard.
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 26, lineHeight: 1.4, color: STONE_600, maxWidth: 960 }}>
              One live record of customer orders, shift capacity and material stock — with the right access for everyone
              from admin to floor supervisor.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {["Orders & CSV import", "Shift capacity", "Materials & BOM", "Dashboard", "Four roles", "Audit trail"].map((chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  borderRadius: 999,
                  border: "1px solid #99f6e4",
                  background: "#f0fdfa",
                  color: "#134e4a",
                  padding: "8px 16px",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
