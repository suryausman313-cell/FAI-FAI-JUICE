import { CartItem, MenuItem, Extra, getItemSizes } from './api';

// Simple cart store using localStorage
const CART_KEY = 'vita-napoli-cart';

export function getCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(
  menuItem: MenuItem,
  size: string,
  extras: Extra[],
  quantity: number
): CartItem[] {
  const cart = getCart();
  const sizes = getItemSizes(menuItem);
  const sizeObj = sizes.find(s => s.name === size) || sizes[0];
  const basePrice = sizeObj?.price || 0;
  const extrasPrice = extras.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = (basePrice + extrasPrice) * quantity;

  const newItem: CartItem = {
    id: `${menuItem.id}-${size}-${extras.map(e => e.id).join(',')}-${Date.now()}`,
    menuItem,
    size,
    extras,
    quantity,
    totalPrice,
  };

  cart.push(newItem);
  saveCart(cart);
  return cart;
}

export function removeFromCart(itemId: string): CartItem[] {
  const cart = getCart().filter(item => item.id !== itemId);
  saveCart(cart);
  return cart;
}

export function updateCartItemQuantity(itemId: string, quantity: number): CartItem[] {
  const cart = getCart().map(item => {
    if (item.id === itemId) {
      const sizes = getItemSizes(item.menuItem);
      const sizeObj = sizes.find(s => s.name === item.size) || sizes[0];
      const basePrice = sizeObj?.price || 0;
      const extrasPrice = item.extras.reduce((sum, e) => sum + e.price, 0);
      return { ...item, quantity, totalPrice: (basePrice + extrasPrice) * quantity };
    }
    return item;
  });
  saveCart(cart);
  return cart;
}

export function clearCart(): void {
  localStorage.removeItem(CART_KEY);
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.totalPrice, 0);
}

export function getCartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export interface DealCartInput {
  dealId: number;
  dealName: string;
  dealPrice: number;
  selectedItems: { categoryName: string; items: { id: number; name: string }[] }[];
}

export function addDealToCart(deal: DealCartInput): CartItem[] {
  const cart = getCart();
  const newItem: CartItem = {
    id: `deal-${deal.dealId}-${Date.now()}`,
    menuItem: {
      id: deal.dealId,
      category_id: 0,
      name: deal.dealName,
      description: deal.selectedItems.map(c => `${c.items.length} ${c.categoryName}`).join(', '),
      price: deal.dealPrice,
      image_url: '',
      is_active: true,
      has_extras: false,
      sort_order: 0,
    } as any,
    size: 'Deal',
    extras: [],
    quantity: 1,
    totalPrice: deal.dealPrice,
    isDeal: true,
    dealId: deal.dealId,
    dealName: deal.dealName,
    dealSelectedItems: deal.selectedItems,
  };
  cart.push(newItem);
  saveCart(cart);
  return cart;
}