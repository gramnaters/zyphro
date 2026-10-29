// Port of the live Loader component (ring / zoomies).
export function Loader({
  size = 80,
  stroke = 5,
  speed = 1.1,
  color = 'var(--text-primary)',
  loaderType = 'zoomies',
}: {
  size?: number;
  stroke?: number;
  speed?: number;
  color?: string;
  loaderType?: 'ring' | 'zoomies';
}) {
  const dur = `${1 / speed}s`;
  if (loaderType === 'ring') {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill='none'
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={`${c * 0.75} ${c * 0.25}`}
        >
          <animateTransform
            attributeName='transform'
            type='rotate'
            from={`0 ${size / 2} ${size / 2}`}
            to={`360 ${size / 2} ${size / 2}`}
            dur={dur}
            repeatCount='indefinite'
          />
        </circle>
      </svg>
    );
  }
  const dot = size * 0.15;
  const gap = size * 0.25;
  const start = (size - (dot * 3 + gap * 2)) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={start + dot / 2 + i * (dot + gap)} cy={size / 2} r={dot / 2} fill={color}>
          <animate
            attributeName='cy'
            values={`${size / 2};${size * 0.35};${size / 2}`}
            dur={dur}
            begin={`${(i * 0.15) / speed}s`}
            repeatCount='indefinite'
          />
          <animate
            attributeName='opacity'
            values='1;0.5;1'
            dur={dur}
            begin={`${(i * 0.15) / speed}s`}
            repeatCount='indefinite'
          />
        </circle>
      ))}
    </svg>
  );
}
