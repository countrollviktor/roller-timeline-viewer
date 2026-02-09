interface RollerDiagramProps {
  type?: string;
  diameter?: number;
  length?: number;
}

export function RollerDiagram({ type, diameter, length }: RollerDiagramProps) {
  if (!diameter && !length) return null;

  const isSleeve = type?.toUpperCase() === 'SLEEVE';

  // Use real dimensions to calculate proportions
  const realD = diameter || 150;
  const realL = length || 800;
  const ratio = realL / realD;

  // Layout constants
  const endLen = isSleeve ? 12 : 24; // shaft length or end-ring width
  const dimMarginRight = 60;
  const dimMarginBottom = 28;
  const padX = 10;
  const padY = 10;

  // Scale body to fit proportionally within a max bounding box
  const maxBodyW = 280;
  const maxBodyH = 120;

  let bodyW: number;
  let bodyH: number;

  if (ratio >= maxBodyW / maxBodyH) {
    bodyW = maxBodyW;
    bodyH = Math.max(20, bodyW / ratio);
  } else {
    bodyH = maxBodyH;
    bodyW = Math.max(40, bodyH * ratio);
  }

  // SVG dimensions
  const svgW = padX + endLen + bodyW + endLen + dimMarginRight + padX;
  const svgH = padY + bodyH + dimMarginBottom + padY;

  // Body position
  const bodyX = padX + endLen;
  const bodyY = padY;
  const bodyCx = bodyX + bodyW / 2;
  const bodyCy = bodyY + bodyH / 2;

  // End cap ellipse rx (sleeves need bigger caps to show bore clearly)
  const endCapRx = isSleeve ? Math.max(8, bodyH * 0.1) : Math.max(2, bodyH * 0.04);

  // Dimension line offset
  const dimOffset = 16;

  // Dimension extension line start (right of body or right of shaft)
  const dimExtX = isSleeve
    ? bodyX + bodyW + endCapRx * 1.5 + 4
    : bodyX + bodyW + endLen + 4;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full max-w-sm"
      style={{ maxHeight: '140px' }}
      role="img"
      aria-label={`${isSleeve ? 'Sleeve' : 'Roller'} diagram${diameter ? `, diameter ${diameter}mm` : ''}${length ? `, length ${length}mm` : ''}`}
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
        <linearGradient id="boreGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="40%" stopColor="#f9fafb" />
          <stop offset="60%" stopColor="#f9fafb" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
      </defs>

      {isSleeve ? (
        <>
          {/* === SLEEVE === */}
          {(() => {
            const boreRy = bodyH * 0.35;
            const boreRx = Math.max(4, endCapRx * 0.55);
            return (
              <>
                {/* Right end curve (wider rx for visible curvature) */}
                <ellipse
                  cx={bodyX + bodyW} cy={bodyCy}
                  rx={endCapRx * 1.5} ry={bodyH / 2}
                  fill="url(#bodyGrad)"
                />

                {/* Sleeve body (no stroke — end ellipses provide left/right edges) */}
                <rect
                  x={bodyX} y={bodyY}
                  width={bodyW} height={bodyH}
                  fill="url(#bodyGrad)"
                />
                {/* Top and bottom body edges */}
                <line
                  x1={bodyX} y1={bodyY}
                  x2={bodyX + bodyW} y2={bodyY}
                  stroke="#6b7280" strokeWidth={0.5}
                />
                <line
                  x1={bodyX} y1={bodyY + bodyH}
                  x2={bodyX + bodyW} y2={bodyY + bodyH}
                  stroke="#6b7280" strokeWidth={0.5}
                />

                {/* Inner bore lines (dashed, showing hollow interior) */}
                <line
                  x1={bodyX} y1={bodyCy - boreRy}
                  x2={bodyX + bodyW} y2={bodyCy - boreRy}
                  stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="4 3"
                />
                <line
                  x1={bodyX} y1={bodyCy + boreRy}
                  x2={bodyX + bodyW} y2={bodyCy + boreRy}
                  stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="4 3"
                />

                {/* Left end face (outer ring) */}
                <ellipse
                  cx={bodyX} cy={bodyCy}
                  rx={endCapRx} ry={bodyH / 2}
                  fill="url(#endGrad)"
                  stroke="#6b7280" strokeWidth={0.5}
                />
                {/* Left bore hole (hollow center) */}
                <ellipse
                  cx={bodyX} cy={bodyCy}
                  rx={boreRx} ry={boreRy}
                  fill="url(#boreGrad)"
                  stroke="#9ca3af" strokeWidth={0.7}
                />
              </>
            );
          })()}
        </>
      ) : (
        <>
          {/* === ROLLER === */}

          {/* Left shaft */}
          {(() => {
            const shaftR = Math.max(4, bodyH * 0.12);
            const shaftY = bodyCy - shaftR;
            return (
              <rect
                x={bodyX - endLen} y={shaftY}
                width={endLen} height={shaftR * 2}
                rx={2}
                fill="url(#shaftGrad)"
                stroke="#9ca3af" strokeWidth={0.5}
              />
            );
          })()}

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
          {(() => {
            const shaftR = Math.max(4, bodyH * 0.12);
            const shaftY = bodyCy - shaftR;
            return (
              <rect
                x={bodyX + bodyW} y={shaftY}
                width={endLen} height={shaftR * 2}
                rx={2}
                fill="url(#shaftGrad)"
                stroke="#9ca3af" strokeWidth={0.5}
              />
            );
          })()}
        </>
      )}

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

      {/* Diameter (right side) */}
      {diameter && (
        <g>
          <line
            x1={dimExtX} y1={bodyY}
            x2={dimExtX + dimOffset} y2={bodyY}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={dimExtX} y1={bodyY + bodyH}
            x2={dimExtX + dimOffset} y2={bodyY + bodyH}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <line
            x1={dimExtX + dimOffset - 4} y1={bodyY}
            x2={dimExtX + dimOffset - 4} y2={bodyY + bodyH}
            stroke="#1DB898" strokeWidth={0.8}
          />
          <polygon
            points={`${dimExtX + dimOffset - 7},${bodyY + 5} ${dimExtX + dimOffset - 1},${bodyY + 5} ${dimExtX + dimOffset - 4},${bodyY}`}
            fill="#1DB898"
          />
          <polygon
            points={`${dimExtX + dimOffset - 7},${bodyY + bodyH - 5} ${dimExtX + dimOffset - 1},${bodyY + bodyH - 5} ${dimExtX + dimOffset - 4},${bodyY + bodyH}`}
            fill="#1DB898"
          />
          <text
            x={dimExtX + dimOffset + 2}
            y={bodyCy + 5}
            fontSize={14} fill="#1DB898" fontWeight={600}
          >
            ⌀{diameter}
          </text>
        </g>
      )}

      {/* Length (bottom) */}
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
