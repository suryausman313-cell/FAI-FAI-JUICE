import { getAPIBaseURL } from '@/lib/config';

export interface BrandSettings {
  id?: number;
  shop_name: string;
  short_name: string;
  slogan: string;
  phone: string;
  whatsapp: string;
  address: string;

  logo_url: string;
  customer_logo_url: string;
  admin_logo_url: string;
  kitchen_logo_url: string;
  rider_logo_url: string;

  customer_app_name: string;
  admin_app_name: string;
  kitchen_app_name: string;
  rider_app_name: string;

  primary_color: string;
  admin_color: string;
  kitchen_color: string;
  rider_color: string;

  currency: string;
  home_welcome_text: string;
  receipt_footer: string;
}

export const DEFAULT_BRAND_SETTINGS: BrandSettings = {
  shop_name: 'Fai Fai Juice',
  short_name: 'Fai Fai',
  slogan: 'Fresh Juices, Desserts & Beverages',
  phone: '+971 52 109 1092',
  whatsapp: '971521091092',
  address: 'Murbah, Fujairah, UAE',

  logo_url: '',
  customer_logo_url: '',
  admin_logo_url: '',
  kitchen_logo_url: '',
  rider_logo_url: '',

  customer_app_name: 'Fai Fai Juice',
  admin_app_name: 'Fai Fai Admin',
  kitchen_app_name: 'Fai Fai Kitchen',
  rider_app_name: 'Fai Fai Rider',

  primary_color: '#16a34a',
  admin_color: '#166534',
  kitchen_color: '#ea580c',
  rider_color: '#0891b2',

  currency: 'AED',
  home_welcome_text: 'Fresh drinks made for you',
  receipt_footer: 'Thank you for ordering from Fai Fai Juice!',
};

export async function loadBrandSettings(): Promise<BrandSettings> {
  try {
    const response = await fetch(
      `${getAPIBaseURL()}/api/v1/fai-fai-admin/brand-settings`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Brand settings failed (${response.status})`);
    }

    const payload = (await response.json()) as Partial<BrandSettings>;
    const settings = {
      ...DEFAULT_BRAND_SETTINGS,
      ...payload,
    };

    localStorage.setItem('fai_fai_brand_settings', JSON.stringify(settings));
    return settings;
  } catch {
    try {
      const saved = JSON.parse(
        localStorage.getItem('fai_fai_brand_settings') || '{}',
      ) as Partial<BrandSettings>;

      return {
        ...DEFAULT_BRAND_SETTINGS,
        ...saved,
      };
    } catch {
      return { ...DEFAULT_BRAND_SETTINGS };
    }
  }
}

export async function saveBrandSettings(
  settings: BrandSettings,
  securityKey: string,
): Promise<BrandSettings> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/fai-fai-admin/brand-settings`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Fai-Fai-Settings-Key': securityKey,
      },
      body: JSON.stringify(settings),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        `Save failed (${response.status})`,
    );
  }

  const saved = {
    ...DEFAULT_BRAND_SETTINGS,
    ...(payload?.settings || settings),
  };

  localStorage.setItem('fai_fai_brand_settings', JSON.stringify(saved));
  window.dispatchEvent(
    new CustomEvent('fai-fai-brand-updated', {
      detail: saved,
    }),
  );

  return saved;
}

export async function replaceWithFaiFaiMenu(
  securityKey: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/fai-fai-admin/menu/replace`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fai-Fai-Settings-Key': securityKey,
      },
      body: JSON.stringify({
        confirm: 'DELETE OLD MENU',
      }),
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.detail ||
        payload?.message ||
        `Menu replacement failed (${response.status})`,
    );
  }

  return payload as Record<string, unknown>;
}
