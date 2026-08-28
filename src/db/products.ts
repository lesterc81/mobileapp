import type { SQLiteDatabase } from 'expo-sqlite';
import type { DBLike, Product, ProductWithRecipes, RecipeLine } from './types';

export type SaveProductInput = {
  name: string;
  price: number;
  is_active: boolean;
  barcode?: string | null;
  recipes: RecipeLine[];
};

function mapProductRow(
  row: { id: number; name: string; price: number; is_active: number; barcode: string | null } | null | undefined
): Product | null {
  if (!row) return null;
  return { id: row.id, name: row.name, price: row.price, is_active: row.is_active === 1, barcode: row.barcode ?? null };
}

export async function listProducts(db: DBLike, opts?: { includeInactive?: boolean }): Promise<Product[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; price: number; is_active: number; barcode: string | null }>(
    `SELECT id, name, price, is_active, barcode FROM products
     ${opts?.includeInactive ? '' : 'WHERE is_active = 1'}
     ORDER BY name COLLATE NOCASE`
  );
  return rows.map((row) => mapProductRow(row) as Product);
}

export interface ProductWithStats extends Product {
  recipe_count: number;
}

export interface ProductWithStock extends Product {
  first_short: string | null;
}

/**
 * Active products plus the name of the first ingredient too low to fulfill
 * one unit (null when the product can currently be made).
 */
export async function listProductsWithStock(db: DBLike): Promise<ProductWithStock[]> {
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    price: number;
    is_active: number;
    barcode: string | null;
    first_short: string | null;
  }>(
    `SELECT p.id, p.name, p.price, p.is_active, p.barcode,
            (SELECT i.name
             FROM recipes r2
             JOIN ingredients i ON i.id = r2.ingredient_id
             WHERE r2.product_id = p.id AND i.quantity_on_hand < r2.quantity_required
             LIMIT 1) AS first_short
     FROM products p
     WHERE p.is_active = 1
     ORDER BY p.name COLLATE NOCASE`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    is_active: r.is_active === 1,
    barcode: r.barcode ?? null,
    first_short: r.first_short ?? null,
  }));
}

export async function listProductsWithStats(
  db: DBLike,
  opts?: { includeInactive?: boolean }
): Promise<ProductWithStats[]> {
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    price: number;
    is_active: number;
    barcode: string | null;
    recipe_count: number;
  }>(
    `SELECT p.id, p.name, p.price, p.is_active, p.barcode, COUNT(r.id) AS recipe_count
     FROM products p
     LEFT JOIN recipes r ON r.product_id = p.id
     ${opts?.includeInactive ? '' : 'WHERE p.is_active = 1'}
     GROUP BY p.id
     ORDER BY p.name COLLATE NOCASE`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    price: r.price,
    is_active: r.is_active === 1,
    barcode: r.barcode ?? null,
    recipe_count: r.recipe_count,
  }));
}

export async function getProductByBarcode(db: DBLike, barcode: string): Promise<Product | null> {
  const row = await db.getFirstAsync<{ id: number; name: string; price: number; is_active: number; barcode: string | null }>(
    'SELECT id, name, price, is_active, barcode FROM products WHERE barcode = ? AND is_active = 1 LIMIT 1',
    barcode
  );
  return mapProductRow(row);
}

export async function getProduct(db: DBLike, id: number): Promise<Product | null> {
  const row = await db.getFirstAsync<{ id: number; name: string; price: number; is_active: number; barcode: string | null }>(
    'SELECT id, name, price, is_active, barcode FROM products WHERE id = ?',
    id
  );
  return mapProductRow(row);
}

export async function getProductWithRecipes(db: DBLike, id: number): Promise<ProductWithRecipes | null> {
  const product = await getProduct(db, id);
  if (!product) return null;
  const recipes = await db.getAllAsync<RecipeLine & { ingredient_name: string; unit: string }>(
    `SELECT r.ingredient_id, r.quantity_required, i.name AS ingredient_name, i.unit
     FROM recipes r
     JOIN ingredients i ON i.id = r.ingredient_id
     WHERE r.product_id = ?
     ORDER BY i.name COLLATE NOCASE`,
    id
  );
  return { ...product, recipes };
}

export function normalizeBarcode(barcode: string | null | undefined): string | null {
  const trimmed = barcode?.trim();
  return trimmed ? trimmed : null;
}

export async function createProduct(db: SQLiteDatabase, input: SaveProductInput): Promise<number> {
  let productId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      'INSERT INTO products (name, price, is_active, barcode) VALUES (?, ?, ?, ?)',
      input.name.trim(),
      input.price,
      input.is_active ? 1 : 0,
      normalizeBarcode(input.barcode ?? null)
    );
    productId = result.lastInsertRowId;
    await insertRecipes(txn, productId, input.recipes);
  });
  return productId;
}

export async function updateProduct(db: SQLiteDatabase, id: number, input: SaveProductInput): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'UPDATE products SET name = ?, price = ?, is_active = ?, barcode = ? WHERE id = ?',
      input.name.trim(),
      input.price,
      input.is_active ? 1 : 0,
      normalizeBarcode(input.barcode ?? null),
      id
    );
    await txn.runAsync('DELETE FROM recipes WHERE product_id = ?', id);
    await insertRecipes(txn, id, input.recipes);
  });
}

export async function deleteProduct(db: DBLike, id: number): Promise<void> {
  await db.runAsync('DELETE FROM products WHERE id = ?', id);
}

function insertRecipes(txn: DBLike, productId: number, recipes: RecipeLine[]): Promise<void> {
  return recipes.reduce(async (chain, recipe) => {
    await chain;
    await txn.runAsync(
      'INSERT INTO recipes (product_id, ingredient_id, quantity_required) VALUES (?, ?, ?)',
      productId,
      recipe.ingredient_id,
      recipe.quantity_required
    );
  }, Promise.resolve());
}