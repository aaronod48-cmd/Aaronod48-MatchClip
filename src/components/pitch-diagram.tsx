import { formations, type TeamShape } from "@/config/formations";

/**
 * A small pitch (own goal at the bottom) showing the team's shape, with the
 * player's position highlighted in lime and their shirt number on it.
 */
export function PitchDiagram({
  shape,
  position,
  shirtNumber,
}: {
  shape: string;
  position: string;
  shirtNumber: number;
}) {
  const spots = formations[shape as TeamShape] ?? [];
  const W = 200;
  const H = 280;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={`${shape}, playing ${position}, number ${shirtNumber}`}
    >
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="6" fill="#16201b" stroke="#26332c" strokeWidth="2" />
      <line x1="4" y1={H / 2} x2={W - 4} y2={H / 2} stroke="#26332c" strokeWidth="2" />
      <circle cx={W / 2} cy={H / 2} r="22" fill="none" stroke="#26332c" strokeWidth="2" />
      <rect x={W / 2 - 44} y={H - 40} width="88" height="36" fill="none" stroke="#26332c" strokeWidth="2" />
      <rect x={W / 2 - 44} y="4" width="88" height="36" fill="none" stroke="#26332c" strokeWidth="2" />
      {spots.map((p) => {
        const me = p.code === position;
        const cx = 14 + p.x * (W - 28);
        const cy = H - 14 - p.y * (H - 28);
        return (
          <g key={p.code}>
            <circle cx={cx} cy={cy} r={me ? 13 : 7} fill={me ? "#c8f04a" : "#9aa8a0"} opacity={me ? 1 : 0.5} />
            {me && (
              <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0d1411">
                {shirtNumber}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
