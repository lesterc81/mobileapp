import { supabase } from '../lib/supabase';
import type { Ingredient, IngredientStock } from './types';

export type { Ingredient, IngredientStock } from './types';

export async function listIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabase.from('ingredients').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listIngredientStock(branchId: string | null): Promise<IngredientStock[]> {
  if (!branchId) return [];
  const { data: stock, error } = await supabase
    .from('ingredient_stock')
    .select('ingredient_id, quantity_on_hand, low_stock_threshold, ingredients(*)')
    .eq('branch_id', branchId);
  if (error) throw error;

  return (stock ?? []).map((row) => {
    const ing = row.ingredients as Ingredient | null;
    return {
      id: row.ingredient_id,
      name: ing?.name ?? 'Unknown',
      unit: ing?.unit ?? 'pcs',
      units_per_pack: ing?.units_per_pack ?? null,
      pack_name: ing?.pack_name ?? 'pack',
      created_at: ing?.created_at ?? '',
      quantity_on_hand: row.quantity_on_hand,
      low_stock_threshold: row.low_stock_threshold,
    };
  });
}

export async function getIngredientStock(branchId: string | null): Promise<IngredientStock[]> {
  return listIngredientStock(branchId);
}

export async function createIngredient(data: {
  name: string;
  unit: string;
  units_per_pack: number | null;
  pack_name: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  branchId: string | null;
  userId: string;
}): Promise<void> {
  const { data: ing, error } = await supabase
    .from('ingredients')
    .insert({
      name: data.name.trim(),
      unit: data.unit.trim() || 'pcs',
      units_per_pack: data.units_per_pack,
      pack_name: data.pack_name.trim() || 'pack',
    })
    .select('id')
    .single();
  if (error) throw error;

  if (data.branchId) {
    const { error: stockErr } = await supabase.from('ingredient_stock').insert({
      ingredient_id: ing.id,
      branch_id: data.branchId,
      quantity_on_hand: data.quantity_on_hand,
      low_stock_threshold: data.low_stock_threshold,
    });
    if (stockErr) throw stockErr;

    if (data.quantity_on_hand > 0) {
      const { error: mErr } = await supabase.from('stock_movements').insert({
        ingredient_id: ing.id,
        branch_id: data.branchId,
        change_amount: data.quantity_on_hand,
        reason: 'initial_stock',
        user_id: data.userId,
      });
      if (mErr) throw mErr;
    }
  }
}

/** Create an ingredient + stock row per branch for a many-packs receipt. */
export async function createIngredientWithPacks(data: {
  name: string;
  unit: string;
  units_per_pack: number | null;
  pack_name: string;
  totalQuantity: number;
  low_stock_threshold: number;
  branchId: string | null;
  userId: string;
}): Promise<void> {
  await createIngredient({ ...data, quantity_on_hand: data.totalQuantity });
}

export async function updateIngredient(
  id: string,
  patch: Partial<Pick<Ingredient, 'name' | 'unit' | 'units_per_pack' | 'pack_name'>>
): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .update({
      ...patch,
      name: patch.name?.trim(),
      unit: patch.unit?.trim() || undefined,
      pack_name: patch.pack_name?.trim() || undefined,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function updateIngredientStock(
  id: string,
  branchId: string,
  patch: { quantity_on_hand?: number; low_stock_threshold?: number }
): Promise<void> {
  const { error } = await supabase
    .from('ingredient_stock')
    .update(patch)
    .eq('ingredient_id', id)
    .eq('branch_id', branchId);
  if (error) throw error;
}

export async function deleteIngredient(id: string): Promise<void> {
  // stock rows + movements cascade via FK
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw error;
}

export async function listStockMovements(branchId: string | null, opts?: { ingredientId?: string; limit?: number }): Promise<
  { id: number; ingredient_name: string; change_amount: number; reason: string; timestamp: string; user_name: string | null }[]
> {
  let query = supabase
    .from('stock_movements')
    .select('*, ingredients(name), profiles(full_name)')
    .order('timestamp', { ascending: false })
    .limit(opts?.limit ?? 200);

  if (branchId) query = query.eq('branch_id', branchId);
  if (opts?.ingredientId) query = query.eq('ingredient_id', opts.ingredientId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    ingredient_name: (m.ingredients as { name?: string } | null)?.name ?? 'Unknown',
    change_amount: m.change_amount,
    reason: m.reason,
    timestamp: m.timestamp,
    user_name: (m.profiles as { full_name?: string } | null)?.full_name ?? null,
  }));
}

export interface StockAdjustment {
  change_amount: number;
  reason: string;
}

/** Adjust stock for a single branch ingredient with a movement log. */
export async function adjustIngredient(
  ingredientId: string,
  branchId: string | null,
  adjustment: StockAdjustment,
  opts: { userId?: string | null } = {}
): Promise<void> {
  if (!branchId) throw new Error('Branch required to adjust stock');
  if (adjustment.change_amount === 0) throw new Error('Stock adjustment cannot be zero');

  const { data: row, error: gErr } = await supabase
    .from('ingredient_stock')
    .select('quantity_on_hand, ingredients(name)')
    .eq('ingredient_id', ingredientId)
    .eq('branch_id', branchId)
    .single();
  if (gErr) throw gErr;

  const onHand = row.quantity_on_hand;
  const newQty = onHand + adjustment.change_amount;
  if (newQty < 0) {
    const name = (row.ingredients as { name?: string } | null)?.name ?? 'Ingredient';
    throw new Error(
      `Cannot adjust "${name}" below zero (on hand: ${onHand}, change: ${adjustment.change_amount})`
    );
  }

  const { error: uErr } = await supabase
    .from('ingredient_stock')
    .update({ quantity_on_hand: newQty })
    .eq('ingredient_id', ingredientId)
    .eq('branch_id', branchId);
  if (uErr) throw uErr;

  const { error: mErr } = await supabase.from('stock_movements').insert({
    ingredient_id: ingredientId,
    branch_id: branchId,
    change_amount: adjustment.change_amount,
    reason: adjustment.reason,
    user_id: opts.userId ?? null,
  });
  if (mErr) throw mErr;
}