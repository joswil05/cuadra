-- =============================================================================
-- ERP / POS  ·  Migracion 001  ·  Esquema inicial
-- =============================================================================
-- REGLAS INVIOLABLES DE ESTE ESQUEMA
--   1. Todo importe monetario es INTEGER en CENTAVOS. Sufijo _cents.
--      Jamas REAL, jamas FLOAT, jamas NUMERIC para dinero.
--   2. Toda cantidad es INTEGER en MILESIMAS de unidad. Sufijo _milli.
--      1.250 kg = 1250. Permite granel sin punto flotante.
--   3. Todo costo unitario es INTEGER en MICRO-unidades monetarias (6 dec).
--      Sufijo _micros. 12.345678 = 12345678. El CPP necesita esta precision
--      o se erosiona centavo a centavo en cada recalculo.
--   4. Toda tasa de impuesto es INTEGER en PUNTOS BASE. Sufijo _bp.
--      16% = 1600. Nunca 0.16.
--   5. Las tablas marcadas LIBRO son inmutables: solo INSERT. Los triggers
--      lo imponen a nivel de motor. Corregir = insertar el movimiento inverso.
--   6. Todo timestamp es TEXT ISO-8601 UTC. SQLite no tiene tipo fecha; la
--      consistencia del formato es responsabilidad nuestra.
--   7. Las tablas de documento llevan `uid` TEXT UNIQUE (ULID). La PK entera
--      es local y rapida; el uid es la identidad global que hara posible la
--      sincronizacion multi-sucursal en el futuro sin rehacer las claves.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 0. Control de esquema y configuracion
-- -----------------------------------------------------------------------------

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL
);

-- Configuracion viva del sistema. Un solo lugar, valores JSON validados con
-- Zod al leerse. Aqui viven TODAS las banderas de politica del negocio, de
-- modo que cambiar una regla no requiera migrar el esquema.
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

INSERT INTO settings (key, value_json, updated_at) VALUES
  -- === Moneda (Nicaragua) ===================================================
  -- Desde el 1 de enero de 2025 el BCN exige que TODO precio de bienes y
  -- servicios se exprese exclusivamente en cordobas con el simbolo C$.
  -- El dolar se sigue aceptando como MEDIO DE PAGO, nunca como moneda de
  -- precio, y se convierte a cordobas al recibirlo.
  ('currency.code',                    '"NIO"',              datetime('now')),
  ('currency.symbol',                  '"C$"',               datetime('now')),
  ('currency.decimals',                '2',                  datetime('now')),
  ('currency.accepts_usd',             'true',               datetime('now')),
  -- Tipo de cambio del NEGOCIO en micro-unidades (6 decimales). El oficial
  -- del BCN esta fijo en 36.6243 C$/US$ con deslizamiento 0% desde 2024, pero
  -- cada comercio define el suyo. Se congela en cada pago.
  ('currency.usd_rate_micros',         '36624300',           datetime('now')),
  ('currency.official_rate_micros',    '36624300',           datetime('now')),

  -- === Regimen tributario ===================================================
  -- 'cuota_fija': persona natural con ingresos <= C$100,000/mes o inventario
  --   <= C$500,000. El IVA va conglobado en la cuota mensual: el negocio NO
  --   traslada IVA y su comprobante NO desglosa impuestos.
  -- 'general': traslada IVA 15% y emite factura con desglose y numero de
  --   autorizacion de la DGI.
  -- Esta bandera enciende o apaga el motor de impuestos completo.
  ('tax.regime',                       '"cuota_fija"',       datetime('now')),
  ('tax.iva_rate_bp',                  '1500',               datetime('now')),
  -- El precio de gondola incluye IVA; la factura lo desglosa hacia atras.
  ('tax.prices_include_tax',           'true',               datetime('now')),
  ('tax.rounding_mode',                '"half_up"',          datetime('now')),
  -- Impuesto Municipal sobre Ingresos: 1% sobre ingresos brutos en Managua,
  -- lo fija el plan de arbitrios de cada municipio. NO es un impuesto por
  -- linea: es una declaracion mensual. Vive aqui solo para el reporte.
  ('tax.imi_rate_bp',                  '100',                datetime('now')),

  -- === Inventario ===========================================================
  ('inventory.allow_negative',         'false',              datetime('now')),
  ('inventory.costing_method',         '"weighted_average"', datetime('now')),
  ('inventory.lot_policy',             '"fefo"',             datetime('now')),

  -- === Caja =================================================================
  ('cash.blind_close',                 'true',               datetime('now')),
  -- Denominaciones del cordoba en centavos, de mayor a menor:
  -- billetes C$1000/500/200/100/50/20/10 · monedas C$10/5/1 y 0.50/0.25/0.10/0.05
  ('cash.denominations',               '[100000,50000,20000,10000,5000,2000,1000,500,100,50,25,10,5]', datetime('now')),
  -- La fraccion mas pequeña en circulacion es de 5 centavos. El TOTAL de la
  -- factura queda exacto al centavo; solo el pago en EFECTIVO se redondea a
  -- multiplos de 5, y la diferencia se registra como linea de redondeo.
  ('cash.rounding_precision_cents',    '5',                  datetime('now')),
  ('cash.rounding_applies_to',         '"cash_only"',        datetime('now')),

  -- === Ventas ===============================================================
  ('sales.require_auth_for_discount',  'true',               datetime('now')),
  ('sales.require_auth_for_void',      'true',               datetime('now')),
  ('sales.max_discount_bp',            '2000',               datetime('now')),
  -- La DGI no admite anular una factura ya emitida: se emite nota de credito.
  -- Solo se permite anular dentro del mismo turno y antes de entregarla.
  ('sales.void_window_minutes',        '15',                 datetime('now')),
  ('sales.return_window_days',         '30',                 datetime('now')),

  -- === Interfaz y rubro =====================================================
  ('ui.theme',                         '"dark"',             datetime('now')),
  ('ui.density',                       '"comfortable"',      datetime('now')),
  ('business.profile',                 '"minimarket"',       datetime('now'));

-- Identidad fiscal del negocio. Una sola fila. Estos datos se imprimen en
-- cada factura y la Disposicion Tecnica 09-2007 de la DGI los exige todos.
CREATE TABLE company (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name        TEXT NOT NULL,   -- nombre completo, natural o juridico
  trade_name        TEXT,            -- nombre comercial
  ruc               TEXT NOT NULL,
  address           TEXT NOT NULL,
  phone             TEXT NOT NULL,
  municipality      TEXT,            -- define la tasa del IMI
  -- Numero de autorizacion del sistema de facturacion emitido por la DGI.
  -- Se imprime en la PARTE INFERIOR DERECHA de cada factura.
  dgi_auth_number   TEXT,
  dgi_auth_date     TEXT,
  logo_path         TEXT,
  receipt_footer    TEXT,
  updated_at        TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- 1. Seguridad, usuarios y auditoria
-- -----------------------------------------------------------------------------

CREATE TABLE roles (
  id                INTEGER PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  -- ["sales.create","sales.void","inventory.adjust","reports.margin", ...]
  permissions_json  TEXT NOT NULL DEFAULT '[]',
  is_system         INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1))
);

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  uid            TEXT NOT NULL UNIQUE,
  username       TEXT NOT NULL UNIQUE,
  full_name      TEXT NOT NULL,
  role_id        INTEGER NOT NULL REFERENCES roles(id),
  -- PIN corto para entrada rapida del cajero, password para administracion.
  -- AMBOS son hash argon2id. Nunca texto plano, nunca cruzan al renderer.
  pin_hash       TEXT,
  password_hash  TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- LIBRO. Toda accion sensible deja rastro. Sin excepciones.
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  uid          TEXT NOT NULL UNIQUE,
  at           TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id),
  approved_by  INTEGER REFERENCES users(id),  -- supervisor que autorizo
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    INTEGER,
  before_json  TEXT,
  after_json   TEXT,
  reason       TEXT
);
CREATE INDEX idx_audit_at     ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

-- -----------------------------------------------------------------------------
-- 2. Catalogo: unidades, impuestos, categorias, productos y variantes
-- -----------------------------------------------------------------------------

CREATE TABLE units (
  id        INTEGER PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,   -- PZA, KG, LT, MT, CAJA
  name      TEXT NOT NULL,
  -- Decimales que acepta la venta. 0 = solo enteros (una camisa, un martillo).
  -- 3 = granel (1.250 kg). El POS bloquea la captura segun este valor.
  decimals  INTEGER NOT NULL DEFAULT 0 CHECK (decimals BETWEEN 0 AND 3)
);

-- En Nicaragua no basta con la tasa: la factura debe separar la base GRAVADA
-- de la base EXENTA, y buena parte de la canasta basica esta exenta. Un
-- articulo exento y uno gravado al 0% suman lo mismo pero se declaran
-- distinto, asi que el tipo se guarda aparte de la tasa.
CREATE TABLE tax_rates (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'taxable'
                CHECK (kind IN ('taxable','exempt','not_subject')),
  rate_bp     INTEGER NOT NULL CHECK (rate_bp >= 0),   -- 1500 = 15% (IVA NI)
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CHECK (kind = 'taxable' OR rate_bp = 0)
);

INSERT INTO tax_rates (code, name, kind, rate_bp, is_default) VALUES
  ('IVA15',  'IVA 15%',            'taxable',     1500, 1),
  ('EXENTO', 'Exento de IVA',      'exempt',         0, 0),
  ('NOSUJ',  'No sujeto',          'not_subject',    0, 0);

-- Series y correlativos de documentos. La Disposicion Tecnica 09-2007 exige
-- numeracion correlativa inalterable, distinta por sucursal y por tipo, y un
-- talonario PRE-IMPRESO de contingencia cuyo correlativo debe ser diferente
-- al del sistema y reportarse a la DGI.
CREATE TABLE document_series (
  id                INTEGER PRIMARY KEY,
  doc_type          TEXT NOT NULL CHECK (doc_type IN
                      ('invoice','credit_note','ticket','proforma','purchase','shift')),
  code              TEXT NOT NULL UNIQUE,     -- 'A', 'B', 'CONT-A'
  prefix            TEXT NOT NULL DEFAULT '',
  next_number       INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  range_from        INTEGER,                  -- rango autorizado, si aplica
  range_to          INTEGER,
  -- Serie de contingencia: talonario pre-impreso que se usa cuando el sistema
  -- o la impresora no estan disponibles. Se captura despues, nunca se emite.
  is_contingency    INTEGER NOT NULL DEFAULT 0 CHECK (is_contingency IN (0,1)),
  dgi_auth_number   TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES categories(id),
  color       TEXT,        -- token de acento para la reticula tactil del POS
  icon        TEXT,        -- nombre del icono lucide
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- PRODUCTO = el modelo conceptual ("Camisa Oxford", "Coca-Cola 600 ml").
-- No tiene stock ni precio propio: eso vive en la VARIANTE.
CREATE TABLE products (
  id               INTEGER PRIMARY KEY,
  uid              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'product'
                     CHECK (kind IN ('product','service')),
  category_id      INTEGER REFERENCES categories(id),
  unit_id          INTEGER NOT NULL REFERENCES units(id),
  -- NULL significa SIN DEFINIR, y es a proposito. La lista taxativa de bienes
  -- exentos vive en el art. 127 de la Ley 822 y el Ministerio de Hacienda la
  -- actualiza: ninguna lista quemada en el codigo seria confiable. Un producto
  -- nuevo nace sin estatus, alguien que conoce la norma lo define, y el
  -- servicio de ventas se niega a venderlo en regimen general mientras siga
  -- en NULL. Un valor por omision aqui pareceria una decision que nadie tomo.
  tax_rate_id      INTEGER REFERENCES tax_rates(id),
  tracks_stock     INTEGER NOT NULL DEFAULT 1 CHECK (tracks_stock IN (0,1)),
  tracks_lots      INTEGER NOT NULL DEFAULT 0 CHECK (tracks_lots IN (0,1)),
  description      TEXT,
  -- ATRIBUTOS DINAMICOS POR RUBRO: aqui vive la adaptabilidad multinegocio.
  -- Solo datos DESCRIPTIVOS (marca, material, voltaje, presentacion, garantia).
  -- Nunca guardar aqui nada que se sume o se filtre en caliente: eso va en
  -- columna real o en columna generada.
  attributes_json  TEXT NOT NULL DEFAULT '{}',
  -- Columna generada: saca del JSON al indice lo que el rubro filtra a diario,
  -- sin duplicar la verdad. Añadir una por cada filtro frecuente del perfil.
  brand            TEXT GENERATED ALWAYS AS (json_extract(attributes_json,'$.brand')) VIRTUAL,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX idx_products_category ON products(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_brand    ON products(brand);
CREATE INDEX idx_products_name     ON products(name COLLATE NOCASE);

-- VARIANTE = la unidad real de inventario (SKU).
-- Un producto simple (abarroteria) tiene exactamente UNA variante, creada
-- automaticamente. Un producto con ejes (ropa) tiene N. El codigo NUNCA
-- ramifica entre "simple" y "con variantes": siempre opera sobre variantes.
-- Tres ejes fijos cubren el 99% de los casos reales y se indexan directo.
CREATE TABLE product_variants (
  id                 INTEGER PRIMARY KEY,
  uid                TEXT NOT NULL UNIQUE,
  product_id         INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                TEXT NOT NULL UNIQUE,
  opt1_name          TEXT,   -- 'Talla'
  opt1_value         TEXT,   -- 'M'
  opt2_name          TEXT,   -- 'Color'
  opt2_value         TEXT,   -- 'Azul'
  opt3_name          TEXT,
  opt3_value         TEXT,
  price_cents        INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  -- COSTO PROMEDIO PONDERADO vigente. Lo escribe SOLO el servicio de costeo,
  -- SOLO en entradas de inventario. Ningun otro codigo toca esta columna.
  cost_avg_micros    INTEGER NOT NULL DEFAULT 0 CHECK (cost_avg_micros >= 0),
  -- CACHE derivado del Kardex. La verdad es SUM(inventory_moves). Existe por
  -- velocidad. El comando `inventory:reconcile` lo recalcula y reporta drift.
  stock_milli        INTEGER NOT NULL DEFAULT 0,
  min_stock_milli    INTEGER NOT NULL DEFAULT 0,
  image_path         TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_variants_product   ON product_variants(product_id);
CREATE INDEX idx_variants_options   ON product_variants(product_id, opt1_value, opt2_value, opt3_value);
CREATE INDEX idx_variants_low_stock ON product_variants(stock_milli) WHERE is_active = 1;

-- Una variante puede tener varios codigos de barras (el mismo refresco con dos
-- codigos segun el proveedor). En abarroteria esto no es un caso raro.
CREATE TABLE barcodes (
  id          INTEGER PRIMARY KEY,
  variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1))
);
CREATE INDEX idx_barcodes_variant ON barcodes(variant_id);

-- Busqueda instantanea del POS, mantenida por triggers desde products y
-- variants. Escribir en el buscador debe responder en menos de 16 ms.
CREATE VIRTUAL TABLE variant_search USING fts5(
  variant_id UNINDEXED,
  sku,
  name,
  options,
  brand,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE price_lists (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,     -- MENUDEO, MAYOREO
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1))
);

CREATE TABLE price_list_items (
  price_list_id  INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  variant_id     INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  min_qty_milli  INTEGER NOT NULL DEFAULT 0,   -- precio escalonado por volumen
  PRIMARY KEY (price_list_id, variant_id, min_qty_milli)
);

-- Definicion de campos personalizados por rubro. El formulario de producto se
-- RENDERIZA a partir de esta tabla: añadir un campo a una ferreteria no toca
-- ni el codigo ni el esquema, es un INSERT.
CREATE TABLE attribute_definitions (
  id            INTEGER PRIMARY KEY,
  entity        TEXT NOT NULL CHECK (entity IN ('product','customer','supplier')),
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('text','number','select','multiselect','boolean','date')),
  options_json  TEXT NOT NULL DEFAULT '[]',
  is_required   INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0,1)),
  is_filterable INTEGER NOT NULL DEFAULT 0 CHECK (is_filterable IN (0,1)),
  profile_code  TEXT,   -- NULL = aplica a todos los rubros
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (entity, key)
);

-- -----------------------------------------------------------------------------
-- 3. Inventario: almacenes, Kardex inmutable, lotes y conteos
-- -----------------------------------------------------------------------------

CREATE TABLE warehouses (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1))
);

-- ============================ LIBRO: KARDEX ==================================
-- La unica verdad del inventario y del costo. Append-only, sin excepciones.
-- Cada renglon congela el costo unitario y el saldo POSTERIOR al movimiento,
-- de modo que un reporte historico jamas cambia porque hoy entro mercancia.
CREATE TABLE inventory_moves (
  id                       INTEGER PRIMARY KEY,
  uid                      TEXT NOT NULL UNIQUE,
  at                       TEXT NOT NULL,
  warehouse_id             INTEGER NOT NULL REFERENCES warehouses(id),
  variant_id               INTEGER NOT NULL REFERENCES product_variants(id),
  direction                TEXT NOT NULL CHECK (direction IN ('in','out')),
  -- SIEMPRE positiva. El signo lo da `direction`, nunca la cantidad.
  qty_milli                INTEGER NOT NULL CHECK (qty_milli > 0),
  -- Costo unitario aplicado a ESTE movimiento. En entradas, el costo de compra
  -- con flete prorrateado. En salidas, el CPP vigente en ese instante.
  unit_cost_micros         INTEGER NOT NULL CHECK (unit_cost_micros >= 0),
  total_cost_cents         INTEGER NOT NULL,
  -- Saldos DESPUES del movimiento: permiten reconstruir cualquier fecha sin
  -- reprocesar el libro entero.
  balance_qty_milli        INTEGER NOT NULL,
  balance_avg_cost_micros  INTEGER NOT NULL,
  reason                   TEXT NOT NULL CHECK (reason IN (
                             'purchase','sale','sale_return','purchase_return',
                             'adjustment_in','adjustment_out','count',
                             'transfer_in','transfer_out','initial','waste')),
  ref_type                 TEXT,     -- 'sale' | 'purchase' | 'stock_count'
  ref_id                   INTEGER,
  lot_id                   INTEGER,
  user_id                  INTEGER REFERENCES users(id),
  note                     TEXT
);
CREATE INDEX idx_moves_variant_at ON inventory_moves(variant_id, at);
CREATE INDEX idx_moves_ref        ON inventory_moves(ref_type, ref_id);
CREATE INDEX idx_moves_at         ON inventory_moves(at);

-- Inmutabilidad impuesta por el motor, no por la disciplina del programador.
CREATE TRIGGER trg_moves_no_update BEFORE UPDATE ON inventory_moves
BEGIN
  SELECT RAISE(ABORT, 'Kardex inmutable: corrija con un movimiento inverso');
END;
CREATE TRIGGER trg_moves_no_delete BEFORE DELETE ON inventory_moves
BEGIN
  SELECT RAISE(ABORT, 'Kardex inmutable: corrija con un movimiento inverso');
END;

-- Lotes: trazabilidad y caducidad (FEFO, primero el que vence antes).
-- DECISION EXPLICITA: el costeo sigue siendo CPP a nivel de variante; el lote
-- no lleva costo propio. Es una simplificacion deliberada del MVP.
CREATE TABLE inventory_lots (
  id            INTEGER PRIMARY KEY,
  variant_id    INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_id  INTEGER NOT NULL REFERENCES warehouses(id),
  lot_code      TEXT NOT NULL,
  expires_on    TEXT,
  qty_milli     INTEGER NOT NULL DEFAULT 0,
  received_at   TEXT NOT NULL,
  UNIQUE (variant_id, warehouse_id, lot_code)
);
CREATE INDEX idx_lots_expiry ON inventory_lots(expires_on) WHERE qty_milli > 0;

CREATE TABLE stock_counts (
  id           INTEGER PRIMARY KEY,
  uid          TEXT NOT NULL UNIQUE,
  folio        TEXT NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied','cancelled')),
  started_at   TEXT NOT NULL,
  applied_at   TEXT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  note         TEXT
);

CREATE TABLE stock_count_lines (
  id              INTEGER PRIMARY KEY,
  stock_count_id  INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  variant_id      INTEGER NOT NULL REFERENCES product_variants(id),
  system_milli    INTEGER NOT NULL,   -- lo que decia el sistema al iniciar
  counted_milli   INTEGER NOT NULL,   -- lo que conto la persona
  diff_milli      INTEGER NOT NULL,
  UNIQUE (stock_count_id, variant_id)
);

-- -----------------------------------------------------------------------------
-- 4. Terceros: clientes y proveedores
-- -----------------------------------------------------------------------------

CREATE TABLE customers (
  id                 INTEGER PRIMARY KEY,
  uid                TEXT NOT NULL UNIQUE,
  code               TEXT UNIQUE,
  name               TEXT NOT NULL,
  -- Datos fiscales: se capturan desde el MVP aunque todavia no haya timbrado.
  -- Cuestan poco ahora y evitan una migracion dolorosa el dia que se facture.
  doc_type           TEXT,
  doc_number         TEXT,
  tax_regime         TEXT,
  phone              TEXT,
  email              TEXT,
  address            TEXT,
  price_list_id      INTEGER REFERENCES price_lists(id),
  credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0),
  credit_days        INTEGER NOT NULL DEFAULT 0,
  attributes_json    TEXT NOT NULL DEFAULT '{}',
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);
CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX idx_customers_doc  ON customers(doc_number);

CREATE TABLE suppliers (
  id               INTEGER PRIMARY KEY,
  uid              TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  doc_number       TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  credit_days      INTEGER NOT NULL DEFAULT 0,
  attributes_json  TEXT NOT NULL DEFAULT '{}',
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_suppliers_name ON suppliers(name COLLATE NOCASE);

-- -----------------------------------------------------------------------------
-- 5. Caja: turnos, movimientos de efectivo y arqueo por denominaciones
-- -----------------------------------------------------------------------------

CREATE TABLE cash_shifts (
  id                   INTEGER PRIMARY KEY,
  uid                  TEXT NOT NULL UNIQUE,
  folio                TEXT NOT NULL UNIQUE,
  opened_at            TEXT NOT NULL,
  opened_by            INTEGER NOT NULL REFERENCES users(id),
  opening_float_cents  INTEGER NOT NULL CHECK (opening_float_cents >= 0),
  closed_at            TEXT,
  closed_by            INTEGER REFERENCES users(id),
  -- Los tres numeros del arqueo. `expected` se calcula SIEMPRE sumando
  -- cash_movements, jamas incrementando un contador en memoria.
  counted_cents        INTEGER,
  expected_cents       INTEGER,
  difference_cents     INTEGER,
  -- El dolar que entro al cajon se cuenta APARTE, en dolares. Convertirlo a
  -- cordobas para cuadrar la caja esconde faltantes detras del tipo de cambio.
  opening_float_usd    INTEGER NOT NULL DEFAULT 0 CHECK (opening_float_usd >= 0),
  counted_usd          INTEGER,
  expected_usd         INTEGER,
  difference_usd       INTEGER,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  note                 TEXT
);
-- Una sola caja abierta a la vez. Lo impone el indice, no el codigo.
CREATE UNIQUE INDEX idx_one_open_shift ON cash_shifts(status) WHERE status = 'open';

-- ======================== LIBRO: EFECTIVO ====================================
-- Los importes llevan SIGNO: positivo entra al cajon, negativo sale.
-- Un movimiento pertenece a UNA moneda fisica. `amount_cents` es siempre el
-- equivalente en cordobas (para reportes de venta); `amount_fx` es el billete
-- real que entro o salio, y es lo unico que se compara contra el conteo.
CREATE TABLE cash_movements (
  id             INTEGER PRIMARY KEY,
  uid            TEXT NOT NULL UNIQUE,
  shift_id       INTEGER NOT NULL REFERENCES cash_shifts(id),
  at             TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN (
                   'opening_float','sale','sale_refund','customer_payment',
                   'supplier_payment','pay_in','pay_out','withdrawal','adjustment')),
  currency_code  TEXT NOT NULL DEFAULT 'NIO' CHECK (currency_code IN ('NIO','USD')),
  amount_fx      INTEGER NOT NULL,
  fx_rate_micros INTEGER NOT NULL DEFAULT 1000000 CHECK (fx_rate_micros > 0),
  amount_cents   INTEGER NOT NULL,
  ref_type       TEXT,
  ref_id         INTEGER,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  note           TEXT,
  CHECK (currency_code <> 'NIO' OR (fx_rate_micros = 1000000 AND amount_fx = amount_cents))
);
CREATE INDEX idx_cash_shift ON cash_movements(shift_id, currency_code, at);

CREATE TRIGGER trg_cash_no_update BEFORE UPDATE ON cash_movements
BEGIN
  SELECT RAISE(ABORT, 'Libro de efectivo inmutable: use un movimiento de ajuste');
END;
CREATE TRIGGER trg_cash_no_delete BEFORE DELETE ON cash_movements
BEGIN
  SELECT RAISE(ABORT, 'Libro de efectivo inmutable: use un movimiento de ajuste');
END;

-- Conteo fisico billete por billete, una fila por denominacion y moneda.
-- Total contado = SUM(denominacion * cantidad), por moneda.
CREATE TABLE cash_count_lines (
  id                 INTEGER PRIMARY KEY,
  shift_id           INTEGER NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
  moment             TEXT NOT NULL CHECK (moment IN ('open','close')),
  currency_code      TEXT NOT NULL DEFAULT 'NIO' CHECK (currency_code IN ('NIO','USD')),
  denomination_cents INTEGER NOT NULL CHECK (denomination_cents > 0),
  quantity           INTEGER NOT NULL CHECK (quantity >= 0),
  UNIQUE (shift_id, moment, currency_code, denomination_cents)
);

-- -----------------------------------------------------------------------------
-- 6. Ventas
-- -----------------------------------------------------------------------------

-- Una nota de credito es una venta con doc_type='credit_note' y documento
-- padre. Las cantidades siguen siendo positivas; la direccion la da el tipo.
-- Un solo camino de codigo, un solo juego de reportes, ninguna tabla espejo.
--
-- POR QUE NOTA DE CREDITO Y NO ANULACION: la Disposicion Tecnica 09-2007 de
-- la DGI no admite anular una factura ya emitida; la correccion posterior se
-- hace con nota de credito, con su propio correlativo y su concepto. La
-- anulacion directa queda reservada a la ventana corta que define
-- `sales.void_window_minutes`, antes de entregar el documento.
CREATE TABLE sales (
  id                   INTEGER PRIMARY KEY,
  uid                  TEXT NOT NULL UNIQUE,
  doc_type             TEXT NOT NULL DEFAULT 'ticket'
                         CHECK (doc_type IN ('ticket','invoice','credit_note','proforma')),
  series_id            INTEGER NOT NULL REFERENCES document_series(id),
  number               INTEGER NOT NULL,        -- correlativo dentro de la serie
  folio                TEXT NOT NULL UNIQUE,    -- prefijo + numero, lo que se imprime
  parent_sale_id       INTEGER REFERENCES sales(id),
  at                   TEXT NOT NULL,
  shift_id             INTEGER NOT NULL REFERENCES cash_shifts(id),
  user_id              INTEGER NOT NULL REFERENCES users(id),
  customer_id          INTEGER REFERENCES customers(id),
  price_list_id        INTEGER REFERENCES price_lists(id),
  status               TEXT NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('completed','voided')),
  -- La DGI exige que la factura diga si es de CONTADO o de CREDITO.
  payment_condition    TEXT NOT NULL DEFAULT 'contado'
                         CHECK (payment_condition IN ('contado','credito')),
  -- Documento capturado desde el talonario PRE-IMPRESO de contingencia
  -- (se fue la luz, fallo la impresora). Lleva el correlativo del talonario.
  is_contingency       INTEGER NOT NULL DEFAULT 0 CHECK (is_contingency IN (0,1)),
  -- Congelados en el documento: si mañana cambia el regimen, la autorizacion
  -- o la politica de impuesto incluido, los documentos viejos siguen cuadrando
  -- y siguen imprimiendose igual que el dia que se emitieron.
  tax_regime           TEXT NOT NULL CHECK (tax_regime IN ('cuota_fija','general')),
  prices_include_tax   INTEGER NOT NULL CHECK (prices_include_tax IN (0,1)),
  dgi_auth_number      TEXT,
  -- === Importes. Todos son la SUMA de las lineas, nunca se calculan aparte. ==
  -- Las bases ya vienen NETAS de todos los descuentos: el descuento global se
  -- prorratea a las lineas antes de calcular el impuesto, de modo que nunca
  -- se resta dos veces.
  gross_cents          INTEGER NOT NULL DEFAULT 0,  -- precio x cantidad, informativo
  line_discount_cents  INTEGER NOT NULL DEFAULT 0,  -- informativo, ya prorrateado
  order_discount_cents INTEGER NOT NULL DEFAULT 0,  -- informativo, ya prorrateado
  taxable_base_cents   INTEGER NOT NULL DEFAULT 0,  -- base gravada, neta
  exempt_base_cents    INTEGER NOT NULL DEFAULT 0,  -- base exenta, neta
  tax_cents            INTEGER NOT NULL DEFAULT 0,
  -- Redondeo del pago en efectivo a multiplos de 5 centavos. Lleva signo y es
  -- cero en cualquier venta que no se pague en efectivo.
  cash_rounding_cents  INTEGER NOT NULL DEFAULT 0,
  total_cents          INTEGER NOT NULL,
  cogs_cents           INTEGER NOT NULL DEFAULT 0,  -- costo de lo vendido
  paid_cents           INTEGER NOT NULL DEFAULT 0,
  change_cents         INTEGER NOT NULL DEFAULT 0,
  credit_cents         INTEGER NOT NULL DEFAULT 0,  -- lo que quedo a deber
  discount_auth_by     INTEGER REFERENCES users(id),
  note                 TEXT,
  voided_at            TEXT,
  voided_by            INTEGER REFERENCES users(id),
  void_reason          TEXT,
  -- INVARIANTES CONTABLES verificadas por el motor en cada INSERT.
  -- Si el codigo se equivoca, la base de datos rechaza el documento.
  CHECK (total_cents = taxable_base_cents + exempt_base_cents + tax_cents + cash_rounding_cents),
  CHECK (paid_cents + credit_cents - change_cents = total_cents),
  -- En cuota fija no se traslada IVA: el impuesto tiene que ser cero.
  CHECK (tax_regime = 'general' OR tax_cents = 0),
  UNIQUE (series_id, number)
);
CREATE INDEX idx_sales_at       ON sales(at);
CREATE INDEX idx_sales_shift    ON sales(shift_id);
CREATE INDEX idx_sales_customer ON sales(customer_id, at);

CREATE TABLE sale_lines (
  id                   INTEGER PRIMARY KEY,
  sale_id              INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  line_no              INTEGER NOT NULL,
  variant_id           INTEGER REFERENCES product_variants(id),
  -- Descripcion congelada: si mañana renombran el producto, el ticket viejo
  -- sigue diciendo lo que el cliente compro.
  description          TEXT NOT NULL,
  qty_milli            INTEGER NOT NULL CHECK (qty_milli > 0),
  unit_price_cents     INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_discount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_cents >= 0),
  -- Parte del descuento global que le toco a esta linea. La suma de esta
  -- columna en el documento es EXACTAMENTE sales.order_discount_cents.
  alloc_discount_cents INTEGER NOT NULL DEFAULT 0,
  -- Congelado por linea: un articulo exento y uno gravado al 0% suman igual
  -- pero se declaran distinto, y el ticket los separa en bloques.
  tax_kind             TEXT NOT NULL DEFAULT 'taxable'
                         CHECK (tax_kind IN ('taxable','exempt','not_subject')),
  tax_rate_bp          INTEGER NOT NULL,
  taxable_base_cents   INTEGER NOT NULL,
  tax_cents            INTEGER NOT NULL,
  total_cents          INTEGER NOT NULL,
  -- Costo congelado al momento de vender. Nunca se recalcula.
  unit_cost_micros     INTEGER NOT NULL DEFAULT 0,
  cogs_cents           INTEGER NOT NULL DEFAULT 0,
  lot_id               INTEGER REFERENCES inventory_lots(id),
  UNIQUE (sale_id, line_no)
);
CREATE INDEX idx_sale_lines_variant ON sale_lines(variant_id);

-- El dolar se acepta como MEDIO DE PAGO, nunca como moneda de precio, y el
-- vuelto se entrega SIEMPRE en cordobas. Cada pago congela el tipo de cambio
-- que el negocio aplico, que puede diferir del oficial del BCN.
CREATE TABLE sale_payments (
  id             INTEGER PRIMARY KEY,
  sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method         TEXT NOT NULL CHECK (method IN
                   ('cash','card','transfer','mobile','credit','voucher','points')),
  currency_code  TEXT NOT NULL DEFAULT 'NIO' CHECK (currency_code IN ('NIO','USD')),
  -- Monto ENTREGADO por el cliente en la moneda del pago, en su unidad minima.
  -- Para efectivo es el billete que puso sobre el mostrador, no el importe de
  -- la venta: el vuelto se resuelve una sola vez, en sales.change_cents.
  amount_fx      INTEGER NOT NULL CHECK (amount_fx > 0),
  -- Tipo de cambio aplicado, 6 decimales. 1000000 = 1.0 cuando es NIO.
  fx_rate_micros INTEGER NOT NULL DEFAULT 1000000 CHECK (fx_rate_micros > 0),
  -- Equivalente en cordobas. Es la unica columna que suma en los reportes.
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  reference      TEXT,     -- ultimos 4 digitos, folio de transferencia
  at             TEXT NOT NULL,
  CHECK (currency_code <> 'NIO' OR (fx_rate_micros = 1000000 AND amount_fx = amount_cents))
);
CREATE INDEX idx_payments_sale ON sale_payments(sale_id);

-- Tickets suspendidos ("apartar" en el POS). No tocan inventario ni caja.
CREATE TABLE held_sales (
  id          INTEGER PRIMARY KEY,
  label       TEXT NOT NULL,
  cart_json   TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

-- -----------------------------------------------------------------------------
-- 7. Compras
-- -----------------------------------------------------------------------------

CREATE TABLE purchases (
  id              INTEGER PRIMARY KEY,
  uid             TEXT NOT NULL UNIQUE,
  folio           TEXT NOT NULL UNIQUE,
  supplier_id     INTEGER NOT NULL REFERENCES suppliers(id),
  warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id),
  at              TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','received','cancelled')),
  supplier_doc    TEXT,
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  -- Flete y gastos: se prorratean al costo unitario de cada linea antes de
  -- tocar el CPP. Un flete que no entra al costo hace mentir al margen.
  freight_cents   INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  paid_cents      INTEGER NOT NULL DEFAULT 0,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  received_at     TEXT,
  note            TEXT
);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id, at);

CREATE TABLE purchase_lines (
  id                      INTEGER PRIMARY KEY,
  purchase_id             INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  line_no                 INTEGER NOT NULL,
  variant_id              INTEGER NOT NULL REFERENCES product_variants(id),
  qty_milli               INTEGER NOT NULL CHECK (qty_milli > 0),
  unit_cost_cents         INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  -- Costo unitario final con flete prorrateado. ESTE es el numero que entra
  -- al CPP, no unit_cost_cents.
  landed_unit_cost_micros INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp             INTEGER NOT NULL DEFAULT 0,
  tax_cents               INTEGER NOT NULL DEFAULT 0,
  total_cents             INTEGER NOT NULL,
  lot_code                TEXT,
  expires_on              TEXT,
  UNIQUE (purchase_id, line_no)
);

CREATE TABLE supplier_payments (
  id            INTEGER PRIMARY KEY,
  uid           TEXT NOT NULL UNIQUE,
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_id   INTEGER REFERENCES purchases(id),
  at            TEXT NOT NULL,
  method        TEXT NOT NULL CHECK (method IN ('cash','card','transfer','check')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  shift_id      INTEGER REFERENCES cash_shifts(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  reference     TEXT,
  note          TEXT
);

-- -----------------------------------------------------------------------------
-- 8. Credito (cuentas por cobrar) y fidelizacion
-- -----------------------------------------------------------------------------

-- ======================== LIBRO: CUENTA CORRIENTE ============================
-- Mismo principio que el Kardex: el saldo no se guarda como dato editable, se
-- deriva del libro. amount_cents con signo: + cargo (debe), - abono.
CREATE TABLE customer_ledger (
  id                  INTEGER PRIMARY KEY,
  uid                 TEXT NOT NULL UNIQUE,
  customer_id         INTEGER NOT NULL REFERENCES customers(id),
  at                  TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('charge','payment','adjustment','write_off')),
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  due_on              TEXT,
  ref_type            TEXT,
  ref_id              INTEGER,
  shift_id            INTEGER REFERENCES cash_shifts(id),
  method              TEXT CHECK (method IN ('cash','card','transfer','check')),
  user_id             INTEGER NOT NULL REFERENCES users(id),
  note                TEXT
);
CREATE INDEX idx_cust_ledger ON customer_ledger(customer_id, at);

CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON customer_ledger
BEGIN
  SELECT RAISE(ABORT, 'Cuenta corriente inmutable: use un movimiento de ajuste');
END;
CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON customer_ledger
BEGIN
  SELECT RAISE(ABORT, 'Cuenta corriente inmutable: use un movimiento de ajuste');
END;

CREATE TABLE loyalty_ledger (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  at             TEXT NOT NULL,
  points         INTEGER NOT NULL,          -- + gana, - canjea
  balance_after  INTEGER NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('earn','redeem','expire','adjust')),
  ref_type       TEXT,
  ref_id         INTEGER,
  user_id        INTEGER REFERENCES users(id)
);
CREATE INDEX idx_loyalty_customer ON loyalty_ledger(customer_id, at);

-- -----------------------------------------------------------------------------
-- 9. Vistas de conciliacion
-- Existen para responder una sola pregunta: "¿la cache miente?".
-- El comando `inventory:reconcile` las compara contra las columnas cache y
-- reporta cualquier diferencia. Se ejecuta en cada cierre de turno.
-- -----------------------------------------------------------------------------

CREATE VIEW v_stock_from_kardex AS
SELECT
  variant_id,
  warehouse_id,
  SUM(CASE WHEN direction = 'in' THEN qty_milli ELSE -qty_milli END) AS qty_milli
FROM inventory_moves
GROUP BY variant_id, warehouse_id;

CREATE VIEW v_stock_drift AS
SELECT
  v.id                                     AS variant_id,
  v.sku,
  v.stock_milli                            AS cached_milli,
  COALESCE(k.qty_milli, 0)                 AS kardex_milli,
  v.stock_milli - COALESCE(k.qty_milli, 0) AS drift_milli
FROM product_variants v
LEFT JOIN v_stock_from_kardex k ON k.variant_id = v.id
WHERE v.stock_milli <> COALESCE(k.qty_milli, 0);

CREATE VIEW v_customer_balance AS
SELECT
  c.id                             AS customer_id,
  c.name,
  COALESCE(SUM(l.amount_cents), 0) AS balance_cents
FROM customers c
LEFT JOIN customer_ledger l ON l.customer_id = c.id
GROUP BY c.id, c.name;

-- Productos que todavia nadie clasifico para el IVA. Alimenta la pantalla de
-- revision masiva, el aviso del panel del dueño y el bloqueo de la primera
-- venta en regimen general. Tiene que llegar a cero antes de facturar.
CREATE VIEW v_products_without_tax_status AS
SELECT
  p.id,
  p.name,
  c.name AS category
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.tax_rate_id IS NULL
  AND p.deleted_at IS NULL
  AND p.is_active = 1;

-- Base del Impuesto Municipal sobre Ingresos: ingresos brutos por mes, netos
-- de notas de credito. La tasa la fija el plan de arbitrios del municipio
-- (1% en Managua) y se declara mensualmente ante la alcaldia.
CREATE VIEW v_monthly_gross_income AS
SELECT
  substr(at, 1, 7) AS period,
  SUM(CASE WHEN doc_type = 'credit_note' THEN -total_cents ELSE total_cents END) AS gross_cents
FROM sales
WHERE status = 'completed' AND doc_type IN ('ticket','invoice','credit_note')
GROUP BY period;

-- Resumen diario de ventas e IVA trasladado, que es lo que se concilia contra
-- la declaracion mensual y contra el libro de ventas.
CREATE VIEW v_daily_tax_summary AS
SELECT
  substr(at, 1, 10) AS day,
  doc_type,
  COUNT(*)                     AS documents,
  SUM(taxable_base_cents)      AS taxable_base_cents,
  SUM(exempt_base_cents)       AS exempt_base_cents,
  SUM(tax_cents)               AS tax_cents,
  SUM(cash_rounding_cents)     AS rounding_cents,
  SUM(total_cents)             AS total_cents
FROM sales
WHERE status = 'completed'
GROUP BY day, doc_type;

-- Efectivo esperado en el cajon, POR MONEDA. Cada moneda se cuadra contra su
-- propio conteo fisico; no se mezclan ni se convierten.
CREATE VIEW v_shift_expected_cash AS
SELECT
  s.id           AS shift_id,
  c.currency_code,
  CASE c.currency_code WHEN 'NIO' THEN s.opening_float_cents
                       ELSE s.opening_float_usd END AS opening_float,
  COALESCE(SUM(m.amount_fx), 0) AS movements_fx,
  CASE c.currency_code WHEN 'NIO' THEN s.opening_float_cents
                       ELSE s.opening_float_usd END
    + COALESCE(SUM(m.amount_fx), 0) AS expected_fx
FROM cash_shifts s
CROSS JOIN (SELECT 'NIO' AS currency_code UNION ALL SELECT 'USD') c
LEFT JOIN cash_movements m
       ON m.shift_id = s.id
      AND m.currency_code = c.currency_code
      AND m.type <> 'opening_float'
GROUP BY s.id, c.currency_code, s.opening_float_cents, s.opening_float_usd;

CREATE VIEW v_shift_counted_cash AS
SELECT
  shift_id,
  moment,
  currency_code,
  SUM(denomination_cents * quantity) AS counted_fx
FROM cash_count_lines
GROUP BY shift_id, moment, currency_code;
