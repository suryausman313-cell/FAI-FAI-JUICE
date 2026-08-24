/**
 * UI-only payment label.
 *
 * Do not use this value for payment logic or API payloads. The backend keeps
 * its existing raw methods (for example "Ziina Online", "Cash on Pickup").
 */
export function paymentDisplayLabel(method: unknown): string {
  const raw = String(method ?? '').trim();
  const normalized = raw.toLowerCase();

  if (!normalized || normalized.includes('cash')) return 'Cash';
  if (
    normalized.includes('ziina') ||
    normalized.includes('card') ||
    normalized.includes('online')
  ) {
    return 'Card Payment';
  }

  // Preserve any future/unknown method rather than misclassifying it.
  return raw;
}
