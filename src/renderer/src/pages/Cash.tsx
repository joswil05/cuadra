import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { KpiCard } from '../components/patterns/KpiCard';
import { ShiftOpenContract, ShiftBlindContract, ShiftCloseContract } from '../../../shared/ipc';
import { call } from '../lib/api';
import { useIpcQuery } from '../hooks/useIpc';
import { useSession } from '../lib/session';

/** Denominaciones en circulación en Nicaragua, en centavos. */
const BILLETES_NIO = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const MONEDAS_NIO = [500, 100, 50, 25, 10, 5];
const BILLETES_USD = [10000, 5000, 2000, 1000, 500, 200, 100];

function money(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const ent = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${ent}.${(abs % 100n).toString().padStart(2, '0')}`;
}

export function Cash() {
  const { success, error } = useToast();
  const { userId, shiftId, boot, reload } = useSession();
  const [conteoNio, setConteoNio] = useState<Record<number, string>>({});
  const [conteoUsd, setConteoUsd] = useState<Record<number, string>>({});
  const [fondoNio, setFondoNio] = useState('0.00');
  const [fondoUsd, setFondoUsd] = useState('0.00');
  const [cerrando, setCerrando] = useState(false);

  const resumen = useIpcQuery(
    ShiftBlindContract,
    { shiftId: shiftId ?? 0 },
    null
  );

  const toCents = (t: string): bigint => {
    const [w = '0', f = ''] = t.trim().replace(/,/g, '').split('.');
    return BigInt(w.replace(/[^0-9]/g, '') || '0') * 100n + BigInt(((f + '00').slice(0, 2)) || '0');
  };

  const sumar = (conteo: Record<number, string>): bigint =>
    Object.entries(conteo).reduce(
      (acc, [den, cant]) => acc + BigInt(den) * BigInt(Number(cant) || 0),
      0n
    );

  const contadoNio = sumar(conteoNio);
  const contadoUsd = sumar(conteoUsd);

  const lineas = (c: Record<number, string>) =>
    Object.entries(c)
      .filter(([, q]) => Number(q) > 0)
      .map(([den, q]) => ({ denominationCents: Number(den), quantity: Number(q) }));

  const abrirTurno = async () => {
    try {
      await call(ShiftOpenContract, {
        openedBy: userId,
        openingFloatCents: toCents(fondoNio),
        openingFloatUsd: toCents(fondoUsd)
      });
      await reload();
      success('Turno abierto', 'Ya podés cobrar en el punto de venta.');
    } catch (err) {
      error('No se pudo abrir el turno', err instanceof Error ? err.message : String(err));
    }
  };

  const cerrarTurno = async () => {
    if (!shiftId) return;
    setCerrando(true);
    try {
      const r = await call(ShiftCloseContract, {
        shiftId,
        closedBy: userId,
        countedLinesNio: lineas(conteoNio),
        countedLinesUsd: lineas(conteoUsd)
      });
      const dif = (r as unknown as { differenceCents: bigint }).differenceCents;
      const difUsd = (r as unknown as { differenceUsd: bigint }).differenceUsd;
      await reload();
      if (dif === 0n && difUsd === 0n) {
        success('Turno cerrado y cuadrado', 'Sin diferencia en ninguna moneda.');
      } else {
        error(
          'Turno cerrado con diferencia',
          `Córdobas: C$ ${money(dif)} · Dólares: $ ${money(difUsd)}`
        );
      }
    } catch (err) {
      error('No se pudo cerrar el turno', err instanceof Error ? err.message : String(err));
    } finally {
      setCerrando(false);
    }
  };

  // ------------------------------------------------------- Sin turno abierto
  if (!shiftId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-5 py-10">
        <div>
          <h1 className="text-lg font-semibold text-text-1">Abrir turno de caja</h1>
          <p className="mt-1 text-xs text-text-2">
            Contá el efectivo con el que arrancás. Sin turno abierto no se puede cobrar, porque
            cada venta en efectivo tiene que entrar a un cajón identificado.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-2">Fondo inicial en córdobas (C$)</span>
            <Input value={fondoNio} onChange={(e) => setFondoNio(e.target.value)} inputMode="decimal" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-2">Fondo inicial en dólares ($)</span>
            <Input value={fondoUsd} onChange={(e) => setFondoUsd(e.target.value)} inputMode="decimal" />
          </label>
          <Button variant="primary" onClick={abrirTurno}>
            Abrir turno
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------- Turno abierto
  const datos = resumen.data as { folio?: string; openedAt?: string } | null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-1">Caja y arqueo</h1>
          <p className="mt-0.5 text-xs text-text-2">
            Turno {datos?.folio ?? boot?.openShift?.folio ?? '—'} · abierto desde{' '}
            {datos?.openedAt ? new Date(datos.openedAt).toLocaleString() : '—'}
          </p>
        </div>
        <Badge variant="success">Turno abierto</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <KpiCard
          title="Contado en córdobas"
          value={`C$ ${money(contadoNio)}`}
          subValue="Lo que llevás contado abajo"
        />
        <KpiCard
          title="Contado en dólares"
          value={`$ ${money(contadoUsd)}`}
          subValue="Se reconcilia por separado"
        />
      </div>

      <div className="rounded-xl border border-warning bg-surface-2 px-4 py-3">
        <p className="text-xs text-text-2">
          <strong className="text-text-1">Cierre ciego.</strong> El sistema no te muestra cuánto
          debería haber hasta que confirmes tu conteo. Es a propósito: si vieras el esperado,
          dejarías de contar y empezarías a cuadrar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConteoMoneda
          titulo="Córdobas"
          simbolo="C$"
          denominaciones={[...BILLETES_NIO, ...MONEDAS_NIO]}
          valores={conteoNio}
          onChange={setConteoNio}
        />
        <ConteoMoneda
          titulo="Dólares"
          simbolo="$"
          denominaciones={BILLETES_USD}
          valores={conteoUsd}
          onChange={setConteoUsd}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={cerrarTurno} disabled={cerrando}>
          {cerrando ? 'Cerrando…' : 'Confirmar conteo y cerrar turno'}
        </Button>
      </div>
    </div>
  );
}

function ConteoMoneda({
  titulo,
  simbolo,
  denominaciones,
  valores,
  onChange
}: {
  titulo: string;
  simbolo: string;
  denominaciones: number[];
  valores: Record<number, string>;
  onChange: (v: Record<number, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-1">{titulo}</h2>
      <div className="flex flex-col gap-1.5">
        {denominaciones.map((den) => {
          const cant = Number(valores[den] ?? 0);
          const subtotal = BigInt(den) * BigInt(cant || 0);
          return (
            <div key={den} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-text-2">
                {simbolo} {money(BigInt(den))}
              </span>
              <Input
                className="w-20"
                inputMode="numeric"
                value={valores[den] ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ ...valores, [den]: e.target.value })}
              />
              <span className="flex-1 text-right font-mono text-xs tabular-nums text-text-3">
                {simbolo} {money(subtotal)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
