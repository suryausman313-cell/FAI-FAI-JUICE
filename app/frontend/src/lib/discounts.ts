import type { MenuItem, Offer } from './api';

export interface ItemPriceBreakdown {
  originalPrice: number;
  finalPrice: number;
  saving: number;
  discountActive: boolean;
  discountLabel: string;
}

function money(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function parseDate(value: unknown): Date | null {
  const text = String(value || '').trim();
  if (!text) return null;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isItemDiscountCurrentlyActive(
  item: Pick<
    MenuItem,
    | 'discount_enabled'
    | 'discount_start_at'
    | 'discount_end_at'
  >,
  now = new Date(),
): boolean {
  if (item.discount_enabled !== true) return false;

  const start = parseDate(item.discount_start_at);
  const end = parseDate(item.discount_end_at);

  if (start && now.getTime() < start.getTime()) return false;
  if (end && now.getTime() > end.getTime()) return false;

  return true;
}

export function getItemPriceBreakdown(
  item: MenuItem,
  basePrice: number,
  now = new Date(),
): ItemPriceBreakdown {
  const originalPrice = Math.max(money(basePrice), 0);
  const type =
    String(item.discount_type || 'percentage').toLowerCase() === 'fixed'
      ? 'fixed'
      : 'percentage';
  const value = Math.max(money(item.discount_value), 0);

  if (
    originalPrice <= 0 ||
    value <= 0 ||
    !isItemDiscountCurrentlyActive(item, now)
  ) {
    return {
      originalPrice,
      finalPrice: originalPrice,
      saving: 0,
      discountActive: false,
      discountLabel: '',
    };
  }

  const saving =
    type === 'fixed'
      ? Math.min(value, originalPrice)
      : Math.min((originalPrice * Math.min(value, 100)) / 100, originalPrice);

  const roundedSaving = money(saving);
  const finalPrice = money(Math.max(originalPrice - roundedSaving, 0));

  return {
    originalPrice,
    finalPrice,
    saving: roundedSaving,
    discountActive: roundedSaving > 0,
    discountLabel:
      type === 'fixed'
        ? `AED ${roundedSaving.toFixed(2)} OFF`
        : `${Math.min(value, 100).toFixed(value % 1 === 0 ? 0 : 2)}% OFF`,
  };
}

export function isPromoOfferCurrentlyActive(
  offer: Offer,
  now = new Date(),
): boolean {
  if (offer.is_active !== true) return false;

  const start = parseDate(offer.start_date);
  const end = parseDate(offer.end_date);

  if (start && now.getTime() < start.getTime()) return false;

  if (end) {
    // Date-only offer end dates remain active until the end of that day.
    const raw = String(offer.end_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      end.setHours(23, 59, 59, 999);
    }
    if (now.getTime() > end.getTime()) return false;
  }

  return true;
}
