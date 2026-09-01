# Plan Maestro de Implementación — Cuadra

> ERP y Punto de Venta de escritorio para MiPyMEs de Nicaragua.
> Este documento es el guion de construcción. `AGENT-GUIDE.md` es el contrato
> de cómo se escribe el código. Los dos se leen antes de tocar un archivo.

---

## 0. Reglas de trabajo para el agente

Estas reglas están primero porque son las que más fácil se rompen.

### 0.1 Una fase a la vez. Sin excepciones.

**No construyas el sistema completo de una sola pasada.** El plan tiene doce
fases. Cada una termina en una puerta de verificación que hay que cruzar antes
de abrir la siguiente.

Al terminar una fase:

1. Ejecuta el comando de verificación de esa fase y **pega la salida real** en
   tu reporte. No la resumas, no la describas: pégala.
2. Marca la fase en la bitácora de la sección 3 de este archivo.
3. **Detente y reporta.** No empieces la fase siguiente en el mismo turno.

Si terminas una fase antes de lo previsto, no aproveches para adelantar la
siguiente. El valor de la puerta está en que alguien mire los números antes de
seguir. Adelantarte convierte un error de la fase 2 en un error que se descubre
en la fase 7, cuando ya cuesta diez veces más.

### 0.2 Las pruebas se escriben antes que el código

En cada fase, el orden es:

```
1. Escribe la prueba que describe el comportamiento correcto.
2. Ejecútala y confirma que FALLA por la razón esperada.
3. Escribe el código mínimo que la hace pasar.
4. Ejecuta la suite completa, no solo la prueba nueva.
```

Una prueba que nunca se vio fallar no prueba nada: puede estar verificando la
nada. Si escribes una prueba y pasa a la primera, sospecha de la prueba.

### 0.3 Nunca reportes verde sin haberlo visto

Prohibido escribir «las pruebas pasan», «ya funciona» o «está listo» sin haber
ejecutado el comando y leído la salida en ese mismo turno. Si una prueba falla,
dilo con la salida del error. Un reporte optimista cuesta más que un fallo
honesto.

### 0.4 Qué hacer cuando algo no cuadra

- **Un cálculo no da:** no ajustes el resultado esperado de la prueba para que
  pase. Encuentra por qué difiere. Casi siempre es un redondeo aplicado dos
  veces o un descuento restado dos veces.
- **Una restricción de la base de datos te rechaza un documento:** la
  restricción tiene razón hasta que se demuestre lo contrario. Revisa tu
  cálculo antes de tocar el esquema.
- **Necesitas una decisión de negocio que no está aquí:** no la inventes.
  Detente, formula la pregunta concreta y espera. Una suposición sobre dinero
  ajeno es la peor clase de deuda técnica.
- **El alcance de una fase te parece corto:** perfecto. Ciérrala.

### 0.4b Dónde viven las pruebas

Las pruebas viven en `test/`, reflejando la estructura de `src/`. Los filtros
de Vitest son subcadenas de la **ruta del archivo de prueba**, así que un
filtro que empiece por `src/` no encuentra nada y `vitest` sale con código 1
sin haber ejecutado ni una prueba. Un filtro que no encuentra archivos **no es
una fase cerrada**: si el comando responde `No test files found`, la puerta no
se cruzó.

### 0.5 Lo que nunca se hace

- Tocar `db/migrations/001_init.sql` una vez aplicado. Toda corrección es una
  migración nueva y numerada.
- Escribir SQL en el proceso `renderer`.
- Usar `number` decimal para dinero en cualquier capa.
- Instalar una dependencia que no esté en la lista de la fase que la necesita.
- Adelantar trabajo de una fase posterior «porque ya que estoy».

---

## 1. Identidad del producto

**Nombre: Cuadra.**

Dos razones, y las dos importan. En Nicaragua las direcciones se dan en cuadras,
así que la palabra vive en la boca de la gente que va a usar esto. Y *cuadrar
la caja* es exactamente la promesa del producto: al final del día, los números
cierran. El nombre dice lo que hace sin explicarlo.

- Ejecutable: `Cuadra.exe`
- Identificador de aplicación: `ni.cuadra.pos`
- Carpeta de datos: `%APPDATA%/Cuadra`
- En la barra de título y en el ticket: `Cuadra`

**Color de acento: Azul Cuadra.**

| Token | Claro | Oscuro |
|---|---|---|
| `--accent` | `#2B54D4` | `#6E9BFF` |
| `--accent-hover` | `#2246B5` | `#87ADFF` |
| `--accent-soft` | `#EDF1FE` | `#151E33` |
| `--accent-border` | `#C3D0F8` | `#2A3A5C` |

Por qué este y no otro: los colores semánticos ya ocupan el verde (bien), el
ámbar (atención), el rojo (peligro) y el celeste (informativo). El acento tiene
que ser el único tono que no signifique nada por sí mismo, o el usuario empieza
a leer intención donde solo hay un botón. El cobalto es el hueco que queda, y
además es el que menos se cansa en una pantalla que alguien mira ocho horas.
Contraste medido: **6.3:1** sobre blanco y **7.0:1** sobre el fondo oscuro, los
dos por encima del mínimo.

La personalidad de esta aplicación no va a venir del color. Va a venir de la
densidad, de la tipografía tabular y de que responda en menos de cien
milisegundos. El acento solo tiene que no estorbar.

---

## 2. Decisiones cerradas

Lo que ya no se discute. Si algo de aquí te parece incorrecto, pregunta antes
de desviarte.

| Tema | Decisión |
|---|---|
| País | Nicaragua. Córdobas, símbolo `C$`, dos decimales. |
| Moneda de precio | Solo córdobas. El dólar es medio de pago, nunca de precio. |
| Tipo de cambio | `36.6243` oficial, vigente para 2026 con deslizamiento 0%. El negocio puede definir el suyo. |
| Régimen tributario | **Se construyen los dos caminos**, cuota fija y general. El asistente de instalación pregunta. |
| IVA | 15%, con estatus por producto: gravado, exento, no sujeto. |
| Lista de exentos | **No se codifica en el sistema.** Es dato editable por producto, y una persona que conoce la norma lo valida antes de la primera venta. |
| Despliegue | Una sola PC, todo local. Sin servidor, sin nube. |
| Panel del dueño | Dentro de la misma aplicación, separado por rol. Fase 10. |
| Stock negativo | Prohibido. |
| Cierre de caja | Ciego, y por moneda. |
| Anulaciones | Nota de crédito. La anulación directa solo dentro de la ventana de minutos. |
| Módulos del MVP | Núcleo + compras + crédito + clientes. Sin órdenes de servicio, sin kits. |
| Rubros piloto | Minimarket y ropa. |

---

## 3. Bitácora

El agente actualiza esta tabla al cerrar cada fase. Es el estado real del
proyecto y la única fuente de verdad sobre qué está hecho.

| Fase | Nombre | Estado | Fecha de cierre | Notas |
|---|---|---|---|---|
| F0 | Andamiaje | cerrada | 2026-08-31 | Andamiaje completo: electron-vite, React, TS estricto, better-sqlite3 compilado, migrador idempotente, IPC Zod y scripts de verificación permanente. |
| F1 | Motor monetario, impuestos y moneda | cerrada | 2026-08-31 | 100% cobertura en money/tax/fx/sales/pricing, 4 propiedades fast-check (10k casos) y 8 casos de oro exactos al centavo. |
| F2 | Costeo y Kardex | cerrada | 2026-08-31 | CPP en enteros, Kardex inmutable, transacciones BEGIN IMMEDIATE, conciliación v_stock_drift y propiedad con 10,000 casos. |
| F3 | Venta atómica, series y turnos | cerrada con deuda | 2026-08-31 | Venta en 1 tx atómica, correlativo protegido, NC, turnos con arqueo bimoneda y 300 ventas con diferencia 0. **Deuda (auditoría 2026-08-31):** (1) `voidSale` no lee `sales.void_window_minutes`: anula una venta de 60 días. (2) `voidSale` no revierte Kardex ni caja, rompe el arqueo. (3) un pago con `method:'credit'` entra en `paidCents` y deja `creditCents = 0`: la cuenta por cobrar no se registra. (4) una venta a crédito sin `customerId` se acepta y crea deuda sin dueño. (5) la prueba de correlativo es secuencial, el plan pedía simultánea. |
| F4 | Sistema de diseño y armazón | pendiente | | |
| F5 | Punto de venta | pendiente | | |
| F6 | Inventario y catálogo | pendiente | | |
| F7 | Compras y proveedores | pendiente | | |
| F8 | Clientes, crédito y fidelización | pendiente | | |
| F9 | Reportes | pendiente | | |
| F10 | Panel del dueño | pendiente | | |
| F11 | Perfiles, instalación y endurecimiento | pendiente | | |

Estados válidos: `pendiente`, `en curso`, `cerrada`, `cerrada con deuda`.
Si cierras con deuda, la nota dice **qué** quedó pendiente y **por qué**.

---

# Las doce fases

---

## Fase 0 — Andamiaje

**Objetivo.** Que un clic en la interfaz escriba una fila en SQLite y la
devuelva, con el tipo correcto en los dos extremos.

**No empieces si:** no has leído `AGENT-GUIDE.md` completo.

### Qué construir

- Proyecto con `electron-vite`, React, TypeScript en modo estricto
  (`strict: true`, `noUncheckedIndexedAccess: true`), Tailwind, Vitest, ESLint.
- `better-sqlite3` funcionando dentro de Electron. Esto incluye resolver la
  recompilación del binario nativo (`electron-rebuild` o `@electron/rebuild`).
  **Es el punto donde más proyectos se atascan**, así que se resuelve primero,
  no al final.
- Migrador: lee `db/migrations/*.sql` en orden, aplica lo que falte, registra
  en `schema_migrations`. Idempotente: correrlo dos veces no rompe nada.
- Un canal IPC de prueba, con esquema Zod de entrada y de salida, validando en
  el proceso principal y en el renderer.
- Ventana con `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Prueba automática que recorre los imports de `src/core/` y **falla** si
  encuentra `electron`, `better-sqlite3`, `fs`, `path` o `node:*`.

### Pruebas que se escriben antes

1. El migrador aplica una migración y la registra.
2. El migrador corrido dos veces no vuelve a aplicar nada.
3. El canal IPC rechaza una carga que no cumple el esquema Zod.
4. `src/core/` no importa infraestructura.

### Criterio de cierre

- `npm run test` pasa.
- La aplicación abre, un botón escribe y lee de SQLite, y el tipo de la
  respuesta es correcto sin un solo `any`.
- `npx tsc --noEmit` sin errores.

### Comando de verificación

```bash
npm run test && npx tsc --noEmit && npm run lint
```

### Lo que NO se hace en esta fase

Ni una pantalla de negocio. Ni un producto, ni una venta, ni un diseño. Esta
fase es fontanería y se nota que está bien hecha precisamente porque no se ve.

---

## Fase 1 — Motor monetario, impuestos y moneda

**Objetivo.** Que la aritmética del dinero sea correcta y demostrable, sin que
exista todavía una sola pantalla.

**No empieces si:** la fase 0 no está cerrada.

### Qué construir

Todo dentro de `src/core/`, sin dependencias de infraestructura.

`core/money/`
- `mulDiv(value, mul, div): bigint` — multiplica y divide en enteros con
  redondeo comercial, correcto también con negativos. **Es la única función del
  sistema autorizada a redondear.**
- `allocate(total, weights): bigint[]` — reparte de modo que la suma de las
  partes sea exactamente el total. Método de mayores residuos.
- `roundToNearest(value, step): bigint` — para el redondeo a 5 centavos.
- Formateadores de presentación: `C$1,234.50`, con numerales tabulares.

`core/tax/`
- Desglose con impuesto incluido y con impuesto agregado.
- Los tres estatus: gravado, exento, no sujeto.
- El camino de **cuota fija**, donde el impuesto es cero por definición.

`core/fx/`
- Conversión de un pago en dólares a córdobas, con redondeo a 5 centavos
  **antes** de calcular el vuelto.

`core/pricing/`
- Listas de precios, precio escalonado por volumen, descuento por línea y
  descuento global prorrateado.

`core/sales/`
- Armado del documento: entra un carrito, sale un documento cuadrado con sus
  bases, su impuesto, su redondeo y su total.

### Pruebas que se escriben antes

**Unitarias**
- `mulDiv` contra una tabla de casos: negativos, ceros, empates en `.5`,
  valores que desbordan `Number.MAX_SAFE_INTEGER`.
- `allocate` con residuo de 1 y de 2 centavos, con un peso en cero, con un solo
  peso, con todos los pesos iguales.

**De propiedad (`fast-check`), 10 000 casos por invariante**
- `Σ allocate(t, w) === t` para cualquier total y cualquier vector de pesos.
- `Σ líneas.total === documento.total` en carritos generados al azar.
- El total nunca cambia si se reordenan las líneas del carrito.
- Con `tax_regime = 'cuota_fija'`, `tax_cents` es siempre cero.

**Casos de oro** (calculados a mano, congelados, nunca se ajustan para que pasen)
1. Tres líneas con IVA 15% incluido y descuento global de `C$10.00` que deja
   residuo de 1 centavo.
2. Ticket mixto: `C$828.00` gravados dan base `C$720.00` e IVA `C$108.00`
   exactos, más `C$25.00` exentos. Total `C$853.00`.
3. El mismo carrito bajo cuota fija: impuesto cero, mismo total al centavo.
4. Granel: `0.333 kg` a `C$45.90/kg`.
5. Pago en dólares: `US$25.00 × 36.6243 = C$915.6075`, se registra `C$915.60`,
   vuelto exacto en córdobas.
6. Redondeo de efectivo: total `C$147.03` cobrado en efectivo se liquida en
   `C$147.05` con redondeo `+2`; el mismo total con tarjeta se liquida en
   `C$147.03` con redondeo cero.
7. Nota de crédito parcial sobre una venta con descuento global prorrateado.
8. Venta mixta: parte en efectivo córdobas, parte en dólares, resto a crédito.

### Criterio de cierre

- Cobertura del 100% de líneas y ramas en `core/money`, `core/tax` y `core/fx`.
- Las cuatro propiedades verdes con 10 000 casos cada una.
- Los ocho casos de oro coinciden al centavo.

### Comando de verificación

```bash
npm run test -- --coverage
```

Pega la tabla de cobertura completa en tu reporte.

### Lo que NO se hace en esta fase

Nada de base de datos. Nada de Electron. Nada de interfaz. Si sientes la
tentación de «probarlo en pantalla para ver si sirve», no la sigas: para eso
están las pruebas, y son más rápidas y más severas que tus ojos.

---

## Fase 2 — Costeo y Kardex

**Objetivo.** Que el inventario y su costo sean auditables movimiento por
movimiento.

**No empieces si:** la fase 1 no cerró con cobertura completa.

### Qué construir

`core/costing/`
- `applyInbound(state, qty, unitCost)` — recalcula el promedio ponderado.
- `applyOutbound(state, qty)` — congela el costo y devuelve el costo de lo
  vendido. **Nunca modifica el promedio.**
- Prorrateo de flete con `allocate` para producir el costo con flete incluido.

`main/db/` y `main/repositories/`
- Conexión con `journal_mode = WAL`, `foreign_keys = ON`,
  `synchronous = FULL`, `busy_timeout = 5000`.
- `withTransaction(fn)` con `BEGIN IMMEDIATE`.
- Repositorios de producto, variante y Kardex.
- Comando `inventory:reconcile` que compara la caché de existencias contra la
  suma del Kardex usando la vista `v_stock_drift` y reporta diferencias.

### Pruebas que se escriben antes

- Entrada, entrada, salida: el promedio después de la segunda entrada es el
  valor calculado a mano; la salida no lo mueve.
- Una salida congela su costo, y una entrada posterior más cara **no** cambia
  el costo de esa salida ya registrada.
- Intentar `UPDATE` o `DELETE` sobre `inventory_moves` lanza error.
- Vender sin existencia con `allow_negative = false` se rechaza **antes** de
  abrir la transacción.
- **Propiedad, 10 000 casos:** tras una secuencia aleatoria de entradas y
  salidas, `Σ Kardex === stock_milli` y
  `valor_inventario === Σ (stock × costo_promedio)`, con cero centavos de
  diferencia.

### Criterio de cierre

- La propiedad de conciliación pasa con 10 000 casos.
- `inventory:reconcile` reporta cero diferencias sobre una base generada al azar.

### Comando de verificación

```bash
npm run test costing db.test migrator && npm run cli -- inventory:reconcile
```

### Lo que NO se hace en esta fase

Interfaz de inventario. Compras. Ajustes desde pantalla. Aquí solo vive el
motor y su acceso a datos.

---

## Fase 3 — Venta atómica, series y turnos de caja

**Objetivo.** Que una venta ocurra entera o no ocurra, y que la caja cuadre
sola.

**No empieces si:** la fase 2 no está cerrada.

### Qué construir

`main/services/sales.service.ts`
- Una venta completa dentro de **una sola** transacción: documento, líneas,
  pagos, movimientos de Kardex, costo de lo vendido, movimiento de caja,
  cargo a crédito, puntos.
- Consumo del correlativo **dentro de la misma transacción**: si la venta se
  revierte, el número no se gasta y no queda hueco en la serie.
- Nota de crédito con documento padre y su propio correlativo.
- Anulación directa solo dentro de `sales.void_window_minutes`.
- Registro de factura de contingencia, con su serie y `is_contingency = 1`.

`main/services/cash.service.ts`
- Apertura de turno con fondo, en córdobas y en dólares.
- Movimientos de efectivo por moneda.
- Cierre con conteo por denominaciones **en cada moneda por separado**, y
  diferencia calculada por moneda.
- Con cierre ciego, el importe esperado no cruza el IPC hasta que el cajero
  confirma su conteo.

### Pruebas que se escriben antes

- Una falla inyectada en cada paso de la venta (Kardex, caja, crédito, pagos)
  no deja rastro en ninguna tabla **y no consume el correlativo**.
- Una venta con IVA incluido, línea exenta, redondeo y pago en dólares se
  guarda y sus tres restricciones `CHECK` se cumplen.
- Un total descuadrado por un centavo es rechazado por la base de datos.
- Cobrar IVA con `tax_regime = 'cuota_fija'` es rechazado.
- Dos ventas simultáneas no pueden tomar el mismo correlativo.
- Turno simulado de 300 ventas mixtas: cierra con diferencia cero en las dos
  monedas.
- El importe esperado no aparece en ninguna respuesta del IPC antes de que el
  cajero confirme el conteo.

### Criterio de cierre

- Las siete pruebas anteriores en verde.
- Un turno de 300 ventas cierra con `difference_cents = 0` y
  `difference_usd = 0`.

### Comando de verificación

```bash
npm run test sales.service cash.service
```

### Lo que NO se hace en esta fase

Diseño. La interfaz de estas operaciones puede ser un formulario feo o incluso
un guion de línea de comandos. La belleza empieza en la fase 4 y no antes.

---

## Fase 4 — Sistema de diseño y armazón

**Objetivo.** Que exista un vocabulario visual completo antes de dibujar la
primera pantalla de negocio.

**No empieces si:** la fase 3 no está cerrada. El motor tiene que estar
probado antes de gastar un minuto en píxeles.

### Qué construir

- `renderer/design/tokens.css` con la paleta completa de la sección 1 y de
  `AGENT-GUIDE.md`, en los tres estados de tema: claro, oscuro por sistema y
  oscuro por elección explícita.
- Tres modos de densidad: compacta 28 px, cómoda 34 px, amplia 42 px.
- Primitivos en `components/ui/`: `Button`, `Input`, `Select`, `Table`
  virtualizada, `Drawer`, `Dialog`, `Toast`, `Skeleton`, `EmptyState`, `Badge`,
  `Kbd`.
- Patrones en `components/patterns/`: `KpiCard`, `DataView` (conmutador tabla y
  retícula), `CommandPalette`, `AuthPrompt` (pedir clave de supervisor).
- Registro global de atajos y el gancho `useMagneticFocus`.
- Armazón de navegación con las tres zonas: navegación, trabajo, inspección.
- **Página de muestra** que recorre todos los primitivos en los dos temas y en
  las tres densidades.

### Pruebas que se escriben antes

- Ningún archivo de `renderer/` fuera de `design/` contiene un color literal
  (`#`, `rgb(`, `hsl(`). Prueba automática que recorre el árbol.
- La paleta cumple 4.5:1 en texto y 3:1 en bordes, en los dos temas. Prueba
  automática de contraste sobre los tokens.
- Cada primitivo tiene estado de foco visible.

### Criterio de cierre

- La página de muestra se ve correcta en los dos temas y en las tres
  densidades, sin un color escrito a mano.
- La prueba de contraste pasa.

### Comando de verificación

```bash
npm run test test/renderer/design && npm run lint
```

### Lo que NO se hace en esta fase

Pantallas de negocio. Ni el POS, ni inventario. Solo el vocabulario.

---

## Fase 5 — Punto de venta

**Objetivo.** La pantalla estrella. Que un cajero venda diez artículos sin
tocar el ratón, en menos de veinte segundos.

**No empieces si:** la fase 4 no está cerrada.

### Qué construir

- Búsqueda instantánea con FTS5, con tolerancia a acentos.
- Foco magnético en el campo de escaneo, con la excepción de los diálogos.
- Carrito con teclado completo: `+`, `-`, `3 * código`, `Enter`, `Esc`.
- Atajos `F1` a `F12` según `AGENT-GUIDE.md`, capturados con `preventDefault`.
- Cajón de cobro lateral de 420 a 480 px, con el carrito visible a la
  izquierda: total en 42 px, botones de billete rápido de córdoba, tecla de
  pago en dólares con la tasa del día, cambio en vivo y en grande.
- Tickets suspendidos y recuperación.
- Impresión ESC/POS a 80 mm con **los ocho datos que la DGI exige**, y apertura
  del cajón de dinero.
- Captura posterior de facturas del talonario de contingencia.
- Resaltado de 400 ms sobre la línea recién agregada. **Ninguna otra
  animación** en la ruta de cobro.

### Pruebas que se escriben antes

- Una venta completa por teclado, simulada de principio a fin.
- El foco vuelve al campo de escaneo tras cerrar un diálogo.
- Escanear un código inexistente muestra un error sin perder el carrito.
- Vender sin existencia se bloquea con mensaje claro y el carrito sobrevive.
- El ticket impreso contiene los ocho campos obligatorios.

### Criterio de cierre

- Venta de diez artículos con pago mixto en dos monedas e impresión, sin ratón,
  en menos de veinte segundos.
- De escanear a ver la línea en pantalla: menos de 100 ms, medido.
- La factura impresa lleva nombre, nombre comercial, dirección, teléfono, RUC,
  la indicación de contado o crédito, el desglose del IVA y el número de
  autorización de la DGI abajo a la derecha.

### Comando de verificación

```bash
npm run test test/renderer/pos && npm run test:e2e -- pos
```

### Lo que NO se hace en esta fase

Inventario, compras, reportes. El POS es suficientemente grande solo.

---

## Fase 6 — Inventario y catálogo

**Objetivo.** Cargar y mantener el catálogo sin que duela, para los dos rubros
piloto a la vez.

### Qué construir

- Vista híbrida tabla y retícula, con preferencia recordada por usuario.
- Alta de producto con generador de variantes por ejes (talla, color).
- Múltiples códigos de barras por variante.
- Formulario dinámico que se renderiza desde `attribute_definitions`.
- **Pantalla de revisión masiva del estatus de IVA**, con filtro de «productos
  sin estatus definido». Es la pantalla que permite que un contador valide el
  catálogo entero antes de la primera venta.
- Ajustes con motivo obligatorio, conteo físico, alertas de mínimo y de
  caducidad próxima.
- Kardex consultable por artículo.
- Importación desde CSV con vista previa y reporte de errores por fila.

### Pruebas que se escriben antes

- Generar variantes de 4 tallas por 3 colores produce 12 SKU con códigos
  únicos.
- Un producto simple recibe exactamente una variante, automáticamente.
- Un ajuste queda en auditoría con su motivo y su usuario.
- La importación de un CSV con 5 000 filas y 3 errores reporta los 3 y no
  aplica nada.

### Criterio de cierre

- 5 000 variantes cargadas y la tabla se desplaza sin caída de cuadros.
- El reporte de «sin estatus de IVA definido» funciona y llega a cero tras la
  revisión.

### Comando de verificación

```bash
npm run test test/renderer/inventory
```

---

## Fase 7 — Compras y proveedores

**Objetivo.** Que el costo promedio se alimente de documentos reales y no de
ajustes a mano.

### Qué construir

- Orden de compra y recepción que genera entradas de Kardex y recalcula el
  promedio ponderado.
- Flete prorrateado al costo de cada línea antes de tocar el promedio.
- Captura de lote y fecha de caducidad en la recepción.
- Pagos a proveedor, con salida de caja cuando son en efectivo.

### Pruebas que se escriben antes

- Recibir una compra con flete mueve el costo promedio al valor calculado a
  mano, al micro.
- Cancelar una recepción revierte con movimientos inversos, sin editar el
  Kardex.
- La suma del flete prorrateado entre las líneas es exactamente el flete.

### Criterio de cierre

El margen del reporte refleja el costo con flete, y coincide con el cálculo
manual del caso de oro correspondiente.

### Comando de verificación

```bash
npm run test test/renderer/purchases test/main/purchases
```

---

## Fase 8 — Clientes, crédito y fidelización

**Objetivo.** Que el fiado deje de llevarse en un cuaderno.

### Qué construir

- Ficha de cliente con historial de compras.
- Límite de crédito validado **en el momento del cobro**, no después.
- Abonos parciales, con salida o entrada de caja según corresponda.
- Estado de cuenta con antigüedad de saldos.
- Acumulación y canje de puntos.

### Pruebas que se escriben antes

- **Propiedad, 100 escenarios:** el saldo mostrado es igual a la suma del libro
  del cliente, tras secuencias aleatorias de cargos y abonos.
- Vender a crédito por encima del límite se bloquea con mensaje claro.
- El libro del cliente rechaza `UPDATE` y `DELETE`.

### Criterio de cierre

Los 100 escenarios en verde y el saldo de la vista `v_customer_balance`
coincide con el saldo mostrado en pantalla.

### Comando de verificación

```bash
npm run test test/renderer/customers test/main/credit
```

---

## Fase 9 — Reportes

**Objetivo.** Producir los números correctos. Presentarlos bien es la fase
siguiente.

### Qué construir

**Fiscales**
- Resumen diario de IVA trasladado, con base gravada y base exenta separadas.
- Ingresos brutos mensuales para la declaración del impuesto municipal.
- Libro de ventas por periodo, con el correlativo completo y sin huecos.

**Operativos**
- Ventas por periodo, por producto, por categoría, por usuario.
- Valor de inventario y rotación.
- Cuentas por cobrar con antigüedad.
- Diferencias de arqueo por turno y por cajero.
- Margen por producto y por categoría.

Exportación a CSV y a PDF.

### Pruebas que se escriben antes

- El total de ventas del reporte cuadra al centavo con la suma de los turnos y
  con las salidas del Kardex.
- El IVA del resumen diario cuadra con la suma de las líneas de todas las
  facturas del periodo.
- El libro de ventas detecta y reporta cualquier hueco en el correlativo.

### Criterio de cierre

Las tres conciliaciones en cero sobre una base de 10 000 ventas generadas.

### Comando de verificación

```bash
npm run test test/main/reports
```

---

## Fase 10 — Panel del dueño

**Objetivo.** Que el dueño abra la aplicación y en diez segundos sepa cómo va
su negocio.

**Decisión de arquitectura, ya tomada:** vive **dentro de la misma
aplicación**, separado por rol. No es un programa aparte, no es un servidor, no
es una página web. El dueño entra con su propio usuario y ve una sección que el
cajero no ve. Cero infraestructura nueva, funciona sin internet y no toca la
decisión de «todo local».

### Cómo se separa del cajero

El acceso se controla por permisos en `roles.permissions_json`:

| Permiso | Cajero | Supervisor | Dueño |
|---|---|---|---|
| `pos.sell` | sí | sí | sí |
| `sales.discount` | no | sí | sí |
| `sales.void` | no | sí | sí |
| `inventory.adjust` | no | sí | sí |
| `reports.operational` | no | sí | sí |
| `dashboard.view` | **no** | no | **sí** |
| `reports.cost_and_margin` | **no** | no | **sí** |

**El cajero nunca ve el costo ni el margen.** No es un detalle de interfaz: el
dato no debe cruzar el IPC hacia una sesión sin ese permiso. Se filtra en el
proceso principal, no ocultando columnas en pantalla. Un empleado que conoce el
margen de cada artículo es una conversación que el dueño no pidió tener.

### Qué muestra

Una sola pantalla, sin desplazamiento en 1366×768, con tres bandas:

**Banda 1, el pulso de hoy.** Cuatro tarjetas KPI vivas, cada una con su cifra
grande en tabular, su variación contra el mismo día de la semana pasada y una
mini gráfica de los últimos 14 días:
- Venta del día
- Margen del día, en córdobas y en porcentaje
- Tickets y ticket promedio
- Efectivo en caja ahora mismo

**Banda 2, lo que necesita una decisión.** No son números, son avisos con la
acción que los resuelve:
- Artículos bajo el mínimo, con el botón de crear orden de compra
- Productos por caducar en 30 días, ordenados por urgencia
- Clientes con saldo vencido
- Diferencias de arqueo de la semana, por cajero
- Productos sin estatus de IVA definido, si el negocio está en régimen general

**Banda 3, la tendencia.** Venta de los últimos 30 días con línea de tendencia,
los 10 productos que más venden y los 10 que más margen dejan, que casi nunca
son los mismos, y esa es la información valiosa.

Filtro global de periodo: hoy, esta semana, este mes, personalizado.

### Reglas de diseño específicas

- El esqueleto de cada tarjeta tiene **exactamente** las dimensiones de la
  tarjeta cargada. Si el tablero salta al llegar los datos, está mal hecho.
- Las cifras se cargan en paralelo, no en cascada. Una consulta lenta no
  bloquea el resto del tablero.
- Ninguna consulta del tablero puede tardar más de 300 ms sobre una base de
  100 000 ventas. Si tarda, se precalcula, no se acepta.
- El color semántico solo aparece donde hay un cambio de estado. Un tablero
  todo verde no comunica nada.

### Pruebas que se escriben antes

- Un usuario sin `dashboard.view` recibe un error del IPC, no una pantalla
  vacía.
- Un usuario sin `reports.cost_and_margin` recibe respuestas **sin** los campos
  de costo. Verificar la forma del objeto, no la pantalla.
- Cada consulta del tablero responde en menos de 300 ms con 100 000 ventas
  sembradas.
- Los totales del tablero coinciden con los de los reportes de la fase 9.

### Criterio de cierre

- Las cuatro pruebas en verde.
- El tablero completo carga en menos de un segundo con 100 000 ventas.
- Un cajero autenticado no puede obtener un solo número de costo, ni por la
  interfaz ni llamando al IPC directamente.

### Comando de verificación

```bash
npm run test test/renderer/dashboard test/main/permissions
```

### Si más adelante se quiere ver desde el celular

Queda anotado, fuera de alcance por ahora, y así es como se haría sin rehacer
nada: el proceso principal levanta un servidor HTTP solo en la red local,
sirviendo **la misma** capa de servicios que ya usa el IPC, con autenticación
por token y sesión corta. El tablero se construye desde ya con diseño adaptable
para que esa puerta quede abierta. Ver el negocio desde fuera del local es otra
cosa: exige sincronización a la nube y un modelo de seguridad completo, y es un
producto aparte.

---

## Fase 11 — Perfiles, instalación y endurecimiento

**Objetivo.** Que alguien instale Cuadra en una máquina limpia y venda el mismo
día.

### Qué construir

- Semillas de perfil para minimarket y para ropa: campos, terminología,
  retícula del POS, columnas por omisión.
- **Asistente de primer arranque**, que pregunta lo mínimo y lo decisivo:
  rubro, régimen tributario, datos del negocio (nombre, nombre comercial, RUC,
  dirección, teléfono), número de autorización de la DGI si lo hay, series de
  documentos y fondo de caja inicial.
- Respaldo automático al cierre de cada turno, con verificación de integridad
  (`PRAGMA integrity_check`) y restauración probada. **Es requisito de la
  norma de facturación, no solo buena práctica.**
- Instalador firmado y actualización silenciosa.
- Auditoría revisable desde la interfaz.

### Pruebas que se escriben antes

- Un respaldo restaurado reproduce la base bit a bit.
- Un negocio en cuota fija no ve la palabra IVA en ninguna pantalla ni en el
  ticket.
- El asistente completo, de máquina limpia a primera venta, en una prueba de
  punta a punta.

### Criterio de cierre

Instalación limpia, elección de rubro y régimen, carga de catálogo y primera
venta, sin tocar la configuración manualmente.

### Comando de verificación

```bash
npm run test:e2e -- onboarding backup && npm run build:installer
```

---

# Apéndice A — Verificación permanente

Estos comandos deben pasar **al cerrar cualquier fase**, no solo la suya:

```bash
npm run test          # toda la suite
npx tsc --noEmit      # tipos
npm run lint          # estilo y reglas
npm run check:core    # core/ no importa infraestructura
npm run check:tokens  # renderer/ no tiene colores literales
```

Si uno falla, la fase no está cerrada, por mucho que su criterio propio se
cumpla.

---

# Apéndice B — Los cinco errores que este plan existe para evitar

1. **Construir la interfaz antes que los números.** Por eso las fases 1 a 3 no
   producen ni una pantalla.
2. **Redondear dos veces.** Por eso `mulDiv` es la única función autorizada a
   redondear, y el descuento global se prorratea una sola vez.
3. **Confiar en la caché de existencias.** Por eso el Kardex es la verdad y hay
   un comando que delata cuándo la caché miente.
4. **Dejar un hueco en el correlativo.** Por eso el número se consume dentro de
   la transacción de la venta.
5. **Hacer todo de una vez.** Por eso hay doce puertas, y cruzarlas sin mirar
   los números anula el propósito de tenerlas.
