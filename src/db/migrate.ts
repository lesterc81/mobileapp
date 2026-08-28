import type { SQLiteDatabase } from 'expo-sqlite';
import { MIGRATION_V2, MIGRATION_V3, MIGRATION_V5, SCHEMA_V1, SCHEMA_VERSION } from './schema';

type Migration = (db: SQLiteDatabase) => Promise<void>;

const exec =
  (sql: string): Migration =>
  (db) => db.execAsync(sql);

const MIGRATIONS: Record<number, Migration> = {
  1: exec(SCHEMA_V1),
  2: exec(MIGRATION_V2),
  3: exec(MIGRATION_V3),
  4: migrateProductsBarcode,
  5: exec(MIGRATION_V5),
};

/**
 * Adds products.barcode plus a UNIQUE index. Idempotent and safe to re-run:
 * adds the column only if missing, and de-duplicates barcode values first so
 * the unique index can never fail and wedge startup.
 */
async function migrateProductsBarcode(db: SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(products)');
  if (!cols.some((c) => c.name === 'barcode')) {
    await db.execAsync('ALTER TABLE products ADD COLUMN barcode TEXT;');
  }
  await db.execAsync(`
    UPDATE products SET barcode = NULL
      WHERE barcode IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM products WHERE barcode IS NOT NULL GROUP BY barcode);
    DROP INDEX IF EXISTS idx_products_barcode;
    CREATE UNIQUE INDEX idx_products_barcode ON products(barcode);
  `);
}

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;

  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema is newer (v${current}) than the app supports (v${SCHEMA_VERSION})`);
  }

  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const migration = MIGRATIONS[next];
    if (!migration) {
      throw new Error(`Missing migration for schema v${next}`);
    }
    await migration(db);
    await db.execAsync(`PRAGMA user_version = ${next}`);
    current = next;
  }
}