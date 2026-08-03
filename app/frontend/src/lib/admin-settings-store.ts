import { client } from '@/lib/api';

export interface ExtendedSettings {
  delivery_enabled: boolean;
  delivery_charges: string;
  estimated_delivery_time: string;
  tax_percent: string;
  promo_code: string;
  promo_discount: string;
  offer_text: string;
  banner_text: string;
  kitchen_pin: string;
  admin_username: string;
  admin_password: string;
  auto_schedule_enabled: boolean;
  auto_open_time: string;
  auto_close_time: string;
  restaurant_lat: string;
  restaurant_lng: string;
  near_radius: string;
  far_radius: string;
  near_charge: string;
  far_charge: string;
  service_fee_enabled: boolean;
  service_fee_amount: string;
  service_fee_type: 'fixed' | 'percentage';
  service_fee_applies_to: 'pickup' | 'delivery' | 'both';
  small_order_fee_enabled: boolean;
  small_order_fee_amount: string;
  small_order_fee_threshold: string;
  cash_enabled_pickup: boolean;
  card_enabled_pickup: boolean;
  cash_enabled_delivery: boolean;
  card_enabled_delivery: boolean;
  allowed_country_codes: string;
  blog_enabled: boolean;
  allow_cancel_preparing: boolean;
  allow_cancel_ready: boolean;
  allow_modify_preparing: boolean;
  order_accept_timeout_minutes: string;
  order_expire_timeout_minutes: string;
  checkout_flow: 'two_step' | 'direct';
  show_status_banner: boolean;
  show_offers: boolean;
  show_quick_actions: boolean;
  show_popular_items: boolean;
  show_reviews: boolean;
  show_restaurant_info: boolean;
  show_bottom_nav: boolean;
  popular_auto_enabled: boolean;
  popular_manual_enabled: boolean;
  popular_max_items: string;
}

export const DEFAULT_EXTENDED_SETTINGS: ExtendedSettings = {
  delivery_enabled: false,
  delivery_charges: '5',
  estimated_delivery_time: '30-45 min',
  tax_percent: '5',
  promo_code: '',
  promo_discount: '0',
  offer_text: '',
  banner_text: '',
  kitchen_pin: '',
  admin_username: '',
  admin_password: '',
  auto_schedule_enabled: false,
  auto_open_time: '15:00',
  auto_close_time: '02:00',
  restaurant_lat: '25.2747',
  restaurant_lng: '56.3450',
  near_radius: '5',
  far_radius: '15',
  near_charge: '5',
  far_charge: '15',
  service_fee_enabled: false,
  service_fee_amount: '0',
  service_fee_type: 'fixed',
  service_fee_applies_to: 'both',
  small_order_fee_enabled: false,
  small_order_fee_amount: '0',
  small_order_fee_threshold: '20',
  cash_enabled_pickup: true,
  card_enabled_pickup: true,
  cash_enabled_delivery: true,
  card_enabled_delivery: true,
  allowed_country_codes: '+971,+91,+92,+44,+1',
  blog_enabled: true,
  allow_cancel_preparing: false,
  allow_cancel_ready: false,
  allow_modify_preparing: false,
  order_accept_timeout_minutes: '5',
  order_expire_timeout_minutes: '15',
  checkout_flow: 'two_step',
  show_status_banner: true,
  show_offers: true,
  show_quick_actions: true,
  show_popular_items: true,
  show_reviews: true,
  show_restaurant_info: true,
  show_bottom_nav: true,
  popular_auto_enabled: true,
  popular_manual_enabled: true,
  popular_max_items: '6',
};

export function readExtendedSettings(): ExtendedSettings {
  try {
    const raw = localStorage.getItem('extended_settings');
    if (!raw) return { ...DEFAULT_EXTENDED_SETTINGS };

    return {
      ...DEFAULT_EXTENDED_SETTINGS,
      ...JSON.parse(raw),
    };
  } catch {
    return { ...DEFAULT_EXTENDED_SETTINGS };
  }
}

export function saveExtendedSettings(
  patch: Partial<ExtendedSettings>,
): ExtendedSettings {
  const next = {
    ...readExtendedSettings(),
    ...patch,
  };

  localStorage.setItem('extended_settings', JSON.stringify(next));
  return next;
}

export function isAdminLoggedIn(): boolean {
  try {
    const auth = JSON.parse(localStorage.getItem('admin_auth') || '{}');
    return Boolean(auth.loggedIn);
  } catch {
    return false;
  }
}

export async function loadRestaurantSettings(): Promise<any | null> {
  const response = await client.entities.restaurant_settings.query({
    query: {},
    limit: 1,
  });

  return response?.data?.items?.[0] || null;
}

export async function updateRestaurantSettings(
  id: string | number,
  data: Record<string, unknown>,
): Promise<void> {
  await client.entities.restaurant_settings.update({
    id: String(id),
    data,
  });
}

export function numberValue(value: string, fallback = 0): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

export function integerValue(value: string, fallback = 0): number {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}
