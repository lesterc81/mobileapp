import type { SQLiteDatabase } from 'expo-sqlite';
import { createIngredient } from './ingredients';
import { createProduct } from './products';

/**
 * Seeds a small demo dataset on first launch (when there are no ingredients).
 * Call from App root after migrations. Safe to call on every boot — no-ops
 * once data exists.
 */
export async function seedIfEmpty(db: SQLiteDatabase): Promise<boolean> {
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM ingredients');
  if ((count?.c ?? 0) > 0) return false;

  const bread = await createIngredient(db, { name: 'Bread', unit: 'slices', quantity_on_hand: 40, low_stock_threshold: 10, units_per_pack: 12, pack_name: 'loaf' });
  const peanutButter = await createIngredient(db, { name: 'Peanut Butter', unit: 'g', quantity_on_hand: 1500, low_stock_threshold: 300, units_per_pack: null, pack_name: 'pack' });
  const cup = await createIngredient(db, { name: 'Cup', unit: 'pcs', quantity_on_hand: 60, low_stock_threshold: 15, units_per_pack: 25, pack_name: 'pack' });
  const jelly = await createIngredient(db, { name: 'Jelly', unit: 'g', quantity_on_hand: 900, low_stock_threshold: 200, units_per_pack: null, pack_name: 'pack' });

  await createProduct(db, {
    name: 'Peanut Butter Bread',
    price: 3.5,
    is_active: true,
    recipes: [
      { ingredient_id: bread, quantity_required: 1 },
      { ingredient_id: peanutButter, quantity_required: 30 },
      { ingredient_id: cup, quantity_required: 1 },
    ],
  });

  await createProduct(db, {
    name: 'PB&J Bread',
    price: 4.25,
    is_active: true,
    recipes: [
      { ingredient_id: bread, quantity_required: 2 },
      { ingredient_id: peanutButter, quantity_required: 25 },
      { ingredient_id: jelly, quantity_required: 20 },
      { ingredient_id: cup, quantity_required: 1 },
    ],
  });

  return true;
}