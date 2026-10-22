/** Tiny inline SVG sparkline (monthly counts). Decorative; the values are in its title. */
export function Sparkline({ values, labels, width = 96, height = 24 }: { values: number[]; labels?: string[]; width?: number; height?: number }) {
  if (!values.length) return <span className="text-xs text-muted-foreground">n/a</span>;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [2 + i * step, height - 2 - (v / max) * (height - 4)] as const);
  const title = values.map((v, i) => `${labels?.[i] ?? i + 1}: ${v}`).join(", ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`Monthly trend: ${title}`} className="overflow-visible">
      <title>{title}</title>
      <line x1={0} x2={width} y1={height - 2} y2={height - 2} stroke="var(--viz-grid)" strokeWidth={1} />
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--accent-brand)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--accent-brand)" />
    </svg>
  );
}
