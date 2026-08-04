import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { BrandSettings, loadBrandSettings } from '@/lib/brand-settings';

type AppKind = 'customer' | 'admin' | 'kitchen' | 'rider';

function appKind(pathname: string): AppKind {
  const path = pathname.toLowerCase();
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  if (path === '/kitchen' || path.startsWith('/kitchen/')) return 'kitchen';
  if (path === '/rider' || path.startsWith('/rider/')) return 'rider';
  return 'customer';
}

function ensureLink(rel: string): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

export default function DynamicAppMetadata() {
  const location = useLocation();

  const apply = useCallback(async () => {
    const settings = await loadBrandSettings();
    const kind = appKind(location.pathname);

    const config: Record<AppKind, {
      name: keyof BrandSettings;
      icon: keyof BrandSettings;
      color: keyof BrandSettings;
      fallbackName: string;
      fallbackIcon: string;
      manifest: string;
      startUrl: string;
      scope: string;
    }> = {
      customer: {
        name: 'customer_app_name', icon: 'customer_logo_url', color: 'primary_color',
        fallbackName: 'Fai Fai Juice', fallbackIcon: '/icon-customer-512.png', manifest: '/manifest.json?v=20260804-role-icons-2', startUrl: '/', scope: '/',
      },
      admin: {
        name: 'admin_app_name', icon: 'admin_logo_url', color: 'admin_color',
        fallbackName: 'Fai Fai Admin', fallbackIcon: '/icon-admin-512.png?v=20260804-role-icons-2', manifest: '/manifest-admin.json?v=20260804-role-icons-2', startUrl: '/admin/dashboard', scope: '/admin',
      },
      kitchen: {
        name: 'kitchen_app_name', icon: 'kitchen_logo_url', color: 'kitchen_color',
        fallbackName: 'Fai Fai Kitchen', fallbackIcon: '/icon-kitchen-512.png?v=20260804-role-icons-2', manifest: '/manifest-kitchen.json?v=20260804-role-icons-2', startUrl: '/kitchen', scope: '/kitchen',
      },
      rider: {
        name: 'rider_app_name', icon: 'rider_logo_url', color: 'rider_color',
        fallbackName: 'Fai Fai Rider', fallbackIcon: '/icon-rider-512.png?v=20260804-role-icons-2', manifest: '/manifest-rider.json?v=20260804-role-icons-2', startUrl: '/rider', scope: '/rider',
      },
    };

    const selected = config[kind];
    const name = String(settings[selected.name] || selected.fallbackName);
    const icon = String(settings[selected.icon] || settings.logo_url || selected.fallbackIcon);
    const color = String(settings[selected.color] || '#111827');
    document.title = name;
    ensureLink('icon').href = icon;
    ensureLink('apple-touch-icon').href = icon;
    const theme = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = color;

    const manifestLink = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]') || ensureLink('manifest');
    const oldBlob = manifestLink.dataset.dynamicBlob;
    if (oldBlob) URL.revokeObjectURL(oldBlob);
    manifestLink.href = selected.manifest;
    delete manifestLink.dataset.dynamicBlob;
  }, [location.pathname]);

  useEffect(() => {
    void apply();
    const refresh = () => void apply();
    window.addEventListener('fai-fai-brand-updated', refresh);
    return () => window.removeEventListener('fai-fai-brand-updated', refresh);
  }, [apply]);

  return null;
}
