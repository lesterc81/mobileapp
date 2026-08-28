import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from './migrate';
import { seedIfEmpty } from './seed';

export const DB_NAME = 'inventory-pos.db';

export async function openDb() {
  const db = await openDatabaseAsync(DB_NAME);
  await migrateDbIfNeeded(db);
  return db;
}

export async function resetDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  await db.execAsync(`
    DROP TABLE IF EXISTS stock_movements;
    DROP TABLE IF EXISTS sales;
    DROP TABLE IF EXISTS recipes;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS ingredients;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS app_settings;
  `);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA user_version = 0;');
  await migrateDbIfNeeded(db);
  await seedIfEmpty(db);
}

export * from './types';
export * from './migrate';
export * from './ingredients';
export * from './products';
export * from './sales';
export * from './stockMovements';
export * from './seed';
export * from './users';