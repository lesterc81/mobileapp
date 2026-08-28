import type { DBLike, StockMovementRow } from './types';

export type StockMovementWithUser = StockMovementRow & { ingredient_name: string; user_name: string | null };

export async function listStockMovements(
  db: DBLike,
  opts: { ingredientId?: number; limit?: number } = {}
): Promise<StockMovementWithUser[]> {
  const where: string[] = [];
  const params: number[] = [];
  if (opts.ingredientId !== undefined) {
    where.push('m.ingredient_id = ?');
    params.push(opts.ingredientId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limitSql = opts.limit ? `LIMIT ${opts.limit}` : '';
  return db.getAllAsync<StockMovementWithUser>(
    `SELECT m.id, m.ingredient_id, m.change_amount, m.reason, m.timestamp, m.related_sale_id, m.user_id,
            i.name AS ingredient_name, u.name AS user_name
     FROM stock_movements m
     JOIN ingredients i ON i.id = m.ingredient_id
     LEFT JOIN users u ON u.id = m.user_id
     ${whereSql}
     ORDER BY m.timestamp DESC, m.id DESC
     ${limitSql}`,
    params
  );
}