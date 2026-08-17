import { getAPIBaseURL } from './config';

type EntityRequest = {
  id?: string;
  data?: Record<string, unknown>;
  query?: Record<string, unknown>;
  sort?: string;
  skip?: number;
  limit?: number;
  fields?: string;
};

const FAI_FAI_MENU_IMAGES: Record<string, string> = {
  watermelon: 'watermelon.webp',
  shining: 'shining.webp',
  orange: 'orange.webp',
  fadeetk: 'fadeetk.webp',
  melon: 'melon.webp',
  hibiscus: 'hibiscus.webp',
  'cocktail juice': 'cocktail.webp',
  'orange passion': 'orange-passion-fruit.webp',
  avocado: 'avocado.webp',
  'lemon mint': 'lemon-mint.webp',
  'strawberry smoothie': 'strawberry-smoothie.webp',
  'juice bottle 1.5 l': 'juice-box.webp',
  'hambana box 20 pcs': 'mini-juice-box.webp',
  'juices box': 'juice-box.webp',
  hambana: 'fai-fai-special.webp',
  'mix fruit': 'cocktail.webp',
  'watermelon with cheese': 'watermelon.webp',
  acai: 'acai.webp',
  'smoothie acai': 'smoothie-acai.webp',
  'strawberry mojito': 'strawberry-mojito.webp',
  'blue mojito': 'blue-mojito.webp',
  'mojito green apple': 'green-apple-mojito.webp',
  'mojito passion fruit': 'passion-fruit-mojito.webp',
  'caramel ice cream': 'caramel-ice-cream.webp',
  'lemon mint ice cream': 'lemon-mint-ice-cream.webp',
  'mix berry ice cream': 'mix-berry-ice-cream.webp',
  'strawberry cheesecake ice cream': 'strawberry-cheesecake-ice-cream.webp',
  'einstein milkshake': 'einstein.webp',
  'nutella milkshake': 'nutella.webp',
  'strawberry milkshake': 'strawberry-milkshake.webp',
  'chocolate milkshake': 'chocolate-milkshake.webp',
  'oreo milkshake': 'oreo-milkshake.webp',
  'kinder milkshake': 'chocolate-milkshake.webp',
};

function restoreMenuImages(payload: any) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  items.forEach((item: any) => {
    if (String(item?.image_url || '').trim()) return;
    const file = FAI_FAI_MENU_IMAGES[String(item?.name || '').trim().toLowerCase()];
    if (file) item.image_url = `/menu/fai-fai-v1/${file}`;
  });
  return payload;
}

export async function backendRequest(
  path: string,
  method = 'GET',
  data?: unknown,
  params?: Record<string, unknown>,
) {
  const url = new URL(`${getAPIBaseURL().replace(/\/$/, '')}${path}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(
      key,
      key === 'query' && typeof value === 'object'
        ? JSON.stringify(value)
        : String(value),
    );
  });

  const adminToken = localStorage.getItem('fai_fai_admin_token') || '';
  const customerToken = localStorage.getItem('vita_customer_token') || '';
  // A shop owner may use Admin and Customer screens in the same browser.
  // Customer-only endpoints must never receive the saved Admin token.
  const isCustomerEndpoint =
    path.startsWith('/api/v1/orders/') ||
    path.startsWith('/api/v1/customer-push/') ||
    path.startsWith('/api/v1/customer-auth/') ||
    path.startsWith('/api/v1/rider/delivery-eta/') ||
    path === '/api/v1/admin/customer-heartbeat';
  const bearerToken = isCustomerEndpoint
    ? customerToken
    : adminToken || customerToken;

  const response = await fetch(url.toString(), {
    method,
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(
        bearerToken
          ? {
              Authorization: `Bearer ${bearerToken}`,
            }
          : {}
      ),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });

  let payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.message || `Request failed (${response.status})`);
  }
  if (path === '/api/v1/entities/menu_items') {
    payload = restoreMenuImages(payload);
  }
  return { data: payload };
}

function entityApi(entity: string) {
  const basePath = `/api/v1/entities/${entity}`;
  return {
    query: (options: EntityRequest = {}) =>
      backendRequest(basePath, 'GET', undefined, {
        query: options.query,
        sort: options.sort,
        skip: options.skip,
        limit: options.limit,
        fields: options.fields,
      }),
    create: (options: EntityRequest) =>
      backendRequest(basePath, 'POST', options.data || {}),
    update: (options: EntityRequest) =>
      backendRequest(`${basePath}/${options.id}`, 'PUT', options.data || {}),
    delete: (options: EntityRequest) =>
      backendRequest(`${basePath}/${options.id}`, 'DELETE'),
  };
}

// The exported app runs on Cloudflare/Render, so every entity and API request
// uses the configured Render backend directly.
const entities = new Proxy(
  {},
  { get: (_target, entity: string) => entityApi(entity) },
) as any;

export const client = {
  entities,
  apiCall: {
    invoke: ({ url, method = 'GET', data, params }: any) =>
      backendRequest(url, method, data, params),
  },
} as any;


type LocalizedRecord = Record<string, any>;

function readTranslationObject(value: LocalizedRecord | null | undefined): Record<string, any> {
  if (!value || typeof value !== 'object') return {};

  const direct =
    value.translations ||
    value.translation ||
    value.i18n ||
    value.localized ||
    null;

  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct;
  }

  const raw =
    value.translations_json ||
    value.translation_json ||
    value.i18n_json ||
    '';

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore invalid optional translation JSON and fall back safely.
    }
  }

  return {};
}

function localizedField(
  value: LocalizedRecord | null | undefined,
  language: string | null | undefined,
  field: 'name' | 'description',
): string {
  if (!value) return '';

  const lang = String(language || 'en').toLowerCase().trim();
  const base = String(value[field] ?? '').trim();

  if (!lang || lang === 'en') {
    return (
      String(value[`${field}_en`] ?? '').trim() ||
      base
    );
  }

  // Support common database shapes such as name_ar / description_ar.
  const directCandidates = [
    value[`${field}_${lang}`],
    value[`${lang}_${field}`],
  ];

  for (const candidate of directCandidates) {
    const text = String(candidate ?? '').trim();
    if (text) return text;
  }

  // Support nested translation shapes:
  // { translations: { ar: { name: '...', description: '...' } } }
  // { translations: { name: { ar: '...' } } }
  const translations = readTranslationObject(value);

  const byLanguage = translations?.[lang];
  if (byLanguage && typeof byLanguage === 'object') {
    const text = String(byLanguage[field] ?? '').trim();
    if (text) return text;
  }

  const byField = translations?.[field];
  if (byField && typeof byField === 'object') {
    const text = String(byField[lang] ?? '').trim();
    if (text) return text;
  }

  // Support flat optional keys inside translation JSON.
  const flatText = String(
    translations?.[`${field}_${lang}`] ??
    translations?.[`${lang}_${field}`] ??
    '',
  ).trim();

  if (flatText) return flatText;

  // Never show undefined/translation keys to customer.
  return (
    String(value[`${field}_en`] ?? '').trim() ||
    base
  );
}

/**
 * Returns a menu/category/extra name in the customer's selected language.
 * Falls back to English/original text if that translation is missing.
 */
export function localizedMenuText(
  value: LocalizedRecord | null | undefined,
  language: string | null | undefined,
): string {
  return localizedField(value, language, 'name');
}

/**
 * Returns a menu-item description in the customer's selected language.
 * Falls back to English/original description if that translation is missing.
 */
export function localizedMenuDescription(
  value: LocalizedRecord | null | undefined,
  language: string | null | undefined,
): string {
  return localizedField(value, language, 'description');
}

// Backward-compatible aliases. They do not change any existing behavior,
// but prevent older/current pages from breaking if they use these names.
export function localizedCategoryText(
  value: LocalizedRecord | null | undefined,
  language: string | null | undefined,
): string {
  return localizedMenuText(value, language);
}

export function localizedExtraText(
  value: LocalizedRecord | null | undefined,
  language: string | null | undefined,
): string {
  return localizedMenuText(value, language);
}


// Types
export interface Category {
  id: number;
  name: string;
  name_en?: string;
  name_ar?: string;
  name_ur?: string;
  translations?: Record<string, any>;
  translations_json?: string;
  sort_order: number;
  is_active: boolean;
}

export interface SizeOption {
  name: string;
  price: number;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  name_en?: string;
  name_ar?: string;
  name_ur?: string;
  description: string;
  description_en?: string;
  description_ar?: string;
  description_ur?: string;
  translations?: Record<string, any>;
  translations_json?: string;
  price_medium: number;
  price_large: number;
  sizes_json: string;
  extras_json?: string;
  image_url: string;
  is_active: boolean;
  is_popular: boolean;
  has_extras: boolean;
  discount_enabled?: boolean;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  discount_start_at?: string;
  discount_end_at?: string;
  sort_order: number;
}

/** Parse sizes_json or fallback to price_medium/price_large */
export function getItemSizes(item: MenuItem): SizeOption[] {
  if (item.sizes_json) {
    try {
      const parsed = JSON.parse(item.sizes_json);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fallback */ }
  }
  // Legacy fallback
  const sizes: SizeOption[] = [];
  if (item.price_medium > 0) sizes.push({ name: 'Medium', price: item.price_medium });
  if (item.price_large > 0) sizes.push({ name: 'Large', price: item.price_large });
  if (sizes.length === 0) sizes.push({ name: 'Regular', price: item.price_medium || item.price_large || 0 });
  return sizes;
}

export interface Extra {
  id: number;
  name: string;
  name_en?: string;
  name_ar?: string;
  name_ur?: string;
  translations?: Record<string, any>;
  translations_json?: string;
  price: number;
  is_active: boolean;
}


/**
 * Return the extras available for a menu item.
 *
 * The current Fai Fai backend stores only `has_extras` on menu_items;
 * extras themselves are a separate entity. Therefore an item either
 * receives all active extras, or none when has_extras is false.
 *
 * This helper is null-safe so Menu.tsx can call it during loading too.
 */
export function getItemExtras(
  item: MenuItem | null | undefined,
  availableExtras: Extra[] | null | undefined = [],
): Extra[] {
  if (!item || item.has_extras === false) return [];

  // Prefer extras configured directly under this menu item in Admin.
  // This prevents old/global pizza extras from appearing on unrelated items.
  if (item.extras_json) {
    try {
      const parsed = JSON.parse(item.extras_json);
      if (Array.isArray(parsed)) {
        return parsed
          .map((extra: any, index: number) => ({
            id: -(index + 1),
            name: String(extra?.name || '').trim(),
            name_ar: String(extra?.name_ar || '').trim(),
            price: Math.max(0, Number(extra?.price || 0)),
            is_active: true,
          }))
          .filter((extra: Extra) => Boolean(extra.name));
      }
    } catch {
      // Invalid old JSON can still fall back to the legacy global extras list.
    }
  }

  return (Array.isArray(availableExtras) ? availableExtras : []).filter(
    (extra) => extra && extra.is_active !== false,
  );
}

export interface Order {
  id: number;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  estimated_time: string;
  order_notes: string;
  payment_method: string;
  order_type?: 'pickup' | 'delivery';
  customer_lat?: number | null;
  customer_lng?: number | null;
  customer_address?: string;
  status: string;
  total_amount: number;
  subtotal_amount?: number;
  promo_code?: string;
  discount_type?: 'percentage' | 'fixed' | '';
  discount_percent?: number;
  discount_amount?: number;
  service_fee?: number;
  small_order_fee?: number;
  delivery_charge?: number;
  tax_amount?: number;
  tip_amount?: number;
  tip_type?: string;
  items_json: string;
  created_at: string;
  updated_at: string;
}

export interface RestaurantSettings {
  id: number;
  restaurant_name: string;
  phone: string;
  address: string;
  opening_hours: string;
  logo_url: string;
  restaurant_status: 'open' | 'busy' | 'closed';
  busy_message: string;
  estimated_wait_time: string;
  delivery_enabled: boolean;
  delivery_schedule_enabled?: boolean;
  delivery_start_time?: string;
  delivery_end_time?: string;
  delivery_charges: string;
  estimated_delivery_time: string;
  restaurant_lat: string;
  restaurant_lng: string;
  near_radius: string;
  far_radius: string;
  near_charge: string;
  far_charge: string;
  auto_schedule_enabled: boolean;
  auto_open_time: string;
  auto_close_time: string;
  service_fee_enabled: boolean;
  service_fee_amount: number;
  service_fee_applies_to: 'pickup' | 'delivery' | 'both';
  small_order_fee_enabled: boolean;
  small_order_fee_amount: number;
  small_order_fee_threshold: number;
  cash_enabled_pickup: boolean;
  card_enabled_pickup: boolean;
  cash_enabled_delivery: boolean;
  card_enabled_delivery: boolean;
  show_branding?: boolean;
  show_notifications?: boolean;
  show_status_banner?: boolean;
  show_offers?: boolean;
  show_quick_actions?: boolean;
  show_menu_action?: boolean;
  show_deals_action?: boolean;
  show_orders_action?: boolean;
  show_contact_action?: boolean;
  show_popular_items?: boolean;
  show_reviews?: boolean;
  blog_enabled?: boolean;
  show_restaurant_info?: boolean;
  show_bottom_nav?: boolean;
  popular_auto_enabled?: boolean;
  popular_manual_enabled?: boolean;
  popular_max_items?: number;
  checkout_flow?: 'two_step' | 'direct';
  tax_percent?: number;
  vat_included?: boolean;
  banner_text?: string;
  offer_text?: string;
}

export interface Offer {
  id: number;
  title: string;
  description: string;
  discount_type?: 'percentage' | 'fixed';
  discount_percent: number;
  fixed_discount_amount?: number;
  minimum_order_amount?: number;
  maximum_discount_amount?: number;
  promo_code: string;
  banner_image_url: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  first_order_only: boolean;
  usage_limit_per_customer: number;
  total_usage_limit?: number;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  target: string;
  is_read: boolean;
  user_id: string;
  created_at: string;
}

export interface CartItem {
  id: string;
  menuItem: MenuItem;
  size: string;
  extras: Extra[];
  quantity: number;
  totalPrice: number;
  originalTotalPrice?: number;
  itemDiscountAmount?: number;
  itemDiscountLabel?: string;
  isDeal?: boolean;
  dealId?: number;
  dealName?: string;
  dealSelectedItems?: { categoryName: string; items: { id: number; name: string }[] }[];
}

export interface PaymentBreakdown {
  [method: string]: { revenue: number; orders: number };
}

export interface SalesReport {
  daily_sales: number;
  weekly_sales: number;
  monthly_sales: number;
  total_orders: number;
  daily_orders: number;
  weekly_orders: number;
  monthly_orders: number;
  best_selling_items: { name: string; quantity: number }[];
  payment_breakdown: PaymentBreakdown;
  today_payment_breakdown: PaymentBreakdown;
}

export interface Customer {
  user_id: string;
  customer_name: string;
  customer_phone: string;
  total_orders: number;
  total_spent: number;
  last_order_date: string;
  is_blocked?: boolean;
  is_online?: boolean;
  last_active?: string;
  first_seen?: string;
  is_guest?: boolean;
}

export interface Feedback {
  id: number;
  user_id: string;
  order_id: number;
  customer_name: string;
  rating: number;
  comment: string;
  is_visible: boolean;
  created_at: string;
}
