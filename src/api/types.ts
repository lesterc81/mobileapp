export type Role = 'owner' | 'manager' | 'cashier';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  branch_id: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  units_per_pack: number | null;
  pack_name: string;
  created_at: string;
}

export interface IngredientStock extends Ingredient {
  quantity_on_hand: number;
  low_stock_threshold: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RecipeLine {
  ingredient_id: string;
  quantity_required: number;
}

export interface ProductWithRecipes extends Product {
  recipes: (RecipeLine & { ingredient_name: string; unit: string })[];
}

export interface ProductWithStock extends Product {
  first_short: string | null;
}

export interface SaleRow {
  id: string;
  branch_id: string;
  user_id: string;
  payment_method: string;
  total: number;
  created_at: string;
}

export interface SaleWithDetails extends SaleRow {
  branch_name: string | null;
  user_name: string | null;
  items?: SaleItem[];
}

export interface SaleItem {
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity_sold: number;
  unit_price: number;
  total_price: number;
}

export interface StockMovement {
  id: number;
  ingredient_id: string;
  branch_id: string;
  change_amount: number;
  reason: string;
  timestamp: string;
  related_sale_id: string | null;
  user_id: string | null;
}

export interface Attendance {
  id: string;
  user_id: string;
  branch_id: string | null;
  date: string;
  time_in: string;
  time_out: string | null;
  total_hours: number | null;
}

export interface ReceiptItem {
  product_name: string;
  quantity_sold: number;
  unit_price: number;
  total_price: number;
}

export interface Receipt {
  sale_id: string;
  branch_name: string;
  branch_address: string;
  cashier_name: string;
  payment_method: string;
  total: number;
  created_at: string;
  items: ReceiptItem[];
}