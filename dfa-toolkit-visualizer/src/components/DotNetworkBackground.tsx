"use client";

/**
 * Background effect: interconnected dot network matching reference design.
 * - Majority: small/faded grey dots; few larger primary-red accent dots.
 * - Dot sizes vary (small, medium, large); overall faded, low-opacity look.
 */
const LINE_DISTANCE = 72; /* ~30% fewer lines (88 * 0.7) */
const GRID_STEP = 58;
const PRIMARY_RATIO = 0.06; // ~6% primary (few distinct red dots)
const VIEWBOX_WIDTH = 1400;
const VIEWBOX_HEIGHT = 900;

type DotSize = "small" | "medium" | "large";
const RADII: Record<DotSize, number> = { small: 2.2, medium: 3.6, large: 5.8 };

function getDotSize(index: number): DotSize {
  const v = (index * 13 + 5) % 100;
  if (v < 65) return "small";
  if (v < 90) return "medium";
  return "large";
}

function generatePoints(width: number, height: number) {
  const points: Array<{ x: number; y: number; primary: boolean; size: DotSize }> = [];
  let index = 0;
  for (let y = GRID_STEP; y < height + GRID_STEP; y += GRID_STEP) {
    for (let x = GRID_STEP; x < width + GRID_STEP; x += GRID_STEP) {
      const jitter = GRID_STEP * 0.35;
      const px = x + (Math.sin(index * 1.7) * jitter);
      const py = y + (Math.cos(index * 2.3) * jitter);
      const size = getDotSize(index);
      const primary = (index * 11 + 7) % 100 < PRIMARY_RATIO * 100;
      points.push({ x: px, y: py, primary, size });
      index++;
    }
  }
  return points;
}

function getLines(points: Array<{ x: number; y: number }>) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy <= LINE_DISTANCE * LINE_DISTANCE) {
        lines.push({
          x1: points[i].x,
          y1: points[i].y,
          x2: points[j].x,
          y2: points[j].y,
        });
      }
    }
  }
  return lines;
}

const points = generatePoints(VIEWBOX_WIDTH, VIEWBOX_HEIGHT);
const lines = getLines(points);

export function DotNetworkBackground({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      aria-hidden
      width="100%"
      height="100%"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        <style>{`
          .dot-network-line { stroke: var(--color-border); stroke-width: 0.4; opacity: 0.6; }
          .dot-network-dot-muted { fill: var(--color-border); opacity: 0.6; }
          .dot-network-dot-primary { fill: var(--color-primary); opacity: 0.6; }
        `}</style>
      </defs>
      <g className="dot-network-lines">
        {lines.map((line, i) => (
          <line
            key={`l-${i}`}
            className="dot-network-line"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
      </g>
      <g className="dot-network-dots">
        {points.map((p, i) => (
          <circle
            key={`d-${i}`}
            className={p.primary ? "dot-network-dot-primary" : "dot-network-dot-muted"}
            cx={p.x}
            cy={p.y}
            r={p.primary ? Math.max(RADII[p.size], 2.5) : RADII[p.size]}
          />
        ))}
      </g>
    </svg>
  );
}
