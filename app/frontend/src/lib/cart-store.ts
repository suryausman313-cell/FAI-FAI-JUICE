import { CartItem, MenuItem, Extra, getItemSizes } from './api';
import { getItemPriceBreakdown } from './discounts';

// Simple cart store using localStorage
const CART_KEY = 'vita-napoli-cart';

export function getCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_KEY);
    const items: CartItem[] = stored ? JSON.parse(stored) : [];

    // Recalculate every normal item when cart opens so a scheduled discount
    // starts or expires correctly without requiring the customer to re-add it.
    const refreshed = items.map(item => {
      if (item.isDeal) return item;
      return {
        ...item,
        ...calculateCartItemTotals(item.menuItem, item.size, item.extras || [], item.quantity),
      };
    });

    if (stored) localStorage.setItem(CART_KEY, JSON.stringify(refreshed));
    return refreshed;
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function calculateCartItemTotals(
  menuItem: MenuItem,
  size: string,
  extras: Extra[],
  quantity: number,
) {
  const sizes = getItemSizes(menuItem);
  const sizeObj = sizes.find(s => s.name === size) || sizes[0];
  const basePrice = Number(sizeObj?.price || 0);
  const extrasPrice = extras.reduce((sum, extra) => sum + Number(extra.price || 0), 0);
  const breakdown = getItemPriceBreakdown(menuItem, basePrice);

  const originalTotalPrice = (basePrice + extrasPrice) * quantity;
  const totalPrice = (breakdown.finalPrice + extrasPrice) * quantity;
  const itemDiscountAmount = breakdown.saving * quantity;

  return {
    totalPrice,
    originalTotalPrice,
    itemDiscountAmount,
    itemDiscountLabel: breakdown.discountLabel,
  };
}

export function addToCart(
  menuItem: MenuItem,
  size: string,
  extras: Extra[],
  quantity: number,
): CartItem[] {
  const cart = getCart();
  const totals = calculateCartItemTotals(menuItem, size, extras, quantity);

  const newItem: CartItem = {
    id: `${menuItem.id}-${size}-${extras.map(e => e.id).join(',')}-${Date.now()}`,
    menuItem,
    size,
    extras,
    quantity,
    ...totals,
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
    if (item.id !== itemId) return item;

    if (item.isDeal) {
      const singlePrice = item.quantity > 0 ? item.totalPrice / item.quantity : item.totalPrice;
      return {
        ...item,
        quantity,
        totalPrice: singlePrice * quantity,
        originalTotalPrice: singlePrice * quantity,
        itemDiscountAmount: 0,
      };
    }

    return {
      ...item,
      quantity,
      ...calculateCartItemTotals(item.menuItem, item.size, item.extras, quantity),
    };
  });

  saveCart(cart);
  return cart;
}

export function clearCart(): void {
  localStorage.removeItem(CART_KEY);
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
}

export function getCartOriginalTotal(cart: CartItem[]): number {
  return cart.reduce(
    (sum, item) => sum + Number(item.originalTotalPrice ?? item.totalPrice ?? 0),
    0,
  );
}

export function getCartItemDiscountTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + Number(item.itemDiscountAmount || 0), 0);
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
    originalTotalPrice: deal.dealPrice,
    itemDiscountAmount: 0,
    isDeal: true,
    dealId: deal.dealId,
    dealName: deal.dealName,
    dealSelectedItems: deal.selectedItems,
  };
  cart.push(newItem);
  saveCart(cart);
  return cart;
}
