import { useId, useMemo, useState } from 'react';

export interface ChartPoint {
  /** Etiqueta del eje X, ya formateada (ej. "31 ago" o "Sep 2026"). */
  label: string;
  /** Valor en centavos. Entero, como todo el dinero del sistema. */
  valueCents: bigint;
}

interface ChartProps {
  points: ChartPoint[];
  /** Alto del área de dibujo en píxeles. */
  height?: number;
  /** Cómo se llama lo que se mide, para el lector de pantalla. */
  seriesName?: string;
  variant?: 'line' | 'bar';
}

function formatoCordobas(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const entero = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}C$ ${entero}.${dec}`;
}

function formatoCompacto(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const cordobas = Number(abs / 100n);
  if (cordobas >= 1_000_000) {
    const val = (cordobas / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${neg ? '-' : ''}C$ ${val}M`;
  }
  if (cordobas >= 10_000) {
    return `${neg ? '-' : ''}C$ ${Math.round(cordobas / 1_000)}k`;
  }
  if (cordobas >= 1_000) {
    const val = (cordobas / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${neg ? '-' : ''}C$ ${val}k`;
  }
  return `${neg ? '-' : ''}C$ ${cordobas}`;
}

/**
 * Gráfica interactiva sin dependencias externas.
 *
 * Trabaja en centavos enteros y solo divide al calcular la posición en
 * píxeles, que es lo único donde un decimal no hace daño. El eje siempre
 * arranca en cero: recortarlo exagera visualmente diferencias pequeñas, y en
 * un panel de ventas eso es engañar al dueño.
 */
export function Chart({
  points,
  height = 160,
  seriesName = 'Serie',
  variant = 'line'
}: ChartProps) {
  const [activo, setActivo] = useState<number | null>(null);
  const gradId = useId();
  const barGradId = useId();

  const { max, puntos, barWidth } = useMemo(() => {
    const maxV = points.reduce((m, p) => (p.valueCents > m ? p.valueCents : m), 0n);
    const n = Math.max(points.length, 1);
    const effectiveMax = maxV === 0n ? 10000n : maxV;

    // Para barras: limitar el ancho a un máximo razonable (14%) para no crear
    // paredes gigantes cuando hay 1 o 2 elementos.
    const slotW = 100 / n;
    const bW = variant === 'bar' ? Math.min(slotW * 0.58, 14) : 0;

    const pts = points.map((p, i) => {
      const yVal =
        maxV === 0n
          ? 100
          : 100 - Number((p.valueCents * 10000n) / effectiveMax) / 100;

      let xVal = 0;
      let barX = 0;

      if (variant === 'bar') {
        barX = i * slotW + (slotW - bW) / 2;
        xVal = barX + bW / 2;
      } else {
        const w = Math.max(points.length - 1, 1);
        xVal = (i / w) * 100;
      }

      return {
        ...p,
        x: xVal,
        y: yVal,
        barX,
        barY: yVal,
        barH: Math.max(100 - yVal, p.valueCents > 0n ? 2 : 0)
      };
    });

    return { max: maxV, puntos: pts, barWidth: bW };
  }, [points, variant]);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-text-3"
        style={{ height }}
      >
        Sin movimientos en el período
      </div>
    );
  }

  const linea = puntos.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `0,100 ${linea} 100,100`;
  const activoPunto = activo !== null ? puntos[activo] : null;

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Contenedor principal con eje Y a la izquierda y área de dibujo */}
      <div className="flex gap-2 w-full" style={{ height }}>
        {/* Eje Y con escala numérica real */}
        <div className="flex flex-col justify-between text-right text-[10px] text-text-3 font-mono tabular-nums select-none py-0.5 shrink-0 min-w-[54px]">
          <span>{formatoCompacto(max)}</span>
          <span>{formatoCompacto(max / 2n)}</span>
          <span>C$ 0</span>
        </div>

        {/* Lienzo SVG interactivo */}
        <div className="relative flex-1 h-full min-w-0">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label={`${seriesName}. Máximo ${formatoCordobas(max)} en ${points.length} períodos.`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            {/* Rejilla: 0%, 50%, 100% */}
            {[0, 50, 100].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="100"
                y2={y}
                stroke="var(--border)"
                strokeWidth="0.5"
                strokeDasharray={y === 100 ? undefined : '2 2'}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {variant === 'line' ? (
              <>
                <polygon points={area} fill={`url(#${gradId})`} />
                <polyline
                  points={linea}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            ) : (
              puntos.map((p, i) => {
                const isActivo = activo === i;
                return (
                  <rect
                    key={i}
                    x={p.barX}
                    y={p.barY}
                    width={barWidth}
                    height={p.barH}
                    rx="1.5"
                    fill={`url(#${barGradId})`}
                    opacity={activo === null || isActivo ? 1 : 0.45}
                    className="transition-opacity duration-fast"
                  />
                );
              })
            )}

            {/* Punto resaltado para gráfico de línea */}
            {activoPunto && variant === 'line' && (
              <circle
                cx={activoPunto.x}
                cy={activoPunto.y}
                r="3.5"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Valor directo sobre cada barra cuando hay 6 o menos barras */}
          {variant === 'bar' &&
            puntos.length <= 6 &&
            puntos.map((p, i) => {
              if (p.valueCents === 0n) return null;
              const topPos = Math.max(3, p.y - 14);
              return (
                <div
                  key={`val-${i}`}
                  className="pointer-events-none absolute -translate-x-1/2 text-center"
                  style={{
                    left: `${p.x}%`,
                    top: `${topPos}%`
                  }}
                >
                  <span className="inline-block whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-text-1 border border-border shadow-xs">
                    {formatoCordobas(p.valueCents)}
                  </span>
                </div>
              );
            })}

          {/* Zonas sensibles: una por punto, para señalar con el ratón o el teclado */}
          <div className="absolute inset-0 flex">
            {puntos.map((p, i) => (
              <button
                key={i}
                type="button"
                className="h-full flex-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                style={{ background: 'transparent' }}
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo(null)}
                aria-label={`${p.label}: ${formatoCordobas(p.valueCents)}`}
              />
            ))}
          </div>

          {/* Globo de valor (Tooltip) con posición protegida contra desbordes */}
          {activoPunto && (
            <div
              className={`pointer-events-none absolute z-20 rounded-md border border-border bg-surface px-2.5 py-1.5 shadow-lg ${
                activoPunto.y < 35 ? 'translate-y-2' : '-translate-y-full -mt-2'
              }`}
              style={{
                left: `${Math.max(12, Math.min(88, activoPunto.x))}%`,
                top: `${activoPunto.y}%`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="whitespace-nowrap text-[10px] font-medium text-text-3">
                {activoPunto.label}
              </div>
              <div className="whitespace-nowrap font-mono text-xs font-bold tabular-nums text-text-1">
                {formatoCordobas(activoPunto.valueCents)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Eje X: Etiquetas alineadas según la variante */}
      {variant === 'bar' ? (
        <div className="flex w-full pl-[62px]">
          <div className="flex w-full justify-between">
            {puntos.map((p, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[11px] font-medium text-text-2 truncate px-0.5"
                title={p.label}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-between pl-[62px] text-[10px] text-text-3">
          <span>{points[0]?.label}</span>
          {points.length > 2 && <span>{points[Math.floor(points.length / 2)]?.label}</span>}
          {points.length > 1 && <span>{points[points.length - 1]?.label}</span>}
        </div>
      )}
    </div>
  );
}

