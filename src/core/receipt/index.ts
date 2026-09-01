import { TaxKind, TaxRegime } from '../tax';

export interface ReceiptLine {
  description: string;
  qtyMilli: bigint;
  unitPriceCents: bigint;
  totalCents: bigint;
  taxKind: TaxKind;
  taxRateBp: bigint;
}

export interface ReceiptPayment {
  method: string;
  currencyCode: 'NIO' | 'USD';
  amountFx: bigint;
  amountCents: bigint;
}

export interface ReceiptData {
  companyName: string;
  tradeName?: string;
  address: string;
  phone: string;
  ruc: string;
  dgiAuthNumber: string;
  seriesPrefix: string;
  folio: string;
  at: string;
  docType: 'ticket' | 'invoice' | 'credit_note' | 'proforma';
  paymentCondition: 'contado' | 'credito';
  taxRegime: TaxRegime;
  cashierName: string;
  customerName?: string;
  customerRuc?: string;
  lines: ReceiptLine[];
  taxableBaseCents: bigint;
  exemptBaseCents: bigint;
  taxCents: bigint;
  cashRoundingCents: bigint;
  totalCents: bigint;
  payments: ReceiptPayment[];
  changeCents: bigint;
}

function formatCents(cents: bigint): string {
  const isNeg = cents < 0n;
  const abs = isNeg ? -cents : cents;
  const major = abs / 100n;
  const minor = abs % 100n;
  const sign = isNeg ? '-' : '';
  return `${sign}C$ ${major.toString()}.${minor.toString().padStart(2, '0')}`;
}

function formatQty(qtyMilli: bigint): string {
  const major = qtyMilli / 1000n;
  const minor = qtyMilli % 1000n;
  if (minor === 0n) return major.toString();
  return `${major.toString()}.${minor.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

/**
 * Formatea el texto del ticket / factura para rollo estándar de 80 mm
 * con todos los ocho datos que la DGI exige según la Disposición Técnica 09-2007.
 */
export function formatReceipt80mm(data: ReceiptData): string {
  const sep = '------------------------------------------------';
  const out: string[] = [];

  // 1. Nombre completo del emisor
  out.push(data.companyName);

  // 2. Nombre comercial
  if (data.tradeName) {
    out.push(data.tradeName);
  }

  // 3. Dirección y teléfono
  out.push(data.address);
  out.push(`Tel: ${data.phone}`);

  // 4. RUC del emisor
  out.push(`RUC: ${data.ruc}`);
  out.push(sep);

  // Documento y fecha
  const docTypeName = data.docType === 'invoice' ? 'FACTURA' : data.docType === 'credit_note' ? 'NOTA DE CREDITO' : 'TICKET DE VENTA';
  out.push(`${docTypeName}: ${data.folio}`);
  out.push(`FECHA: ${data.at}`);

  // 5. Indicación expresa de contado o crédito
  out.push(`CONDICION: ${data.paymentCondition.toUpperCase()}`);
  out.push(`CAJERO: ${data.cashierName}`);

  if (data.customerName) {
    out.push(`CLIENTE: ${data.customerName}`);
  }
  if (data.customerRuc && data.customerRuc !== 'N/A') {
    out.push(`RUC CLIENTE: ${data.customerRuc}`);
  }

  out.push(sep);
  out.push('CANT  DESCRIPCION                 P.UNIT     TOTAL');
  out.push(sep);

  for (const line of data.lines) {
    const qtyStr = formatQty(line.qtyMilli).padEnd(5, ' ');
    const descStr = line.description.substring(0, 20).padEnd(20, ' ');
    const priceStr = (Number(line.unitPriceCents) / 100).toFixed(2).padStart(8, ' ');
    const totalStr = (Number(line.totalCents) / 100).toFixed(2).padStart(9, ' ');
    out.push(`${qtyStr} ${descStr} ${priceStr} ${totalStr}`);
  }

  out.push(sep);

  // 6. Desglose de impuestos (solo en régimen general; en cuota fija no se cobra ni se muestra IVA)
  if (data.taxRegime !== 'cuota_fija') {
    out.push(`Gravado:               ${formatCents(data.taxableBaseCents).padStart(25, ' ')}`);
    out.push(`Exento:                ${formatCents(data.exemptBaseCents).padStart(25, ' ')}`);
    out.push(`IVA (15%):             ${formatCents(data.taxCents).padStart(25, ' ')}`);
  }

  if (data.cashRoundingCents !== 0n) {
    out.push(`Redondeo efectivo:     ${formatCents(data.cashRoundingCents).padStart(25, ' ')}`);
  }

  out.push(`TOTAL:                 ${formatCents(data.totalCents).padStart(25, ' ')}`);
  out.push(sep);

  // Pagos y vuelto
  for (const p of data.payments) {
    if (p.currencyCode === 'USD') {
      const usdMajor = p.amountFx / 100n;
      const usdMinor = p.amountFx % 100n;
      const usdStr = `$ ${usdMajor}.${usdMinor.toString().padStart(2, '0')}`;
      out.push(`PAGO (USD ${usdStr}):    ${formatCents(p.amountCents).padStart(25, ' ')}`);
    } else {
      out.push(`PAGO (${p.method.toUpperCase()} NIO):   ${formatCents(p.amountCents).padStart(25, ' ')}`);
    }
  }

  if (data.changeCents > 0n) {
    out.push(`VUELTO:                ${formatCents(data.changeCents).padStart(25, ' ')}`);
  }

  out.push(sep);

  // 7. Número de autorización de la DGI en la parte inferior
  out.push(`No. AUTORIZACION DGI: ${data.dgiAuthNumber}`);
  out.push('Gracias por su compra');

  return out.join('\n');
}

/**
 * Retorna el comando ESC/POS estándar para disparo de solenoide de apertura de cajón de dinero.
 * Secuencia: ESC p 0 25 250 (Pin 2, pulso ON 50ms, OFF 500ms).
 */
export function getEscPosDrawerKick(): Uint8Array {
  return new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
}
