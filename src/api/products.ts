import { supabase } from '../lib/supabase';
import type { Product, ProductWithRecipes, ProductWithStock, RecipeLine } from './types';
import { getIngredientStock } from './inventory';

export interface SaveProductInput {
  name: string;
  price: number;
  category: string;
  is_active: boolean;
  barcode?: string | null;
  recipes: RecipeLine[];
}

export async function listProducts(opts?: { includeInactive?: boolean }): Promise<Product[]> {
  let query = supabase.from('products').select('*').order('name');
  if (!opts?.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listProductsWithStats(opts?: { includeInactive?: boolean }): Promise<
  (Product & { recipe_count: number })[]
> {
  let query = supabase.from('products').select('*').order('name');
  if (!opts?.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;

  const { data: recipeRows, error: rErr } = await supabase.from('recipes').select('product_id');
  if (rErr) throw rErr;

  const countByProduct = new Map<string, number>();
  for (const r of recipeRows ?? []) {
    countByProduct.set(r.product_id, (countByProduct.get(r.product_id) ?? 0) + 1);
  }

  return (data ?? []).map((r) => ({
    ...r,
    recipe_count: countByProduct.get(r.id) ?? 0,
  }));
}

/** Active products plus the first ingredient too low to make one unit (null if OK). */
export async function listProductsWithStock(branchId: string | null): Promise<ProductWithStock[]> {
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (pErr) throw pErr;

  const stock = await getIngredientStock(branchId);
  const stockMap = new Map(stock.map((s) => [s.id, s]));

  const { data: recipes, error: rErr } = await supabase.from('recipes').select('*');
  if (rErr) throw rErr;

  const byProduct = new Map<string, { ingredient_id: string; quantity_required: number }[]>();
  for (const r of recipes ?? []) {
    const arr = byProduct.get(r.product_id) ?? [];
    arr.push(r);
    byProduct.set(r.product_id, arr);
  }

  const { data: ingredients, error: iErr } = await supabase.from('ingredients').select('id, name, unit');
  if (iErr) throw iErr;
  const ingName = new Map((ingredients ?? []).map((i) => [i.id, i.name]));

  return (products ?? []).map((p) => {
    const recipeLines = byProduct.get(p.id) ?? [];
    let firstShort: string | null = null;
    for (const line of recipeLines) {
      const s = stockMap.get(line.ingredient_id);
      const onHand = s?.quantity_on_hand ?? 0;
      if (onHand < line.quantity_required - 1e-9) {
        firstShort = ingName.get(line.ingredient_id) ?? 'ingredient';
        break;
      }
    }
    return { ...p, first_short: firstShort };
  });
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    // barcode unique index rejects non-unique; just treat as not found
    return null;
  }
  return data;
}

export async function getProductWithRecipes(id: string): Promise<ProductWithRecipes | null> {
  const { data: product, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error || !product) throw error ?? new Error('Product not found');

  const { data: recipes, error: rErr } = await supabase
    .from('recipes')
    .select('ingredient_id, quantity_required, ingredients(name, unit)')
    .eq('product_id', id);
  if (rErr) throw rErr;

  return {
    ...product,
    recipes: (recipes ?? []).map((r) => ({
      ingredient_id: r.ingredient_id,
      quantity_required: r.quantity_required,
      ingredient_name: r.ingredients?.name ?? '?',
      unit: r.ingredients?.unit ?? '',
    })),
  };
}

export function normalizeBarcode(barcode: string | null | undefined): string | null {
  const trimmed = barcode?.trim();
  return trimmed ? trimmed : null;
}

export async function createProduct(input: SaveProductInput): Promise<string> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: input.name.trim(),
      price: input.price,
      category: input.category,
      is_active: input.is_active,
      barcode: normalizeBarcode(input.barcode ?? null),
    })
    .select('id')
    .single();
  if (error) throw error;
  await upsertRecipes(data.id, input.recipes);
  return data.id;
}

export async function updateProduct(id: string, input: SaveProductInput): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      name: input.name.trim(),
      price: input.price,
      category: input.category,
      is_active: input.is_active,
      barcode: normalizeBarcode(input.barcode ?? null),
    })
    .eq('id', id);
  if (error) throw error;
  await upsertRecipes(id, input.recipes);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function countProductSales(productId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sale_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);
  if (error) throw error;
  return count ?? 0;
}

async function upsertRecipes(productId: string, recipes: RecipeLine[]): Promise<void> {
  await supabase.from('recipes').delete().eq('product_id', productId);

  if (recipes.length === 0) return;

  const rows = recipes.map((r) => ({
    product_id: productId,
    ingredient_id: r.ingredient_id,
    quantity_required: r.quantity_required,
  }));
  const { error } = await supabase.from('recipes').insert(rows);
  if (error) throw error;
}