import { useId, useMemo, useState } from 'react';

export interface ChartPoint {
  /** Etiqueta del eje X, ya formateada (ej. "31 ago"). */
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

/**
 * Gráfica interactiva sin dependencias externas.
 *
 * Trabaja en centavos enteros y solo divide al calcular la posición en
 * píxeles, que es lo único donde un decimal no hace daño. El eje siempre
 * arranca en cero: recortarlo exagera visualmente diferencias pequeñas, y en
 * un panel de ventas eso es engañar al dueño.
 */
export function Chart({ points, height = 160, seriesName = 'Serie', variant = 'line' }: ChartProps) {
  const [activo, setActivo] = useState<number | null>(null);
  const gradId = useId();

  const { max, ancho, puntos } = useMemo(() => {
    const maxV = points.reduce((m, p) => (p.valueCents > m ? p.valueCents : m), 0n);
    const w = Math.max(points.length - 1, 1);
    const escala = maxV === 0n ? 0 : 1;
    const pts = points.map((p, i) => ({
      x: (i / w) * 100,
      y:
        escala === 0
          ? 100
          : 100 - Number((p.valueCents * 10000n) / maxV) / 100,
      ...p
    }));
    return { max: maxV, ancho: w, puntos: pts };
  }, [points]);

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
    <div className="relative w-full" style={{ height }}>
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
        </defs>

        {/* Rejilla: cuartos del máximo */}
        {[0, 25, 50, 75, 100].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.3"
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
            const w = 100 / puntos.length;
            return (
              <rect
                key={i}
                x={i * w + w * 0.2}
                y={p.y}
                width={w * 0.6}
                height={100 - p.y}
                fill="var(--accent)"
                opacity={activo === null || activo === i ? 1 : 0.45}
              />
            );
          })
        )}

        {/* Punto resaltado */}
        {activoPunto && variant === 'line' && (
          <circle
            cx={activoPunto.x}
            cy={activoPunto.y}
            r="3"
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

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

      {/* Globo de valor */}
      {activoPunto && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 shadow-md"
          style={{ left: `${activoPunto.x}%`, top: `${activoPunto.y}%` }}
        >
          <div className="whitespace-nowrap text-[10px] text-text-3">{activoPunto.label}</div>
          <div className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-text-1">
            {formatoCordobas(activoPunto.valueCents)}
          </div>
        </div>
      )}

      {/* Extremos del eje X */}
      <div className="mt-1 flex justify-between text-[10px] text-text-3">
        <span>{points[0]?.label}</span>
        {ancho > 1 && <span>{points[points.length - 1]?.label}</span>}
      </div>
    </div>
  );
}
