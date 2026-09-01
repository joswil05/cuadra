# Guía operativa para la IA desarrolladora — Cuadra

Este documento no es una sugerencia. Es el contrato: **cómo** se escribe el
código. El **qué** y el **cuándo** están en `PLAN-MAESTRO.md`, que se lee
después de este y define las doce fases y sus puertas de verificación.

Si una instrucción de un ticket contradice algo de aquí, gana este documento y
se reporta el conflicto.

**El producto se llama Cuadra.** Ejecutable `Cuadra.exe`, identificador
`ni.cuadra.pos`, datos en `%APPDATA%/Cuadra`.

---

## 0. Las siete leyes innegociables

1. **El dinero es entero.** Ningún importe monetario existe como `number`
   decimal en ninguna capa: ni en SQLite, ni en el motor, ni en el estado de
   React, ni en el JSON del IPC. Solo se convierte a texto con decimales en el
   último milímetro, dentro del formateador de presentación.
2. **El motor no sabe que existe una base de datos.** Todo lo que hay en
   `src/core/` es matemática pura: entra un objeto, sale un objeto. Sin `fs`,
   sin `better-sqlite3`, sin `electron`, sin `Date.now()` (el reloj se inyecta).
   Si un archivo de `core/` necesita un import de infraestructura, el diseño
   está mal.
3. **El renderer nunca toca SQL.** La UI habla exclusivamente por IPC, con
   contratos Zod que validan en ambos extremos. `nodeIntegration: false`,
   `contextIsolation: true`, `sandbox: true`.
4. **Los libros son inmutables.** `inventory_moves`, `cash_movements`,
   `customer_ledger`, `audit_log`: solo `INSERT`. Corregir significa insertar el
   movimiento contrario, nunca editar el pasado.
5. **Una venta es una transacción o no es nada.** Todo lo que una venta toca
   (documento, líneas, pagos, Kardex, CPP, caché de stock, caja, crédito,
   puntos) ocurre dentro de un único `BEGIN IMMEDIATE`. Si algo falla, no queda
   rastro.
6. **Los totales se suman, no se calculan dos veces.** El total del documento
   es la suma de sus líneas. Está prohibido calcular el total por un camino y
   las líneas por otro: es el origen del 90% de las discrepancias de centavos.
7. **Ninguna cifra aparece en pantalla sin `tabular-nums`.** Los dígitos que no
   se alinean en columna son un defecto visual, no una preferencia.

---

## 1. Nicaragua: el marco que condiciona el cálculo

Todo lo de este documento se aplica a un negocio nicaragüense. Estas seis
reglas no son configuración opcional: son el país.

**1.1 Los precios se expresan solo en córdobas.** Desde el 1 de enero de 2025
el Banco Central exige que todo precio de bienes y servicios se muestre
exclusivamente en córdobas con el símbolo `C$`. No existe precio en dólares en
ninguna pantalla, etiqueta ni reporte.

**1.2 El dólar es medio de pago, nunca moneda de precio.** Se acepta y se
convierte a córdobas al recibirlo. Cada pago congela `fx_rate_micros`, que es
la tasa del negocio y puede diferir de la oficial del Banco Central (fija en
36.6243 con deslizamiento 0% desde 2024). **El vuelto se entrega siempre en
córdobas.** La columna que suma en todo reporte es `amount_cents`, nunca
`amount_fx`.

**1.3 El régimen tributario enciende o apaga el motor de impuestos.**

| Régimen | Quién | Qué hace el sistema |
|---|---|---|
| **Cuota fija** | Persona natural con ingresos ≤ C$100,000 al mes o inventario ≤ C$500,000 | **No traslada IVA.** El comprobante no desglosa impuestos. `tax_cents` siempre 0, y la base de datos lo verifica con un `CHECK`. |
| **General** | El resto | Traslada IVA 15%, desglosa en la factura e imprime el número de autorización de la DGI. |

Lo lee de `settings['tax.regime']` y lo **congela en cada documento** en
`sales.tax_regime`. Una tienda que cambia de régimen no reescribe su historia.

**1.4 Tres estatus de impuesto, no dos.** `taxable` (IVA 15%), `exempt`
(exento, y buena parte de la canasta básica lo está) y `not_subject`. Un
artículo exento y uno gravado al 0% suman lo mismo y se declaran distinto, así
que la factura separa **base gravada** de **base exenta** en bloques distintos,
y cada línea congela su `tax_kind`.

**Nunca codifiques una lista de productos exentos.** La lista taxativa vive en
el artículo 127 de la Ley 822 y el Ministerio de Hacienda la actualiza por
acuerdo ministerial: cualquier lista quemada en el código nace desactualizada y
hace mentir a la factura. El estatus es **dato por producto, editable**, y el
sistema debe:

- Traer todo producto nuevo con estatus **sin definir**, no con un valor por
  omisión que parezca una decisión.
- Ofrecer una pantalla de revisión masiva para marcar el catálogo entero rápido.
- Producir un reporte de **productos sin estatus definido**, y avisarlo en el
  panel del dueño mientras no esté en cero.
- No permitir la primera venta en régimen general con productos sin definir.

Quien valida esa lista es una persona que conoce la norma, no el sistema.

**1.5 Redondeo de efectivo a 5 centavos, en dos lugares.** La fracción más
pequeña en circulación es de 5 centavos. El **total del documento queda exacto
al centavo**; el redondeo ocurre solo donde el dinero se vuelve físico:

1. **El importe a pagar en efectivo** se redondea al múltiplo de 5 más cercano,
   y la diferencia se guarda con signo en `sales.cash_rounding_cents`. Un pago
   con tarjeta, transferencia o crédito nunca se redondea.
2. **La conversión de un pago en dólares** se redondea a 5 centavos antes de
   calcular el vuelto, porque el cambio sale del cajón en monedas reales.
   `US$25.00 × 36.6243 = C$915.6075` se registra como `C$915.60`. Sin este
   paso, el sistema le pide al cajero que entregue un centavo que no existe.

Es el mismo patrón que usa Odoo con su línea de redondeo y su cuenta de
ganancia o pérdida.

**1.6 Una factura emitida no se anula: se emite nota de crédito.** Lo exige la
Disposición Técnica 09-2007 de la DGI. La anulación directa (`status='voided'`)
solo se permite dentro de la ventana corta que define
`settings['sales.void_window_minutes']`, antes de entregar el documento. Pasado
ese punto, la corrección es un documento nuevo con `doc_type='credit_note'`,
su propio correlativo y su concepto.

### Lo que debe imprimir una factura del régimen general

La Disposición Técnica 09-2007 los exige todos. Si falta uno, la factura no es
válida y el negocio queda expuesto en una revisión:

- Nombre completo de la persona natural o jurídica.
- Nombre comercial, si lo tiene.
- Dirección del negocio y teléfono.
- **RUC** del emisor.
- La indicación expresa de si la operación es **de contado o de crédito**.
- **Desglose del IVA**, separado del total.
- **Número de autorización de la DGI, en la parte inferior derecha.**
- Numeración **correlativa e inalterable**, distinta por serie y por sucursal.

Además, el sistema debe permitir **registrar facturas de contingencia**: el
talonario pre-impreso que se usa cuando se va la luz o falla la impresora, con
correlativo propio y distinto al del sistema. Se captura después, con
`is_contingency = 1` y su serie. No es una función opcional: la DGI la exige
como parte de la autorización, y en Nicaragua se usa de verdad.

El respaldo diario en medios externos y el acceso con usuario y contraseña
también son requisitos de esa misma norma, no solo buenas prácticas.

**Lo que no aplica.** Nicaragua no tiene facturación electrónica obligatoria al
estilo de México, Costa Rica o Colombia. Lo que existe es la autorización de un
sistema de facturación computarizada. No implementes timbrado, firma digital ni
envío a un servicio de la autoridad: no existe ese trámite aquí.

**Impuesto Municipal sobre Ingresos.** 1% sobre ingresos brutos en Managua, y
lo fija el plan de arbitrios de cada municipio. **No es un impuesto por línea
ni aparece en el ticket**: es una declaración mensual. El sistema solo debe
producir el reporte, que ya vive en la vista `v_monthly_gross_income`.

---

## 2. El motor monetario (`src/core/money/`)

### Representación

| Concepto | Unidad de almacenamiento | Sufijo | Ejemplo |
|---|---|---|---|
| Importe | centavos de córdoba | `_cents` | `C$1,234.50` → `123450` |
| Cantidad | milésimas de unidad | `_milli` | `1.250 kg` → `1250` |
| Costo unitario | micro-unidades (6 dec) | `_micros` | `12.345678` → `12345678` |
| Tasa de impuesto | puntos base | `_bp` | `15%` → `1500` |
| Porcentaje de descuento | puntos base | `_bp` | `7.5%` → `750` |
| Tipo de cambio | micro-unidades (6 dec) | `_micros` | `36.6243` → `36624300` |

Usa `bigint` en toda operación intermedia donde el producto pueda superar
`Number.MAX_SAFE_INTEGER` (`qty_milli * unit_cost_micros` lo supera con
facilidad) y regresa a `number` solo al final, tras dividir.

### Primitivas obligatorias

```ts
/** Multiplica y divide en enteros con redondeo comercial (half-up),
 *  correcto también para negativos. Es la única función del sistema
 *  autorizada a redondear. */
export function mulDiv(value: bigint, mul: bigint, div: bigint): bigint;

/** Reparte `total` entre `weights` de modo que la suma de las partes sea
 *  EXACTAMENTE `total`. Método de mayores residuos: reparte el piso a cada
 *  parte y asigna los centavos sobrantes, uno a uno, a las partes con mayor
 *  residuo fraccionario; en caso de empate gana el índice menor.
 *  Se usa para prorratear el descuento global y el flete de compra. */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[];
```

`allocate` es la pieza que impide que un descuento de `$10.00` sobre tres
líneas se convierta en `$9.99`. Debe existir antes que cualquier pantalla.

### Orden de operaciones de una línea de venta

Este orden es obligatorio y no se puede reordenar por conveniencia:

```
1. bruto        = mulDiv(unit_price_cents, qty_milli, 1000)   → redondea aquí
2. neto_linea   = bruto - line_discount_cents
3. alloc        = allocate(order_discount_cents, [neto_linea de cada línea])
4. base_total   = neto_linea - alloc[i]
5. si regimen == 'cuota_fija' o tax_kind != 'taxable':
      base_cents = base_total
      tax_cents  = 0
   si no, si prices_include_tax:
      base_cents = mulDiv(base_total, 10000, 10000 + tax_rate_bp)
      tax_cents  = base_total - base_cents
   si no:
      base_cents = base_total
      tax_cents  = mulDiv(base_cents, tax_rate_bp, 10000)
6. total_linea  = base_cents + tax_cents
```

El documento se cierra sumando por tipo de impuesto, nunca recalculando:

```
taxable_base_cents = Σ base_cents  de las líneas con tax_kind = 'taxable'
exempt_base_cents  = Σ base_cents  de las demás
tax_cents          = Σ tax_cents
cash_rounding_cents = 0, salvo pago en efectivo (ver 1.5)
total_cents = taxable_base + exempt_base + tax + cash_rounding
```

El descuento global **ya está prorrateado dentro de las bases**: restarlo otra
vez al cerrar el documento es el error más fácil de cometer aquí, y las
restricciones `CHECK` de la tabla `sales` lo atrapan. Si un `CHECK` falla, hay
un error de cálculo y la venta debe abortar, nunca guardarse "aproximada".

---

## 3. Costo Promedio Ponderado (`src/core/costing/`)

```ts
export function applyInbound(state: CostState, qty_milli: bigint, unit_cost_micros: bigint): CostState;
export function applyOutbound(state: CostState, qty_milli: bigint): { state: CostState; cogs_cents: bigint };
```

Reglas:

- El CPP **solo cambia en entradas**. Una salida jamás modifica el promedio.
- Fórmula de entrada, en enteros:
  `nuevo_micros = (stock * cpp + qty * costo) / (stock + qty)`, con `mulDiv`.
- Toda salida **congela** en su renglón de Kardex el `unit_cost_micros` usado y
  el `balance_avg_cost_micros` resultante. Un reporte de márgenes de marzo no
  puede cambiar porque en abril entró mercancía más cara.
- El costo de venta de la línea es
  `cogs_cents = mulDiv(qty_milli, unit_cost_micros, 1_000_000_000)`.
- **Stock negativo:** con `inventory.allow_negative = false` (el default), el
  servicio de ventas rechaza la línea antes de abrir la transacción, con un
  error de dominio que la UI muestra en el POS sin cerrar el carrito. No se
  implementa el camino de costeo negativo en el MVP; si la bandera se activa,
  el servicio debe lanzar `NotImplementedError` en lugar de inventar un número.
- **Costo con flete:** al recibir una compra, el flete se prorratea con
  `allocate` sobre el valor de cada línea y produce
  `landed_unit_cost_micros`. Ese es el número que entra al CPP.

---

## 4. Arqueo de caja (`src/core/cash/`)

```
esperado = fondo_inicial + Σ movimientos_de_efectivo_del_turno
contado  = Σ (denominación × cantidad)
diferencia = contado − esperado          // negativo = faltante
```

- `esperado` se calcula **siempre** sumando el libro, nunca llevando un
  acumulador en memoria ni una columna que se va incrementando.
- Solo entra a la suma lo que realmente movió efectivo físico. Una venta pagada
  con tarjeta **no** genera movimiento de caja; una venta mixta genera un
  movimiento por la porción en efectivo.
- El movimiento de caja registra el **neto que quedó en el cajón**, no lo que
  el cliente puso sobre el mostrador: `Σ pagos en efectivo − vuelto`. En el
  documento se guardan las dos cosas por separado (`paid_cents` es lo
  entregado, `change_cents` el vuelto), y la invariante
  `paid + credit − change = total` las amarra.
- **Un pago en dólares entra al cajón como dólares.** El arqueo lleva dos
  conteos independientes, uno por moneda, cada uno con sus denominaciones, y la
  diferencia se calcula por separado. Convertir el efectivo en dólares a
  córdobas para cuadrar la caja esconde faltantes detrás del tipo de cambio.
- El redondeo a 5 centavos afecta al cajón y por lo tanto al esperado: entra
  como parte del movimiento de la venta, no como un ajuste aparte.
- Con `cash.blind_close = true`, el endpoint que devuelve el esperado no se
  llama hasta que el cajero confirma su conteo. La UI no debe pedir ese dato
  "por si acaso": si llega al renderer, se puede ver en las herramientas de
  desarrollo y el cierre ciego deja de serlo.

---

## 5. Pruebas obligatorias antes de escribir una sola pantalla

La fase 1 no se considera terminada hasta que estas suites pasan en verde:

- `money`: `mulDiv` contra una tabla de casos con negativos, ceros y empates
  en `.5`; `allocate` con residuos de 1 y 2 centavos, pesos cero y un solo peso.
- **Propiedad (fast-check), 10 000 casos por invariante:**
  - `Σ allocate(t, w) === t` para cualquier `t` y cualquier vector de pesos.
  - `Σ líneas.total === documento.total` en carritos generados al azar.
  - `Σ Kardex(variante) === stock` tras una secuencia aleatoria de entradas y
    salidas.
  - `valor_inventario === Σ (stock × cpp)` con tolerancia de cero centavos.
  - Un turno con movimientos aleatorios cierra con `diferencia === 0` cuando el
    conteo coincide con el esperado.
- **Casos de oro (regresión), calculados a mano y congelados.** Todos en
  córdobas, todos con cifras nicaragüenses reales:
  - Tres líneas con IVA del 15% incluido y descuento global de `C$10.00`, donde
    el prorrateo deja residuo de 1 centavo.
  - Ticket mixto gravado y exento: `C$828.00` gravados dan base `C$720.00` e
    IVA `C$108.00` exactos, más `C$25.00` exentos. Total `C$853.00`.
  - Producto a granel: `0.333 kg` a `C$45.90/kg`.
  - **Cuota fija:** el mismo carrito anterior con `tax_regime = 'cuota_fija'`
    debe dar `tax_cents = 0` y el mismo total al centavo.
  - **Pago en dólares:** `US$25.00 × 36.6243` se registra como `C$915.60`
    (redondeado a 5 centavos) y el vuelto sale exacto en córdobas.
  - **Redondeo de efectivo:** un total de `C$147.03` cobrado en efectivo se
    liquida en `C$147.05` con `cash_rounding_cents = 2`; el mismo total con
    tarjeta se liquida en `C$147.03` con redondeo cero.
  - Nota de crédito parcial sobre una venta con descuento global prorrateado.
  - Cierre de turno con retiro parcial, pago a proveedor desde caja y efectivo
    en las dos monedas, cuadrando cada una por separado.

---

## 6. Arquitectura de proceso

```
renderer (React)  ──IPC tipado──▶  preload (contextBridge)  ──▶  main
   sin SQL              Zod              superficie mínima        SQLite
```

- Un solo canal genérico `invoke(channel, payload)` con un registro de
  handlers, cada uno con su esquema Zod de entrada y de salida.
- Los errores de dominio viajan como resultado tipado
  (`{ ok: false, code, message, details }`), no como excepciones serializadas.
  El código de error es lo que la UI traduce a un mensaje humano.
- `better-sqlite3` es síncrono: no hay `async` dentro de una transacción, y por
  eso una venta no puede quedar a medias por una condición de carrera.
- Toda escritura pasa por `withTransaction(fn)`, que abre `BEGIN IMMEDIATE`,
  ejecuta y confirma, o revierte ante cualquier excepción.

---

## 7. Sistema de diseño

### 7.1 Tokens de color

Neutral **Zinc** (gris con sesgo cálido apenas perceptible; el gris puro se lee
como falta de decisión). Un solo acento por pantalla. Los tokens son variables
CSS y Tailwind los consume por nombre semántico: el código de una pantalla
**nunca** escribe `bg-zinc-900`, escribe `bg-surface`.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `#0B0B0E` | fondo de la aplicación |
| `--surface` | `#FFFFFF` | `#141418` | tarjetas, tablas, paneles |
| `--surface-2` | `#F4F4F5` | `#1C1C22` | filas alternas, cabeceras fijas |
| `--surface-3` | `#E9E9EC` | `#26262E` | estados presionados |
| `--border` | `#E4E4E7` | `#2A2A33` | separadores de 1 px |
| `--border-strong` | `#D4D4D8` | `#3A3A46` | bordes de campos |
| `--text-1` | `#18181B` | `#F4F4F5` | cifras, títulos, dato principal |
| `--text-2` | `#52525B` | `#A1A1AA` | etiquetas, texto secundario |
| `--text-3` | `#A1A1AA` | `#6B6B76` | metadatos, marcas de agua |
| `--accent` | `#2B54D4` | `#6E9BFF` | acción primaria, foco, selección |
| `--accent-hover` | `#2246B5` | `#87ADFF` | estado sobre y presionado |
| `--accent-soft` | `#EDF1FE` | `#151E33` | fondo de fila seleccionada |
| `--accent-border` | `#C3D0F8` | `#2A3A5C` | borde de control enfocado |
| `--success` | `#15803D` | `#4ADE80` | confirmación, stock sano |
| `--warning` | `#B45309` | `#FBBF24` | stock bajo, por caducar |
| `--danger` | `#B91C1C` | `#F87171` | faltante de caja, anulación |
| `--info` | `#0E7490` | `#38BDF8` | avisos neutros |

Dos reglas que no se negocian:

- **El dinero no se pinta de colores.** Un total es `--text-1` con peso 600.
  El verde y el rojo se reservan para el **cambio de estado**: un faltante de
  caja, un margen negativo, una diferencia de arqueo. Si todo es verde, nada
  destaca.
- **En oscuro la elevación es color, no sombra.** Una tarjeta sobre el fondo
  sube a `--surface`, un panel sobre la tarjeta sube a `--surface-2`. Las
  sombras difusas grandes en modo oscuro se ven como suciedad.

### 7.2 Tipografía

- Familia: **Inter** con `font-feature-settings: "tnum" 1, "cv05" 1, "ss03" 1`,
  o **Geist** si se prefiere. Un solo family en toda la aplicación.
- Escala: `11 / 12 / 13 / 14 / 16 / 20 / 24 / 30`. La base de un ERP es
  **13-14 px**, no 16: la densidad es una función, no un descuido.
- Pesos permitidos: 400, 500, 600. Nada de 700 salvo en la cifra grande del
  cajón de cobro. Máximo **dos pesos por pantalla**.
- Jerarquía por **peso y color**, no por tamaño. En una tabla, todo mide 13 px;
  lo que distingue una columna importante es que es `--text-1` en 500 mientras
  las demás son `--text-2` en 400.
- `font-variant-numeric: tabular-nums` en todo elemento que contenga dígitos.
- Cifras alineadas a la derecha, texto a la izquierda, siempre.

### 7.3 Espacio, radios y elevación

- Base de 4 px. Escala: `4 / 8 / 12 / 16 / 24 / 32 / 48`.
- Radios: `6 px` controles, `10 px` tarjetas y paneles, `14 px` modales y
  cajones. Nada de `rounded-full` salvo en insignias y avatares.
- Sombras: `0 1px 2px rgb(0 0 0 / .06)` para elementos flotantes en claro. En
  oscuro, ninguna: se usa `--border` y salto de superficie.
- **Densidad configurable** en tres modos, que cambian la altura de fila y el
  padding sin tocar la tipografía:

  | Modo | Fila de tabla | Padding celda | Uso |
  |---|---|---|---|
  | Compacta | 28 px | `4px 8px` | inventario, reportes largos |
  | Cómoda (default) | 34 px | `8px 12px` | operación diaria |
  | Amplia | 42 px | `12px 16px` | pantalla táctil, POS táctil |

### 7.4 Movimiento

| Situación | Duración | Curva |
|---|---|---|
| Hover, presionado | 120 ms | `cubic-bezier(.2,0,0,1)` |
| Menú, tooltip, popover | 180 ms | `cubic-bezier(.2,0,0,1)` |
| Cajón lateral, modal | 240 ms | `cubic-bezier(.2,0,0,1)` |
| Salida de cualquier cosa | 160 ms | `cubic-bezier(.3,0,.8,.15)` |

- Solo se animan `transform` y `opacity`. Animar `width`, `height`, `top` o
  `left` está prohibido.
- `@media (prefers-reduced-motion: reduce)`: todo baja a 0 ms salvo el
  desvanecido de opacidad.
- **Regla de oro del POS:** en la ruta crítica escanear → cobrar → imprimir no
  hay animación de entrada. Agregar un producto debe sentirse instantáneo. La
  única excepción es el resaltado de 400 ms que se desvanece sobre la línea
  recién agregada, porque comunica "sí, lo registré".

### 7.5 Teclado

**Global**

| Tecla | Acción |
|---|---|
| `Ctrl + K` | Paleta de comandos: navegar, buscar productos y clientes, ejecutar acciones |
| `Ctrl + 1..9` | Ir a la sección n de la barra lateral |
| `/` | Enfocar el buscador de la vista actual |
| `Esc` | Cerrar la capa superior, en orden inverso al de apertura |
| `?` | Hoja de atajos de la pantalla actual |

**POS** (se capturan con `preventDefault`, incluidas `F1` y `F11`)

| Tecla | Acción |
|---|---|
| `F1` | Ayuda y atajos |
| `F2` | Buscar producto por nombre |
| `F3` | Asignar cliente |
| `F4` | Cambiar cantidad de la línea activa |
| `F5` | Descuento (pide autorización si la política lo exige) |
| `F6` | Nota del ticket |
| `F7` | Suspender ticket |
| `F8` | Recuperar ticket suspendido |
| `F9` | Eliminar línea activa |
| `F10` | Abrir cajón de dinero |
| `F11` | Cambiar lista de precios |
| `F12` | **Cobrar** |
| `+` / `-` | Aumentar o disminuir cantidad |
| `*` | Multiplicador: `3 * <código>` registra tres piezas |
| `Enter` | Confirmar el paso actual |
| `Esc` | Cancelar el paso actual, nunca la venta completa sin confirmar |

**Foco magnético:** el campo de escaneo recupera el foco automáticamente
cuando nada más lo reclama. Un escáner de código de barras escribe en el
elemento enfocado; si el foco se perdió, el código se pierde y el cajero
culpa al sistema. Excepción: mientras un diálogo esté abierto, el foco se
queda dentro del diálogo.

Toda la aplicación se opera sin ratón: tablas con `roving tabindex`,
anillo de foco visible de 2 px con 2 px de separación, y ningún control
alcanzable solo por clic.

### 7.6 Patrones de componente

**Tarjeta KPI viva.** Cifra en 30 px tabular, etiqueta en 12 px `--text-2`,
delta contra el periodo anterior con flecha y color semántico, y una
mini gráfica de área de las últimas 14 unidades de tiempo. Al cargar muestra
un esqueleto **de las mismas dimensiones exactas**: si la tarjeta salta de
tamaño al llegar el dato, el esqueleto está mal hecho.

**Vista híbrida tabla/grid.** El mismo conjunto de datos con un conmutador.
Tabla densa para trabajar (inventario, reportes); retícula con miniatura para
reconocer (ropa, categorías del POS táctil). La preferencia se guarda por
vista y por usuario. En la tabla: máximo 7 columnas visibles por defecto, el
resto detrás de un selector de columnas.

**Cajón de cobro lateral.** No es un modal centrado. Entra desde la derecha,
420-480 px, y el carrito sigue visible a la izquierda porque el cajero necesita
verlo mientras cobra. Dentro: total en 42 px, botones de billete rápido según
`cash.denominations`, campo de monto recibido con foco automático, y el cambio
calculado en vivo en tamaño grande. `Enter` cierra la venta.

**Paleta de comandos.** Resultados agrupados por tipo (Acciones, Productos,
Clientes, Navegación), atajo mostrado a la derecha de cada fila, navegación con
flechas, `Enter` ejecuta. Busca con coincidencia difusa y sin acentos.

**Estados vacíos.** Nunca "No hay datos". Tres partes: una ilustración
geométrica simple construida con `--border` y `--surface-2` (no una imagen
descargada, no un emoji), una frase que explique por qué está vacío, y el botón
que lo resuelve. Ejemplo: "Todavía no registras compras. Cuando recibas
mercancía de un proveedor, el costo promedio empezará a calcularse solo."
→ `Registrar compra`.

**Esqueletos.** Reproducen la forma real del contenido: si vienen seis filas de
tabla, se muestran seis rectángulos de la altura exacta de la fila. Nada de
ruedas girando en el centro de la pantalla.

**Avisos flotantes.** Esquina inferior derecha, 3 segundos, con acción
`Deshacer` cuando la operación sea reversible. Un error no desaparece solo.

### 7.7 Densidad sin saturación

- **Tres zonas.** Navegación (fría, estrecha, sin acento), trabajo (densa,
  ocupa el resto), inspección (panel derecho contextual, se abre solo cuando
  hay algo que inspeccionar). Nunca tres columnas de trabajo compitiendo.
- **Una acción primaria por vista.** Todo lo demás es secundario o terciario.
  Si hay dos botones de acento en pantalla, uno está mal.
- **El espacio en blanco es jerarquía, no desperdicio.** La saturación se
  resuelve con ritmo de espacio, no achicando la letra.
- **Separadores de 1 px, no filas cebra.** Con `hover` de fila y fila
  seleccionada en `--accent-soft`.
- **Progresión de detalle.** La tabla muestra lo que se compara; el panel
  lateral, lo que se examina; el modal, solo lo que exige una decisión.

### 7.8 Lista de lo prohibido

Estas cosas convierten una aplicación cuidada en una plantilla genérica:

- Degradados morados o azul-violeta de fondo.
- Sombras grandes y difusas, especialmente en modo oscuro.
- Emojis usados como iconos de interfaz (los iconos son Lucide, 16 px o 20 px,
  trazo 1.5).
- Tarjetas con un cuadro de color y un icono centrado arriba.
- Ruedas de carga centradas en la pantalla.
- Modales dentro de modales.
- Más de dos pesos tipográficos o más de un acento por pantalla.
- Animaciones en la ruta crítica del cobro.
- Texto sobre una imagen sin capa de contraste.
- Contraste por debajo de 4.5:1 en texto y 3:1 en bordes de control.
