interface RollerDiagramProps {
  diameter?: number;
  length?: number;
}

export function RollerDiagram({ diameter, length }: RollerDiagramProps) {
  if (!diameter && !length) return null;

  // Use real dimensions to calculate proportions
  const realD = diameter || 150;
  const realL = length || 800;
  const ratio = realL / realD; // e.g. 880/152.4 ≈ 5.77

  // Available drawing area (excluding margins for shafts, dims, labels)
  const shaftLen = 24;
  const dimMarginRight = 60; // space for diameter label
  const dimMarginBottom = 28;
  const padX = 10;
  const padY = 10;

  // Scale body to fit proportionally within a max bounding box
  const maxBodyW = 280;
  const maxBodyH = 120;

  let bodyW: number;
  let bodyH: number;

  // Fit to bounding box while maintaining real proportions
  if (ratio >= maxBodyW / maxBodyH) {
    // Width-constrained (long roller)
    bodyW = maxBodyW;
    bodyH = Math.max(20, bodyW / ratio);
  } else {
    // Height-constrained (fat roller)
    bodyH = maxBodyH;
    bodyW = Math.max(40, bodyH * ratio);
  }

  // SVG dimensions derived from body size
  const svgW = padX + shaftLen + bodyW + shaftLen + dimMarginRight + padX;
  const svgH = padY + bodyH + dimMarginBottom + padY;

  // Body position
  const bodyX = padX + shaftLen;
  const bodyY = padY;
  const bodyCx = bodyX + bodyW / 2;
  const bodyCy = bodyY + bodyH / 2;

  // Shaft proportions relative to body
  const shaftR = Math.max(4, bodyH * 0.12);
  const shaftY = bodyCy - shaftR;
  const endCapRx = Math.max(2, bodyH * 0.04);

  // Shaft positions
  const leftShaftX = bodyX - shaftLen;
  const rightShaftX = bodyX + bodyW;

  // Dimension line offset from body edge
  const dimOffset = 16;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full max-w-sm"
      style={{ maxHeight: '140px' }}
      role="img"
      aria-label={`Roller diagram${diameter ? `, diameter ${diameter}mm` : ''}${length ? `, length ${length}mm` : ''}`}
    >
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d1d5db" />
          <stop offset="30%" stopColor="#9ca3af" />
          <stop offset="50%" stopColor="#6b7280" />
          <stop offset="70%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
        <linearGradient id="shaftGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="50%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </linearGradient>
        <linearGradient id="endGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
      </defs>

      {/* Left shaft */}
      <rect
        x={leftShaftX} y={shaftY}
        width={shaftLen} height={shaftR * 2}
        rx={2}
        fill="url(#shaftGrad)"
        stroke="#9ca3af" strokeWidth={0.5}
      />

      {/* Left end cap */}
      <ellipse
        cx={bodyX} cy={bodyCy}
        rx={endCapRx} ry={bodyH / 2}
        fill="url(#endGrad)" opacity={0.6}
      />

      {/* Roller body */}
      <rect
        x={bodyX} y={bodyY}
        width={bodyW} height={bodyH}
        fill="url(#bodyGrad)"
        stroke="#6b7280" strokeWidth={0.5}
      />

      {/* Right end cap */}
      <ellipse
        cx={bodyX + bodyW} cy={bodyCy}
        rx={endCapRx} ry={bodyH / 2}
        fill="#9ca3af"
      />

      {/* Right shaft */}
      <rect
        x={rightShaftX} y={shaftY}
        width={shaftLen} height={shaftR * 2}
        rx={2}
        fill="url(#shaftGrad)"
        stroke="#9ca3af" strokeWidth={0.5}
      />

      {/* Cover texture lines */}
      {[0.2, 0.4, 0.6, 0.8].map(pct => (
        <line
          key={pct}
          x1={bodyX + bodyW * pct} y1={bodyY}
          x2={bodyX + bodyW * pct} y2={bodyY + bodyH}
          stroke="#6b7280" strokeWidth={0.3} opacity={0.3}
        />
      ))}

      {/* === Dimension lines === */}

      {/* Diameter dimension (right side) */}
      {diameter && (
        <g>
          <line
            x1={rightShaftX + shaftLen + 4} y1={bodyY}
            x2={rightShaftX + shaftLen + dimOffset + 4} y2={bodyY}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={rightShaftX + shaftLen + 4} y1={bodyY + bodyH}
            x2={rightShaftX + shaftLen + dimOffset + 4} y2={bodyY + bodyH}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={rightShaftX + shaftLen + dimOffset} y1={bodyY}
            x2={rightShaftX + shaftLen + dimOffset} y2={bodyY + bodyH}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <polygon
            points={`${rightShaftX + shaftLen + dimOffset - 3},${bodyY + 5} ${rightShaftX + shaftLen + dimOffset + 3},${bodyY + 5} ${rightShaftX + shaftLen + dimOffset},${bodyY}`}
            fill="#1DB898"
          />
          <polygon
            points={`${rightShaftX + shaftLen + dimOffset - 3},${bodyY + bodyH - 5} ${rightShaftX + shaftLen + dimOffset + 3},${bodyY + bodyH - 5} ${rightShaftX + shaftLen + dimOffset},${bodyY + bodyH}`}
            fill="#1DB898"
          />
          <text
            x={rightShaftX + shaftLen + dimOffset + 4}
            y={bodyCy + 4}
            fontSize={14} fill="#1DB898" fontWeight={600}
          >
            ⌀{diameter}
          </text>
        </g>
      )}

      {/* Length dimension (bottom) */}
      {length && (
        <g>
          <line
            x1={bodyX} y1={bodyY + bodyH + 4}
            x2={bodyX} y2={bodyY + bodyH + dimOffset + 4}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={bodyX + bodyW} y1={bodyY + bodyH + 4}
            x2={bodyX + bodyW} y2={bodyY + bodyH + dimOffset + 4}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={bodyX} y1={bodyY + bodyH + dimOffset}
            x2={bodyX + bodyW} y2={bodyY + bodyH + dimOffset}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <polygon
            points={`${bodyX + 5},${bodyY + bodyH + dimOffset - 3} ${bodyX + 5},${bodyY + bodyH + dimOffset + 3} ${bodyX},${bodyY + bodyH + dimOffset}`}
            fill="#1DB898"
          />
          <polygon
            points={`${bodyX + bodyW - 5},${bodyY + bodyH + dimOffset - 3} ${bodyX + bodyW - 5},${bodyY + bodyH + dimOffset + 3} ${bodyX + bodyW},${bodyY + bodyH + dimOffset}`}
            fill="#1DB898"
          />
          <text
            x={bodyCx}
            y={bodyY + bodyH + dimOffset - 4}
            fontSize={14} fill="#1DB898" fontWeight={600}
            textAnchor="middle"
          >
            {length} mm
          </text>
        </g>
      )}
    </svg>
  );
}
