import type { DBLike, Ingredient } from './types';

export type NewIngredient = Omit<Ingredient, 'id'>;
export type IngredientPatch = Partial<
  Pick<Ingredient, 'name' | 'unit' | 'low_stock_threshold' | 'units_per_pack' | 'pack_name'>
>;

export const INGREDIENT_COLUMNS = 'id, name, unit, quantity_on_hand, low_stock_threshold, units_per_pack, pack_name';

export async function listIngredients(db: DBLike): Promise<Ingredient[]> {
  return db.getAllAsync<Ingredient>(
    `SELECT ${INGREDIENT_COLUMNS} FROM ingredients ORDER BY name COLLATE NOCASE`
  );
}

export async function getIngredient(db: DBLike, id: number): Promise<Ingredient | null> {
  return db.getFirstAsync<Ingredient>(`SELECT ${INGREDIENT_COLUMNS} FROM ingredients WHERE id = ?`, id);
}

export async function createIngredient(db: DBLike, data: NewIngredient): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO ingredients (name, unit, quantity_on_hand, low_stock_threshold, units_per_pack, pack_name) VALUES (?, ?, ?, ?, ?, ?)`,
    data.name.trim(),
    data.unit.trim() || 'pcs',
    data.quantity_on_hand,
    data.low_stock_threshold,
    data.units_per_pack,
    data.pack_name?.trim() || 'pack'
  );
  return result.lastInsertRowId;
}

export async function updateIngredient(db: DBLike, id: number, patch: IngredientPatch): Promise<void> {
  if (patch.name !== undefined) {
    await db.runAsync('UPDATE ingredients SET name = ? WHERE id = ?', patch.name.trim(), id);
  }
  if (patch.unit !== undefined) {
    await db.runAsync('UPDATE ingredients SET unit = ? WHERE id = ?', patch.unit.trim() || 'pcs', id);
  }
  if (patch.low_stock_threshold !== undefined) {
    await db.runAsync('UPDATE ingredients SET low_stock_threshold = ? WHERE id = ?', patch.low_stock_threshold, id);
  }
  if (patch.units_per_pack !== undefined) {
    await db.runAsync('UPDATE ingredients SET units_per_pack = ? WHERE id = ?', patch.units_per_pack, id);
  }
  if (patch.pack_name !== undefined) {
    await db.runAsync('UPDATE ingredients SET pack_name = ? WHERE id = ?', patch.pack_name?.trim() || 'pack', id);
  }
}

export async function deleteIngredient(db: DBLike, id: number): Promise<void> {
  await db.runAsync('DELETE FROM ingredients WHERE id = ?', id);
}

export interface StockAdjustment {
  change_amount: number;
  reason: string;
  related_sale_id?: number | null;
}

/**
 * Applies a signed change to an ingredient's on-hand quantity and logs a
 * stock_movement row. Throws if the result would go below zero.
 * Safe to call both standalone and inside sellProducts' transaction.
 */
export async function adjustIngredient(
  db: DBLike,
  ingredientId: number,
  adjustment: StockAdjustment,
  opts: { userId?: number | null } = {}
): Promise<void> {
  if (adjustment.change_amount === 0) {
    throw new Error('Stock adjustment cannot be zero');
  }
  const ingredient = await db.getFirstAsync<{ name: string; quantity_on_hand: number }>(
    'SELECT name, quantity_on_hand FROM ingredients WHERE id = ?',
    ingredientId
  );
  if (!ingredient) {
    throw new Error(`Ingredient ${ingredientId} not found`);
  }
  const newQty = ingredient.quantity_on_hand + adjustment.change_amount;
  if (newQty < 0) {
    throw new Error(
      `Cannot adjust "${ingredient.name}" below zero (on hand: ${ingredient.quantity_on_hand}, change: ${adjustment.change_amount})`
    );
  }
  await db.runAsync('UPDATE ingredients SET quantity_on_hand = ? WHERE id = ?', newQty, ingredientId);
  await db.runAsync(
    `INSERT INTO stock_movements (ingredient_id, change_amount, reason, timestamp, related_sale_id, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ingredientId,
    adjustment.change_amount,
    adjustment.reason,
    new Date().toISOString(),
    adjustment.related_sale_id ?? null,
    opts.userId ?? null
  );
}