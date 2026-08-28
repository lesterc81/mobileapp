import type { SQLiteDatabase } from 'expo-sqlite';
import type { CartItem, DBLike, SaleResult, SaleWithProduct, StockRequirement } from './types';

export class InsufficientStockError extends Error {
  constructor(public readonly shortages: StockRequirement[]) {
    super(
      shortages
        .map(
          (s) =>
            `${s.ingredientName}: need ${formatQty(s.required)}${s.unit}, have ${formatQty(s.quantityOnHand)}${s.unit}`
        )
        .join('\n')
    );
    this.name = 'InsufficientStockError';
  }
}

function formatQty(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Completes a sale atomically:
 *  1. Validates every cart product exists and is active.
 *  2. Aggregates ingredient requirements ACROSS all cart items.
 *  3. Validates all stock levels and throws InsufficientStockError before any write.
 *  4. Inserts sales rows, deducts stock per recipe, logs stock_movements — in one transaction.
 */
export async function sellProducts(
  db: SQLiteDatabase,
  cart: CartItem[],
  opts: { userId?: number | null } = {}
): Promise<SaleResult> {
  if (cart.length === 0) {
    throw new Error('Cart is empty');
  }

  const now = new Date().toISOString();
  const result: SaleResult = { grandTotal: 0, saleIds: [] };

  await db.withExclusiveTransactionAsync(async (txn) => {
    const requirements = new Map<number, StockRequirement>();

    for (const item of cart) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error('Sale quantity must be a positive whole number');
      }
      const product = await txn.getFirstAsync<{ name: string; price: number; is_active: number }>(
        'SELECT name, price, is_active FROM products WHERE id = ?',
        item.productId
      );
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.is_active !== 1) throw new Error(`"${product.name}" is inactive and cannot be sold`);

      const recipes = await txn.getAllAsync<{ ingredient_id: number; quantity_required: number }>(
        'SELECT ingredient_id, quantity_required FROM recipes WHERE product_id = ?',
        item.productId
      );

      for (const recipe of recipes) {
        const needed = recipe.quantity_required * item.quantity;
        const existing = requirements.get(recipe.ingredient_id);
        if (existing) {
          existing.required += needed;
        } else {
          requirements.set(recipe.ingredient_id, {
            ingredientId: recipe.ingredient_id,
            ingredientName: '',
            unit: '',
            quantityOnHand: 0,
            required: needed,
          });
        }
      }
    }

    const shortages: StockRequirement[] = [];
    for (const req of requirements.values()) {
      const ingredient = await txn.getFirstAsync<{ name: string; unit: string; quantity_on_hand: number }>(
        'SELECT name, unit, quantity_on_hand FROM ingredients WHERE id = ?',
        req.ingredientId
      );
      if (!ingredient) throw new Error(`Ingredient ${req.ingredientId} not found`);
      req.ingredientName = ingredient.name;
      req.unit = ingredient.unit;
      req.quantityOnHand = ingredient.quantity_on_hand;
      if (ingredient.quantity_on_hand < req.required - 1e-9) {
        shortages.push(req);
      }
    }
    if (shortages.length > 0) {
      throw new InsufficientStockError(shortages);
    }

    for (const item of cart) {
      const product = await txn.getFirstAsync<{ name: string; price: number }>(
        'SELECT name, price FROM products WHERE id = ?',
        item.productId
      );
      if (!product) throw new Error(`Product ${item.productId} not found`);
      const total = Math.round(product.price * item.quantity * 100) / 100;
      result.grandTotal = Math.round((result.grandTotal + total) * 100) / 100;

      const saleResult = await txn.runAsync(
        'INSERT INTO sales (product_id, quantity_sold, total_price, timestamp, user_id) VALUES (?, ?, ?, ?, ?)',
        item.productId,
        item.quantity,
        total,
        now,
        opts.userId ?? null
      );
      const saleId = saleResult.lastInsertRowId;
      result.saleIds.push(saleId);

      const recipes = await txn.getAllAsync<{ ingredient_id: number; quantity_required: number }>(
        'SELECT ingredient_id, quantity_required FROM recipes WHERE product_id = ?',
        item.productId
      );
      for (const recipe of recipes) {
        const change = -(recipe.quantity_required * item.quantity);
        await txn.runAsync(
          'UPDATE ingredients SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?',
          change,
          recipe.ingredient_id
        );
        await txn.runAsync(
          'INSERT INTO stock_movements (ingredient_id, change_amount, reason, timestamp, related_sale_id, user_id) VALUES (?, ?, ?, ?, ?, ?)',
          recipe.ingredient_id,
          change,
          'sale',
          now,
          saleId,
          opts.userId ?? null
        );
      }
    }
  });

  return result;
}

export interface SalesFilter {
  from?: string;
  to?: string;
  limit?: number;
}

export async function listSales(db: DBLike, opts: SalesFilter = {}): Promise<SaleWithProduct[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.from) {
    where.push('s.timestamp >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('s.timestamp <= ?');
    params.push(opts.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitSql = opts.limit ? `LIMIT ${opts.limit}` : '';
  return db.getAllAsync<SaleWithProduct>(
    `SELECT s.id, s.product_id, s.quantity_sold, s.total_price, s.timestamp, s.user_id,
            p.name AS product_name, u.name AS user_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     LEFT JOIN users u ON u.id = s.user_id
     ${whereSql}
     ORDER BY s.timestamp DESC, s.id DESC
     ${limitSql}`,
    params
  );
}

export interface SalesSummary {
  total_revenue: number;
  sale_rows: number;
  units_sold: number;
}

export async function countProductSales(db: DBLike, productId: number): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM sales WHERE product_id = ?',
    productId
  );
  return row?.c ?? 0;
}

export async function getSalesSummary(db: DBLike, opts: SalesFilter = {}): Promise<SalesSummary> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.from) {
    where.push('timestamp >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('timestamp <= ?');
    params.push(opts.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = await db.getFirstAsync<{
    total_revenue: number | null;
    sale_rows: number;
    units_sold: number | null;
  }>(
    `SELECT COALESCE(SUM(total_price), 0) AS total_revenue,
            COUNT(*) AS sale_rows,
            COALESCE(SUM(quantity_sold), 0) AS units_sold
     FROM sales ${whereSql}`,
    params
  );
  return {
    total_revenue: row?.total_revenue ?? 0,
    sale_rows: row?.sale_rows ?? 0,
    units_sold: row?.units_sold ?? 0,
  };
}