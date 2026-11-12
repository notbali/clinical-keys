/** Small hand-built SVG line chart. Series differ by line style and marker shape, not color alone. */
export interface ChartPoint { x: number; y: number }

export function LineChart(props: {
  points: ChartPoint[];
  xMax: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  target?: number;
  unit?: string;
  variant: 'solid' | 'dashed';
  label: string;
  /** Day numbers drawn with a dashed guide (tests). */
  marks?: { x: number; name: string }[];
}) {
  const { points, xMax, yMin, yMax, yTicks, target, unit = '', variant, label, marks = [] } = props;
  const W = 540, H = 250, L = 44, R = 30, T = 20, B = 50;
  const px = (x: number) => L + ((x - 1) / (xMax - 1)) * (W - L - R);
  const py = (y: number) => T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B);
  const color = variant === 'solid' ? 'var(--accent)' : 'var(--warn)';
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const last = sorted[sorted.length - 1];
  const line = sorted.map((p) => `${px(p.x)},${py(p.y)}`).join(' ');
  const summary = sorted.length ? `${label}: ${sorted.map((p) => `day ${p.x} ${p.y}${unit}`).join(', ')}.` : `${label}: no data yet.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={summary}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="var(--line-soft)" />
          <text x={L - 8} y={py(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={py(yMin)} y2={py(yMin)} stroke="var(--line-strong)" />
      {target != null && (
        <g>
          <line x1={L} x2={W - R} y1={py(target)} y2={py(target)} stroke="var(--good)" strokeDasharray="2 4" />
          <text x={W - R} y={py(target) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--good-ink)">Target {target}{unit}</text>
        </g>
      )}
      {marks.map((m) => (
        <g key={m.x}>
          <line x1={px(m.x)} x2={px(m.x)} y1={T} y2={H - B} stroke="var(--line-strong)" strokeDasharray="4 4" />
          <text x={px(m.x)} y={H - 8} textAnchor={m.x === 1 ? 'start' : m.x === xMax ? 'end' : 'middle'} fontSize="11" fill="var(--muted)">{m.name}</text>
        </g>
      ))}
      {Array.from({ length: xMax }, (_, i) => i + 1).map((d) => (
        <text key={d} x={px(d)} y={H - B + 18} textAnchor="middle" fontSize="11" fill="var(--muted)" fontWeight={last && d === last.x ? 700 : 400}>{d}</text>
      ))}
      {sorted.length > 1 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={variant === 'dashed' ? '9 5' : undefined} />
      )}
      {sorted.map((p, i) => {
        const isLast = i === sorted.length - 1;
        const cx = px(p.x), cy = py(p.y);
        const fill = isLast ? color : 'var(--surface)';
        return (
          <g key={p.x}>
            {variant === 'solid'
              ? <circle cx={cx} cy={cy} r={isLast ? 7 : 5} fill={fill} stroke={color} strokeWidth="3" />
              : <rect x={cx - (isLast ? 7 : 5)} y={cy - (isLast ? 7 : 5)} width={isLast ? 14 : 10} height={isLast ? 14 : 10} fill={fill} stroke={color} strokeWidth="3" />}
            <text x={cx} y={cy - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">{p.y}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}
