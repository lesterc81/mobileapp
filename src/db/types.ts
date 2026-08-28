import type { SQLiteDatabase } from 'expo-sqlite';

export type DBLike = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  units_per_pack: number | null;
  pack_name: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  is_active: boolean;
  barcode: string | null;
}

export interface RecipeLine {
  ingredient_id: number;
  quantity_required: number;
}

export interface ProductWithRecipes extends Product {
  recipes: (RecipeLine & { ingredient_name: string; unit: string })[];
}

export interface SaleRow {
  id: number;
  product_id: number;
  quantity_sold: number;
  total_price: number;
  timestamp: string;
  user_id: number | null;
}

export interface SaleWithProduct extends SaleRow {
  product_name: string;
  user_name: string | null;
}

export interface StockMovementRow {
  id: number;
  ingredient_id: number;
  change_amount: number;
  reason: string;
  timestamp: string;
  related_sale_id: number | null;
  user_id: number | null;
}

export interface User {
  id: number;
  name: string;
  created_at: string;
}

export interface CartItem {
  productId: number;
  quantity: number;
}

export interface StockRequirement {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  quantityOnHand: number;
  required: number;
}

export interface SaleResult {
  grandTotal: number;
  saleIds: number[];
}