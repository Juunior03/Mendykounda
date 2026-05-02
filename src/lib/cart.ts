/**
 * Cart store — persistent in localStorage, framework-agnostic with a
 * tiny pub/sub so React components can subscribe via useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  imageUrl: string | null;
  quantity: number;
}

const STORAGE_KEY = "mk_cart_v1";
type Listener = () => void;
const listeners = new Set<Listener>();

const isBrowser = typeof window !== "undefined";

const read = (): CartItem[] => {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
};

const write = (items: CartItem[]) => {
  if (!isBrowser) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
};

export const cartStore = {
  getSnapshot: read,
  getServerSnapshot: () => [] as CartItem[],
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(item: Omit<CartItem, "quantity">, quantity = 1) {
    const items = read();
    const existing = items.find((i) => i.productId === item.productId);
    if (existing) existing.quantity += quantity;
    else items.push({ ...item, quantity });
    write(items);
  },
  setQuantity(productId: string, quantity: number) {
    const items = read()
      .map((i) => (i.productId === productId ? { ...i, quantity } : i))
      .filter((i) => i.quantity > 0);
    write(items);
  },
  remove(productId: string) {
    write(read().filter((i) => i.productId !== productId));
  },
  clear() {
    write([]);
  },
};

export const useCart = () =>
  useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);

export const cartTotals = (items: CartItem[]) => {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, itemCount };
};
