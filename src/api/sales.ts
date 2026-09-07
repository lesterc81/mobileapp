import { supabase } from '../lib/supabase';
import type { Json } from '../lib/database.types';
import type { Receipt, SaleItem, SaleWithDetails } from './types';

export interface CartEntry {
  product_id: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

export async function sellProducts(
  branchId: string | null,
  paymentMethod: string,
  cart: { productId: string; quantity: number }[]
): Promise<{ saleId: string; total: number }> {
  if (!branchId) throw new Error('Branch required for sale');
  if (cart.length === 0) throw new Error('Cart is empty');

  const items: CartEntry[] = cart.map((c) => ({
    product_id: c.productId,
    quantity: c.quantity,
  }));

  const { data, error } = await supabase.rpc('sell_products', {
    p_branch_id: branchId,
    p_payment_method: paymentMethod,
    p_items: items as unknown as Json,
  });
  if (error) {
    if (/need .* have|inactive|quantity must/i.test(error.message)) {
      throw new InsufficientStockError(error.message);
    }
    throw error;
  }

  const parsed = data as unknown as { sale_id?: string; total?: number };
  return { saleId: parsed?.sale_id ?? '', total: parsed?.total ?? 0 };
}

export async function listSales(opts: {
  from?: string;
  to?: string;
  branchId?: string | null;
  limit?: number;
}): Promise<SaleWithDetails[]> {
  let query = supabase
    .from('sales')
    .select('*, branches(name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.from) query = query.gte('created_at', opts.from);
  if (opts.to) query = query.lte('created_at', opts.to);
  if (opts.branchId) query = query.eq('branch_id', opts.branchId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((s) => ({
    id: s.id,
    branch_id: s.branch_id,
    user_id: s.user_id,
    payment_method: s.payment_method,
    total: s.total,
    created_at: s.created_at,
    branch_name: (s.branches as { name?: string } | null)?.name ?? null,
    user_name: (s.profiles as { full_name?: string } | null)?.full_name ?? null,
  }));
}

export async function listSaleItems(saleIds: string[]): Promise<SaleItem[]> {
  if (saleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('sale_items')
    .select('*')
    .in('sale_id', saleIds)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export interface SalesSummary {
  total_revenue: number;
  sale_rows: number;
  units_sold: number;
}

export async function getSalesSummary(opts: {
  from?: string;
  to?: string;
  branchId?: string | null;
}): Promise<SalesSummary> {
  const sales = await listSales({ ...opts, limit: 10000 });
  const ids = sales.map((s) => s.id);
  const items = await listSaleItems(ids);

  const total_revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const units_sold = items.reduce((sum, i) => sum + i.quantity_sold, 0);
  return { total_revenue, sale_rows: sales.length, units_sold };
}

/** Build a printable receipt for a completed sale. */
export async function getReceipt(saleId: string): Promise<Receipt | null> {
  const { data: sale, error } = await supabase
    .from('sales')
    .select('*, branches(name, address), profiles(full_name)')
    .eq('id', saleId)
    .single();
  if (error || !sale) return null;

  const { data: items, error: iErr } = await supabase
    .from('sale_items')
    .select('*')
    .eq('sale_id', saleId)
    .order('created_at');
  if (iErr) throw iErr;

  return {
    sale_id: sale.id,
    branch_name: (sale.branches as { name?: string } | null)?.name ?? '',
    branch_address: (sale.branches as { address?: string } | null)?.address ?? '',
    cashier_name: (sale.profiles as { full_name?: string } | null)?.full_name ?? '',
    payment_method: sale.payment_method,
    total: sale.total,
    created_at: sale.created_at,
    items: (items ?? []).map((i) => ({
      product_name: i.product_name,
      quantity_sold: i.quantity_sold,
      unit_price: i.unit_price,
      total_price: i.total_price,
    })),
  };
}