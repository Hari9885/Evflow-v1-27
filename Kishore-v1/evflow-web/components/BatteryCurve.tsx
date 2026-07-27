import type { ChargingStop, RoutePlan } from "@/lib/api";

// Single-series line chart: battery % over distance. One series → no legend;
// text stays in ink colors, the line carries identity.
const LINE = "#2a78d6"; // categorical slot 1 (blue)
const CRITICAL = "#d03b3b"; // status: critical — 30% reserve threshold
const GRID = "#e7e5e4";
const INK_MUTED = "#78716c";

const W = 340;
const H = 170;
const PAD = { top: 10, right: 10, bottom: 24, left: 30 };

export default function BatteryCurve({
  plan,
}: {
  plan: Pick<RoutePlan, "batteryCurve" | "totalDistanceKm"> & {
    chargingStops: ChargingStop[];
  };
}) {
  const { batteryCurve: curve, chargingStops: stops } = plan;
  const totalKm = Math.max(
    plan.totalDistanceKm,
    curve.length ? curve[curve.length - 1].distanceKm : 0
  );
  if (curve.length < 2 || totalKm <= 0) return null;

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (km: number) => PAD.left + (km / totalKm) * iw;
  const y = (pct: number) => PAD.top + (1 - pct / 100) * ih;
  const linePoints = curve
    .map((p) => `${x(p.distanceKm).toFixed(1)},${y(p.batteryPercent).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Battery percentage along the route"
    >
      {/* recessive grid + y labels */}
      {[0, 50, 100].map((pct) => (
        <g key={pct}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(pct)} y2={y(pct)} stroke={GRID} strokeWidth={1} />
          <text x={PAD.left - 5} y={y(pct) + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>
            {pct}
          </text>
        </g>
      ))}
      {/* 30% reserve threshold */}
      <line
        x1={PAD.left} x2={W - PAD.right} y1={y(30)} y2={y(30)}
        stroke={CRITICAL} strokeWidth={1.5} strokeDasharray="4 4"
      />
      <text x={W - PAD.right} y={y(30) - 4} textAnchor="end" fontSize={9} fill={INK_MUTED}>
        30% reserve
      </text>
      {/* battery line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke={LINE}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* charging-stop dip markers, numbered to match map pins + stop list */}
      {stops.map((s, i) => (
        <g key={s.charger.id}>
          <circle
            cx={x(s.atDistanceKm)}
            cy={y(s.arrivalBatteryPercent)}
            r={4.5}
            fill={LINE}
            stroke="#ffffff"
            strokeWidth={2}
          />
          <text
            x={x(s.atDistanceKm)}
            y={y(s.arrivalBatteryPercent) + 16}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            fill={INK_MUTED}
          >
            {i + 1}
          </text>
        </g>
      ))}
      {/* x labels */}
      <text x={PAD.left} y={H - 8} fontSize={10} fill={INK_MUTED}>0 km</text>
      <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill={INK_MUTED}>
        {Math.round(totalKm)} km
      </text>
    </svg>
  );
}
