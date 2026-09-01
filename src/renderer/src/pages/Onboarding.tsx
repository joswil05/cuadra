import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { IndustryProfile, TaxRegime } from '../../../core/onboarding';
import { OnboardingContract } from '../../../shared/ipc';
import { call } from '../lib/api';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const { success, error } = useToast();

  // Form State
  // Campos vacíos a propósito. Un asistente precargado con el RUC de otro
  // negocio se acepta sin leer, y ese dato termina impreso en cada factura.
  const [industry, setIndustry] = useState<IndustryProfile>('minimarket');
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('general');
  const [businessName, setBusinessName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [ruc, setRuc] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [dgiAuthNumber, setDgiAuthNumber] = useState('');
  const [initialFundNio, setInitialFundNio] = useState('0.00');
  const [initialFundUsd, setInitialFundUsd] = useState('0.00');
  const [adminFullName, setAdminFullName] = useState('');
  const [saving, setSaving] = useState(false);

  /** "1500.50" -> 150050n. Sin decimales flotantes en ningún punto. */
  const toCents = (text: string): bigint => {
    const clean = text.trim().replace(/,/g, '');
    const [whole = '0', frac = ''] = clean.split('.');
    const cents = (frac + '00').slice(0, 2);
    const sign = whole.startsWith('-') ? -1n : 1n;
    const wholeDigits = whole.replace(/[^0-9]/g, '') || '0';
    return sign * (BigInt(wholeDigits) * 100n + BigInt(cents || '0'));
  };

  const handleFinish = async () => {
    if (!businessName.trim() || !ruc.trim() || !address.trim() || !phone.trim() || !adminFullName.trim()) {
      error('Faltan datos obligatorios', 'Razón social, RUC, dirección, teléfono y responsable.');
      return;
    }

    setSaving(true);
    try {
      const res = await call(OnboardingContract, {
        businessName: businessName.trim(),
        tradeName: tradeName.trim() || undefined,
        ruc: ruc.trim(),
        address: address.trim(),
        phone: phone.trim(),
        dgiAuthNumber: dgiAuthNumber.trim() || undefined,
        taxRegime,
        industryProfile: industry,
        initialCashFundNio: toCents(initialFundNio),
        initialCashFundUsd: toCents(initialFundUsd),
        adminFullName: adminFullName.trim()
      });
      success(
        'Configuración completada',
        `${res.seededProductsCount} productos sembrados y turno abierto.`
      );
      onComplete();
    } catch (err) {
      error('No se pudo completar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-6 max-w-3xl mx-auto font-sans">
      <div className="w-full bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Cabecera del Asistente */}
        <div className="p-6 bg-surface-2 border-b border-border flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-text-1">Bienvenido a Cuadra</span>
              <Badge variant="info">Paso {step} de 3</Badge>
            </div>
            <p className="text-xs text-text-2 mt-0.5">
              Configura tu negocio en 2 minutos para empezar a vender hoy mismo
            </p>
          </div>
          <div className="flex gap-1">
            <div className={`w-8 h-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-surface-3'}`} />
            <div className={`w-8 h-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-surface-3'}`} />
            <div className={`w-8 h-2 rounded-full ${step >= 3 ? 'bg-primary' : 'bg-surface-3'}`} />
          </div>
        </div>

        {/* Contenido según el Paso */}
        <div className="p-6">
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-semibold text-text-1">1. Elige el Rubro y Régimen Tributario</h2>
                <p className="text-xs text-text-3">Cuadra adaptará las columnas del POS, unidades y catálogos de muestra.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opción Minimarket */}
                <div
                  onClick={() => setIndustry('minimarket')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    industry === 'minimarket'
                      ? 'border-primary bg-surface-2 shadow-md'
                      : 'border-border bg-surface hover:border-border-focus'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-sm text-text-1">Minisúper / Pulpería</span>
                    <Badge variant={industry === 'minimarket' ? 'success' : 'neutral'}>
                      {industry === 'minimarket' ? 'Seleccionado' : 'Elegir'}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-2">
                    Abarrotes, bebidas, códigos de barras rápidos, control de lote/caducidad y granel.
                  </p>
                </div>

                {/* Opción Ropa y Calzado */}
                <div
                  onClick={() => setIndustry('apparel')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    industry === 'apparel'
                      ? 'border-primary bg-surface-2 shadow-md'
                      : 'border-border bg-surface hover:border-border-focus'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-sm text-text-1">Ropa y Calzado</span>
                    <Badge variant={industry === 'apparel' ? 'success' : 'neutral'}>
                      {industry === 'apparel' ? 'Seleccionado' : 'Elegir'}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-2">
                    Matriz de variantes por talla y color, etiquetas personalizadas y búsqueda ágil.
                  </p>
                </div>
              </div>

              {/* Selector de Régimen Tributario */}
              <div className="mt-2 pt-4 border-t border-border">
                <label className="block text-xs font-semibold text-text-1 mb-2">
                  Régimen Tributario ante la DGI
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() => setTaxRegime('general')}
                    className={`p-3 rounded-lg border cursor-pointer text-xs ${
                      taxRegime === 'general'
                        ? 'border-primary bg-surface-2 font-medium text-text-1'
                        : 'border-border bg-surface text-text-2'
                    }`}
                  >
                    <div className="font-bold text-text-1">Régimen General</div>
                    <div className="text-[11px] text-text-3 mt-0.5">Traslada 15% IVA con desglose oficial DGI.</div>
                  </div>

                  <div
                    onClick={() => setTaxRegime('cuota_fija')}
                    className={`p-3 rounded-lg border cursor-pointer text-xs ${
                      taxRegime === 'cuota_fija'
                        ? 'border-primary bg-surface-2 font-medium text-text-1'
                        : 'border-border bg-surface text-text-2'
                    }`}
                  >
                    <div className="font-bold text-text-1">Cuota Fija (Sin IVA)</div>
                    <div className="text-[11px] text-text-3 mt-0.5">El ticket y pantalla nunca muestran la palabra IVA.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-text-1">2. Datos Fiscales del Negocio</h2>
                <p className="text-xs text-text-3">Requeridos por la Disposición Técnica 09-2007 de la DGI para comprobantes.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-2 mb-1">Nombre Legal / Razón Social</label>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-2 mb-1">Nombre Comercial</label>
                  <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-2 mb-1">Número RUC</label>
                  <Input value={ruc} onChange={(e) => setRuc(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-2 mb-1">Teléfono</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-text-2 mb-1">Dirección Física</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                {taxRegime === 'general' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs text-text-2 mb-1">No. Autorización DGI (Sistema de Facturación)</label>
                    <Input value={dgiAuthNumber} onChange={(e) => setDgiAuthNumber(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-text-1">3. Administrador y Fondo Inicial de Caja</h2>
                <p className="text-xs text-text-3">Apertura automática del primer turno para comenzar a cobrar de inmediato.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-2 mb-1">Nombre del Administrador / Dueño</label>
                  <Input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs text-text-2 mb-1">PIN Rápido para POS</label>
                  <Input type="password" defaultValue="1234" maxLength={4} />
                </div>

                <div className="p-3 bg-surface-2 border border-border rounded-xl">
                  <label className="block text-xs font-semibold text-text-1 mb-1">Fondo de Caja (Córdobas C$)</label>
                  <Input
                    value={initialFundNio}
                    onChange={(e) => setInitialFundNio(e.target.value)}
                    className="font-mono text-base font-bold"
                  />
                  <span className="text-[10px] text-text-3 mt-1 block">Billetes y monedas de cambio en C$</span>
                </div>

                <div className="p-3 bg-surface-2 border border-border rounded-xl">
                  <label className="block text-xs font-semibold text-text-1 mb-1">Fondo de Caja (Dólares US$)</label>
                  <Input
                    value={initialFundUsd}
                    onChange={(e) => setInitialFundUsd(e.target.value)}
                    className="font-mono text-base font-bold"
                  />
                  <span className="text-[10px] text-text-3 mt-1 block">Billetes en dólares en el cajón</span>
                </div>
              </div>

              <div className="p-3 bg-success/10 border border-success/30 rounded-xl text-xs text-text-1">
                ✓ Se sembrará un catálogo inicial de muestra de <strong>{industry === 'minimarket' ? 'Minisúper' : 'Ropa'}</strong> con stock en Kardex y series oficiales (Tickets T-, Facturas F-).
              </div>
            </div>
          )}
        </div>

        {/* Botones de Navegación del Asistente */}
        <div className="p-4 bg-surface-2 border-t border-border flex justify-between items-center">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
              Atrás
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
              Siguiente
            </Button>
          ) : (
            <Button variant="primary" onClick={handleFinish} disabled={saving}>
              ¡Completar y Comenzar a Vender!
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
