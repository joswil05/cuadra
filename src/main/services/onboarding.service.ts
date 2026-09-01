import Database from 'better-sqlite3';
import {
  IndustryProfile,
  TaxRegime,
  getIndustrySeedCatalog
} from '../../core/onboarding';
import { openShift } from './cash.service';
import { createSimpleProduct } from './catalog.service';
import { insertKardexMove } from '../repositories/inventory.repository';

export interface OnboardingWizardInput {
  businessName: string;
  tradeName?: string;
  ruc: string;
  address: string;
  phone: string;
  municipality?: string;
  dgiAuthNumber?: string;
  taxRegime: TaxRegime;
  industryProfile: IndustryProfile;
  initialCashFundNio: bigint;
  initialCashFundUsd: bigint;
  adminFullName: string;
  adminPin?: string;
  adminPassword?: string;
}

export interface OnboardingResult {
  success: boolean;
  adminUserId: number;
  initialShiftId: number;
  seededProductsCount: number;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Ejecuta el Asistente de Primer Arranque (Onboarding Wizard) de Cuadra:
 * - Configura la identidad fiscal de la empresa (`company`).
 * - Graba el régimen tributario (`general` o `cuota_fija`) y perfil en `settings`.
 * - Inicializa series de comprobantes autorizadas por la DGI.
 * - Crea el usuario administrador / propietario.
 * - Siembra el catálogo inicial del rubro seleccionado con existencias en Kardex inmutable.
 * - Abre el primer turno de caja con el fondo inicial especificado.
 */
export function completeOnboardingWizard(
  db: Database.Database,
  input: OnboardingWizardInput
): OnboardingResult {
  return db.transaction(() => {
    const now = new Date().toISOString();

    // 1. Configuración de identidad de la empresa
    db.prepare(`
      INSERT INTO company (
        id, legal_name, trade_name, ruc, address, phone, municipality,
        dgi_auth_number, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        legal_name = excluded.legal_name,
        trade_name = excluded.trade_name,
        ruc = excluded.ruc,
        address = excluded.address,
        phone = excluded.phone,
        municipality = excluded.municipality,
        dgi_auth_number = excluded.dgi_auth_number,
        updated_at = excluded.updated_at
    `).run(
      input.businessName,
      input.tradeName ?? input.businessName,
      input.ruc,
      input.address,
      input.phone,
      input.municipality ?? 'Managua',
      input.dgiAuthNumber ?? null,
      now
    );

    // 2. Parámetros en settings (JSON)
    const upsertSetting = db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `);

    upsertSetting.run('tax.regime', JSON.stringify(input.taxRegime), now);
    upsertSetting.run('business.profile', JSON.stringify(input.industryProfile), now);
    upsertSetting.run('system.onboarding_completed', 'true', now);

    // 3. Asegurar Bodega y Roles
    db.prepare(`
      INSERT OR IGNORE INTO warehouses (id, code, name, is_default)
      VALUES (1, 'BOD-01', 'Bodega Principal', 1)
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO units (id, code, name, decimals)
      VALUES (1, 'PZA', 'Pieza', 0)
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO roles (id, code, name, permissions_json, is_system)
      VALUES
        (1, 'owner', 'Dueño / Administrador', '["*"]', 1),
        (2, 'supervisor', 'Supervisor', '["pos.sell","sales.discount","sales.void","inventory.adjust","reports.operational"]', 1),
        (3, 'cashier', 'Cajero', '["pos.sell"]', 1)
    `).run();

    // 4. Crear o actualizar usuario administrador
    let adminUserId = 1;
    const existingAdmin = db.prepare('SELECT id FROM users WHERE role_id = 1 LIMIT 1').get() as { id: number } | undefined;

    if (existingAdmin) {
      adminUserId = existingAdmin.id;
      db.prepare(`
        UPDATE users
        SET full_name = ?, is_active = 1
        WHERE id = ?
      `).run(input.adminFullName, adminUserId);
    } else {
      const userUid = uid();
      const insertUser = db.prepare(`
        INSERT INTO users (uid, username, full_name, role_id, is_active, created_at)
        VALUES (?, 'admin', ?, 1, 1, ?)
      `).run(userUid, input.adminFullName, now);
      adminUserId = Number(insertUser.lastInsertRowid);
    }

    // 5. Asegurar series de comprobantes DGI con sus prefijos
    db.prepare(`
      INSERT INTO document_series (id, code, prefix, doc_type, next_number, is_active)
      VALUES
        (1, 'T', 'T-', 'ticket', 1, 1),
        (2, 'F', 'F-', 'invoice', 1, 1),
        (3, 'NC', 'NC-', 'credit_note', 1, 1)
      ON CONFLICT(id) DO UPDATE SET
        prefix = excluded.prefix
    `).run();

    // 6. Sembrar catálogo del rubro
    const seedCatalog = getIndustrySeedCatalog(input.industryProfile);
    let seededProductsCount = 0;

    for (const prod of seedCatalog.products) {
      // 6.1 Asegurar categoría
      let catId: number | undefined = undefined;
      const catRow = db.prepare('SELECT id FROM categories WHERE name = ?').get(prod.categoryName) as { id: number } | undefined;
      if (catRow) {
        catId = catRow.id;
      } else {
        const insertCat = db.prepare(`
          INSERT INTO categories (id, name, sort_order) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM categories), ?, 0)
        `).run(prod.categoryName);
        catId = Number(insertCat.lastInsertRowid);
      }

      // 6.2 Crear producto y variante
      const taxRateId = input.taxRegime === 'cuota_fija' ? null : (prod.taxKind === 'taxable' ? 1 : null);

      const created = createSimpleProduct(db, {
        name: prod.name,
        sku: prod.sku,
        unitId: 1,
        categoryId: catId,
        priceCents: prod.priceCents,
        costMicros: prod.costCents * 10000n,
        taxRateId,
        userId: adminUserId
      });

      // 6.3 Sembrar stock inicial en Kardex inmutable
      if (prod.initialStockMilli > 0n) {
        insertKardexMove(db, {
          warehouseId: 1,
          variantId: created.variantId,
          direction: 'in',
          qtyMilli: prod.initialStockMilli,
          unitCostMicros: prod.costCents * 10000n,
          reason: 'initial',
          userId: adminUserId,
          note: 'Stock inicial de bienvenida'
        });

        db.prepare(`
          UPDATE product_variants
          SET min_stock_milli = ?
          WHERE id = ?
        `).run(Number(prod.minStockMilli), created.variantId);
      }

      seededProductsCount++;
    }

    // 7. Abrir turno inicial de caja con el fondo
    const shift = openShift(db, {
      openedBy: adminUserId,
      openingFloatCents: input.initialCashFundNio,
      openingFloatUsd: input.initialCashFundUsd
    });

    // 8. Registro de auditoría
    const auditUid = uid();
    db.prepare(`
      INSERT INTO audit_log (uid, at, user_id, action, entity, entity_id, reason)
      VALUES (?, ?, ?, 'onboarding.completed', 'company', 1, 'Asistente de configuración inicial completado')
    `).run(auditUid, now, adminUserId);

    return {
      success: true,
      adminUserId,
      initialShiftId: shift.id,
      seededProductsCount
    };
  })();
}
