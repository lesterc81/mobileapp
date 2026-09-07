import { create } from 'zustand';

export interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: { id: string; name: string; price: number }) => void;
  increment: (productId: string) => void;
  decrement: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const MAX_QTY = 999;

export const useCart = create<CartState>((set) => ({
  lines: [],

  add: (product) =>
    set((state) => {
      const existing = state.lines.find((l) => l.productId === product.id);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === product.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + 1) } : l
          ),
        };
      }
      return { lines: [...state.lines, { productId: product.id, name: product.name, price: product.price, quantity: 1 }] };
    }),

  increment: (productId) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + 1) } : l
      ),
    })),

  decrement: (productId) =>
    set((state) => {
      const target = state.lines.find((l) => l.productId === productId);
      if (!target) return state;
      if (target.quantity <= 1) {
        return { lines: state.lines.filter((l) => l.productId !== productId) };
      }
      return {
        lines: state.lines.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l
        ),
      };
    }),

  remove: (productId) => set((state) => ({ lines: state.lines.filter((l) => l.productId !== productId) })),

  clear: () => set({ lines: [] }),
}));

export function cartTotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100;
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}