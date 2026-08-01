import type { MenuItem, Offer, SizeOption } from './api';

export interface ItemPriceBreakdown {
  originalPrice: number;
  finalPrice: number;
  saving: number;
  discountActive: boolean;
  discountLabel: string;
}

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseBoundary(value: string | null | undefined, endOfDay: boolean): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Admin may save either YYYY-MM-DD or datetime-local format.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDay ? '23:59:59' : '00:00:00'}`
    : raw;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isItemDiscountActive(item: MenuItem, now = new Date()): boolean {
  if (item.discount_enabled !== true) return false;

  const value = money(item.discount_value);
  if (value <= 0) return false;

  const type = item.discount_type || 'percentage';
  if (type !== 'percentage' && type !== 'fixed') return false;

  const startsAt = parseBoundary(item.discount_start_at, false);
  const endsAt = parseBoundary(item.discount_end_at, true);

  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;

  return true;
}

export function getItemPriceBreakdown(
  item: MenuItem,
  basePrice: number,
  now = new Date(),
): ItemPriceBreakdown {
  const originalPrice = roundMoney(money(basePrice));

  if (!isItemDiscountActive(item, now)) {
    return {
      originalPrice,
      finalPrice: originalPrice,
      saving: 0,
      discountActive: false,
      discountLabel: '',
    };
  }

  const value = money(item.discount_value);
  const type = item.discount_type || 'percentage';
  let saving = 0;
  let discountLabel = '';

  if (type === 'fixed') {
    saving = Math.min(originalPrice, value);
    discountLabel = `AED ${roundMoney(saving).toFixed(2)} OFF`;
  } else {
    const percentage = Math.min(100, value);
    saving = originalPrice * (percentage / 100);
    discountLabel = `${roundMoney(percentage).toFixed(percentage % 1 === 0 ? 0 : 1)}% OFF`;
  }

  saving = roundMoney(Math.min(originalPrice, Math.max(0, saving)));
  const finalPrice = roundMoney(Math.max(0, originalPrice - saving));

  return {
    originalPrice,
    finalPrice,
    saving,
    discountActive: saving > 0,
    discountLabel: saving > 0 ? discountLabel : '',
  };
}

export function getDiscountedSizes(
  item: MenuItem,
  sizes: SizeOption[],
  now = new Date(),
): Array<SizeOption & ItemPriceBreakdown> {
  return sizes.map(size => ({
    ...size,
    ...getItemPriceBreakdown(item, size.price, now),
  }));
}

export function isPromoOfferCurrentlyActive(offer: Offer, now = new Date()): boolean {
  if (offer.is_active !== true) return false;
  if (!String(offer.promo_code || '').trim()) return false;
  if (money(offer.discount_percent) <= 0) return false;

  const startsAt = parseBoundary(offer.start_date, false);
  const endsAt = parseBoundary(offer.end_date, true);

  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;

  return true;
}
