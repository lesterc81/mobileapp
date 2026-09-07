import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '../lib/supabase';

export interface ImportReport {
  branches: number;
  ingredients: number;
  products: number;
  recipes: number;
  sales: number;
  movements: number;
}

interface LegacyIngredient {
  id: number;
  name: string;
  unit: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  units_per_pack: number | null;
  pack_name: string;
}

interface LegacyProduct {
  id: number;
  name: string;
  price: number;
  is_active: number;
}

interface LegacyRecipe {
  product_id: number;
  ingredient_id: number;
  quantity_required: number;
}

interface LegacySale {
  id: number;
  product_id: number;
  quantity_sold: number;
  total_price: number;
  timestamp: string;
  user_id: number | null;
}

interface LegacyMovement {
  id: number;
  ingredient_id: number;
  change_amount: number;
  reason: string;
  timestamp: string;
  related_sale_id: number | null;
  user_id: number | null;
}

/**
 * One-time migration from the legacy single-branch SQLite app into the
 * cloud multi-branch schema. Must run while signed in as the owner so RLS
 * allows the inserts. Every legacy sale row becomes its own sale (line items
 * map 1:1). Stock movements are imported with id mapping where possible.
 */
export async function importLegacyData(userId: string): Promise<ImportReport> {
  const db = await openDatabaseAsync('inventory-pos.db');

  const [ingredients, products, recipeRows, saleRows, movementRows] = await Promise.all([
    readAll<LegacyIngredient>(db, 'ingredients'),
    readAll<LegacyProduct>(db, 'products'),
    readAll<LegacyRecipe>(db, 'recipes'),
    readAll<LegacySale>(db, 'sales'),
    readAll<LegacyMovement>(db, 'stock_movements'),
  ]);

  // --- branch ---
  const { data: branches, error: bErr } = await supabase.from('branches').select('id').limit(1);
  if (bErr) throw bErr;
  let branchId: string;
  if (branches && branches.length > 0) {
    branchId = branches[0].id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from('branches')
      .insert({ name: 'Main Branch', address: '' })
      .select('id')
      .single();
    if (cErr) throw cErr;
    branchId = created.id;
  }

  // --- ingredients ---
  const ingredientIdMap = new Map<number, string>();
  for (const ing of ingredients) {
    const { data: existing, error: qErr } = await supabase
      .from('ingredients')
      .select('id')
      .eq('name', ing.name)
      .maybeSingle();
    if (qErr) throw qErr;
    let id = existing?.id ?? null;
    if (!id) {
      const { data: created, error: cErr } = await supabase
        .from('ingredients')
        .insert({
          name: ing.name,
          unit: ing.unit || 'pcs',
          units_per_pack: ing.units_per_pack ?? null,
          pack_name: ing.pack_name || 'pack',
        })
        .select('id')
        .single();
      if (cErr) throw cErr;
      id = created.id;
    }
    ingredientIdMap.set(ing.id, id);

    const { error: sErr } = await supabase.from('ingredient_stock').upsert(
      {
        ingredient_id: id,
        branch_id: branchId,
        quantity_on_hand: ing.quantity_on_hand ?? 0,
        low_stock_threshold: ing.low_stock_threshold ?? 0,
      },
      { onConflict: 'ingredient_id,branch_id' }
    );
    if (sErr) throw sErr;
  }

  // --- products ---
  const productIdMap = new Map<number, string>();
  for (const p of products) {
    const { data: existing, error: qErr } = await supabase
      .from('products')
      .select('id')
      .eq('name', p.name)
      .maybeSingle();
    if (qErr) throw qErr;
    let id = existing?.id ?? null;
    if (!id) {
      const { data: created, error: cErr } = await supabase
        .from('products')
        .insert({
          name: p.name,
          price: p.price ?? 0,
          category: '',
          barcode: null,
          is_active: p.is_active === 0 ? false : true,
        })
        .select('id')
        .single();
      if (cErr) throw cErr;
      id = created.id;
    }
    productIdMap.set(p.id, id);
  }

  // --- recipes ---
  for (const r of recipeRows) {
    const pid = productIdMap.get(r.product_id);
    const iid = ingredientIdMap.get(r.ingredient_id);
    if (!pid || !iid) continue;
    const { error: rErr } = await supabase
      .from('recipes')
      .upsert(
        { product_id: pid, ingredient_id: iid, quantity_required: r.quantity_required },
        { onConflict: 'product_id,ingredient_id' }
      );
    if (rErr) throw rErr;
  }

  // --- sales (each legacy row = one sale with one line) ---
  const saleIdMap = new Map<number, string>();
  for (const s of saleRows) {
    const pid = productIdMap.get(s.product_id);
    if (!pid) continue;
    const { data, error: cErr } = await supabase
      .from('sales')
      .insert({
        branch_id: branchId,
        user_id: userId,
        payment_method: 'cash',
        total: s.total_price ?? 0,
        created_at: parseDate(s.timestamp),
      })
      .select('id')
      .single();
    if (cErr) throw cErr;
    saleIdMap.set(s.id, data.id);

    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('name, price')
      .eq('id', pid)
      .single();
    if (pErr) throw pErr;

    const { error: iErr } = await supabase.from('sale_items').insert({
      sale_id: data.id,
      product_id: pid,
      product_name: prod.name,
      quantity_sold: s.quantity_sold,
      unit_price: prod.price,
      total_price: s.total_price ?? 0,
      created_at: parseDate(s.timestamp),
    });
    if (iErr) throw iErr;
  }

  // --- stock movements (best-effort, id-mapped) ---
  for (const m of movementRows) {
    const iid = ingredientIdMap.get(m.ingredient_id);
    if (!iid) continue;
    const { error: mErr } = await supabase.from('stock_movements').insert({
      ingredient_id: iid,
      branch_id: branchId,
      change_amount: m.change_amount,
      reason: m.reason || 'import',
      timestamp: parseDate(m.timestamp),
      related_sale_id: m.related_sale_id ? (saleIdMap.get(m.related_sale_id) ?? null) : null,
      user_id: userId,
    });
    if (mErr) throw mErr;
  }

  await db.closeAsync();

  return {
    branches: 1,
    ingredients: ingredientIdMap.size,
    products: productIdMap.size,
    recipes: recipeRows.length,
    sales: saleIdMap.size,
    movements: movementRows.length,
  };
}

async function readAll<T>(db: SQLiteDatabase, table: string): Promise<T[]> {
  try {
    const result = await db.getAllAsync<T>(`SELECT * FROM ${table}`);
    return result ?? [];
  } catch {
    return [];
  }
}

function parseDate(value: string | null): string {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}