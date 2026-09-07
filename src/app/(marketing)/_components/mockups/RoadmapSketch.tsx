/**
 * "Coming next" placeholder (brief §7): a line-drawn 7-day grid with three horizontal bars and one amber marker.
 * Deliberately schematic — no screenshot of an unbuilt screen.
 */
export function RoadmapSketch({ className }: { className?: string }) {
  const cols = 7;
  const w = 280;
  const h = 120;
  const left = 44;
  const colW = (w - left) / cols;
  const rows = [
    { y: 34, from: 0.2, to: 2.6, label: "CNC-01" },
    { y: 62, from: 1.4, to: 4.2, label: "CNC-02" },
    { y: 90, from: 3.1, to: 5.7, label: "ASM-01" },
  ];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      role="img"
      aria-label="Sketch of a planning board: three machine rows across a seven-day grid, with one amber marker on a day."
      className={className}
    >
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line
          key={`c${i}`}
          x1={left + i * colW}
          y1={16}
          x2={left + i * colW}
          y2={h - 8}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={1}
        />
      ))}
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <text
          key={`d${i}`}
          x={left + i * colW + colW / 2}
          y={11}
          textAnchor="middle"
          fontSize="9"
          fill="currentColor"
          fillOpacity={0.6}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {d}
        </text>
      ))}
      {rows.map((r) => (
        <g key={r.label}>
          <text
            x={left - 8}
            y={r.y + 3}
            textAnchor="end"
            fontSize="9"
            fill="currentColor"
            fillOpacity={0.7}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {r.label}
          </text>
          <rect
            x={left + r.from * colW}
            y={r.y - 7}
            width={(r.to - r.from) * colW}
            height={14}
            rx={4}
            fill="currentColor"
            fillOpacity={0.12}
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        </g>
      ))}
      <rect x={left + 4 * colW + 6} y={62 - 7} width={colW - 12} height={14} rx={4} fill="#fbbf24" />
      <line
        x1={left + 4.5 * colW}
        y1={16}
        x2={left + 4.5 * colW}
        y2={h - 8}
        stroke="#fbbf24"
        strokeWidth={1.5}
        strokeDasharray="2 3"
      />
    </svg>
  );
}
