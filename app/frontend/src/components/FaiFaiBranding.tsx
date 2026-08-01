import { useEffect } from 'react';

import {
  BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  loadBrandSettings,
} from '@/lib/brand-settings';

let currentBrand: BrandSettings = {
  ...DEFAULT_BRAND_SETTINGS,
};

function panelDetails(brand: BrandSettings) {
  const path = window.location.pathname.toLowerCase();

  if (path.startsWith('/admin')) {
    return {
      title: brand.admin_app_name,
      logo:
        brand.admin_logo_url ||
        brand.logo_url ||
        '/icon-admin-192.png',
      color: brand.admin_color,
    };
  }

  if (path.startsWith('/kitchen')) {
    return {
      title: brand.kitchen_app_name,
      logo:
        brand.kitchen_logo_url ||
        brand.logo_url ||
        '/icon-kitchen-192.png',
      color: brand.kitchen_color,
    };
  }

  if (path.startsWith('/rider')) {
    return {
      title: brand.rider_app_name,
      logo:
        brand.rider_logo_url ||
        brand.logo_url ||
        '/icon-rider-192.png',
      color: brand.rider_color,
    };
  }

  return {
    title: brand.customer_app_name || brand.shop_name,
    logo:
      brand.customer_logo_url ||
      brand.logo_url ||
      '/icon-customer-192.png',
    color: brand.primary_color,
  };
}

function brandParts(name: string): {
  first: string;
  second: string;
} {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return {
      first: words[0] || 'Fai Fai',
      second: '',
    };
  }

  return {
    first: words.slice(0, -1).join(' '),
    second: words[words.length - 1],
  };
}

function preserveWhitespace(
  original: string,
  replacement: string,
): string {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  return `${leading}${replacement}${trailing}`;
}

function replaceBrandText(
  value: string,
  brand: BrandSettings,
): string {
  const trimmed = value.trim();
  const parts = brandParts(brand.shop_name);

  if (/^vita$/i.test(trimmed)) {
    return preserveWhitespace(value, parts.first);
  }

  if (/^napoli$/i.test(trimmed)) {
    return preserveWhitespace(value, parts.second);
  }

  if (/^vn$/i.test(trimmed)) {
    return preserveWhitespace(
      value,
      brand.short_name
        .split(/\s+/)
        .map((word) => word[0])
        .join('')
        .slice(0, 3)
        .toUpperCase(),
    );
  }

  const replacements: Array<[RegExp, string]> = [
    [/VITA[\s\u00a0_-]*NAPOLI[\s\u00a0_-]*PIZZA/gi, brand.shop_name],
    [/VITA[\s\u00a0_-]*NAPOLI/gi, brand.shop_name],
    [/VITANAPOLI/gi, brand.short_name],
    [/vita-napoli/gi, brand.short_name.toLowerCase().replace(/\s+/g, '-')],
    [/FAI[\s\u00a0_-]*FAI[\s\u00a0_-]*JUICE/gi, brand.shop_name],
    [/\+971\s*54\s*294\s*0112/g, brand.phone],
    [/\+971\s*52\s*109\s*1092/g, brand.phone],
    [/\+971542940112/g, brand.phone.replace(/\s+/g, '')],
    [/\+971521091092/g, brand.phone.replace(/\s+/g, '')],
    [/971542940112/g, brand.whatsapp],
    [/971521091092/g, brand.whatsapp],
    [/Authentic Italian Pizza/gi, brand.slogan],
    [/Italian pizza and pasta/gi, brand.slogan],
    [/Fresh Juices, Desserts & Beverages/gi, brand.slogan],
  ];

  let next = value;
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next.replace(/🍕/g, '🥤');
}

function updateMetadata(brand: BrandSettings): void {
  const panel = panelDetails(brand);
  document.title = panel.title;

  const description = `${brand.slogan}. ${brand.address}`;

  document
    .querySelectorAll<HTMLMetaElement>('meta[name="description"]')
    .forEach((meta) => {
      meta.content = description;
    });

  document
    .querySelectorAll<HTMLMetaElement>(
      'meta[property="og:title"], meta[name="twitter:title"]',
    )
    .forEach((meta) => {
      meta.content = panel.title;
    });

  document
    .querySelectorAll<HTMLMetaElement>(
      'meta[property="og:description"], meta[name="twitter:description"]',
    )
    .forEach((meta) => {
      meta.content = description;
    });

  const themeMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (themeMeta) themeMeta.content = panel.color;

  let iconLink =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }

  iconLink.href = panel.logo;
}

function applyTheme(brand: BrandSettings): void {
  const panel = panelDetails(brand);

  document.documentElement.style.setProperty(
    '--brand-primary',
    brand.primary_color,
  );
  document.documentElement.style.setProperty(
    '--brand-panel',
    panel.color,
  );

  let style = document.getElementById(
    'fai-fai-dynamic-brand-style',
  ) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = 'fai-fai-dynamic-brand-style';
    document.head.appendChild(style);
  }

  style.textContent = `
    .bg-red-600, .bg-green-600.brand-primary {
      background-color: ${brand.primary_color} !important;
    }
    .hover\\:bg-red-700:hover {
      background-color: ${brand.primary_color} !important;
      filter: brightness(.88);
    }
    .text-red-600, .text-red-500 {
      color: ${brand.primary_color} !important;
    }
    .border-red-600, .border-red-500 {
      border-color: ${brand.primary_color} !important;
    }
    .ring-red-600 {
      --tw-ring-color: ${brand.primary_color} !important;
    }
  `;
}

function replaceTextNode(
  node: Text,
  brand: BrandSettings,
): void {
  const current = node.nodeValue || '';
  const next = replaceBrandText(current, brand);

  if (next !== current) {
    node.nodeValue = next;
  }
}

function replaceExactContainers(
  root: ParentNode,
  brand: BrandSettings,
): void {
  root
    .querySelectorAll?.<HTMLElement>(
      'h1, h2, h3, header a, header div, nav a',
    )
    .forEach((element) => {
      if (element.querySelector('button, input, textarea, select')) {
        return;
      }

      const normalized = (element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (
        /^(vita napoli(?: pizza)?|fai fai juice)$/i.test(
          normalized,
        )
      ) {
        element.textContent = brand.shop_name;
      }
    });
}

function replaceAttributes(
  root: ParentNode,
  brand: BrandSettings,
): void {
  root
    .querySelectorAll?.<HTMLElement>(
      '[title], [aria-label], [placeholder], [alt], a[href]',
    )
    .forEach((element) => {
      ['title', 'aria-label', 'placeholder', 'alt'].forEach(
        (attribute) => {
          const current = element.getAttribute(attribute);
          if (!current) return;

          const next = replaceBrandText(current, brand);
          if (next !== current) {
            element.setAttribute(attribute, next);
          }
        },
      );

      if (element instanceof HTMLAnchorElement) {
        const href = element.getAttribute('href') || '';
        let next = replaceBrandText(href, brand);

        if (/^tel:/i.test(href)) {
          next = `tel:${brand.phone.replace(/\s+/g, '')}`;
        }

        if (/wa\.me\//i.test(href)) {
          next = `https://wa.me/${brand.whatsapp.replace(/\D/g, '')}`;
        }

        if (next !== href) {
          element.setAttribute('href', next);
        }
      }
    });
}

function replaceLogos(
  root: ParentNode,
  brand: BrandSettings,
): void {
  const panel = panelDetails(brand);

  root.querySelectorAll?.<HTMLImageElement>('img').forEach(
    (image) => {
      const fingerprint = [
        image.getAttribute('src') || '',
        image.getAttribute('alt') || '',
        image.getAttribute('title') || '',
      ]
        .join(' ')
        .toLowerCase();

      const oldLogo =
        /vita|napoli/.test(fingerprint) ||
        (/logo/.test(fingerprint) &&
          !/menu|product|item|category/.test(fingerprint));

      if (oldLogo) {
        image.src = panel.logo;
        image.alt = brand.shop_name;
      }
    },
  );
}

function replaceTree(
  root: ParentNode,
  brand: BrandSettings,
): void {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;

    if (node.parentElement?.closest('script, style, textarea')) {
      continue;
    }

    nodes.push(node);
  }

  nodes.forEach((node) => replaceTextNode(node, brand));
  replaceAttributes(root, brand);
  replaceLogos(root, brand);
  replaceExactContainers(root, brand);
}

function saveLocalBrand(brand: BrandSettings): void {
  try {
    localStorage.setItem(
      'fai_fai_brand_settings',
      JSON.stringify(brand),
    );
  } catch {
    // Branding should never crash the app.
  }
}

function applyBrand(brand: BrandSettings): void {
  currentBrand = {
    ...DEFAULT_BRAND_SETTINGS,
    ...brand,
  };

  saveLocalBrand(currentBrand);
  updateMetadata(currentBrand);
  applyTheme(currentBrand);
  replaceTree(document.body, currentBrand);
}

export default function FaiFaiBranding() {
  useEffect(() => {
    let active = true;

    void loadBrandSettings().then((settings) => {
      if (active) applyBrand(settings);
    });

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          replaceTextNode(mutation.target as Text, currentBrand);
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            replaceTextNode(node as Text, currentBrand);
          } else if (node instanceof HTMLElement) {
            replaceTree(node, currentBrand);
          }
        });
      });

      updateMetadata(currentBrand);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const brandUpdated = (event: Event) => {
      const customEvent =
        event as CustomEvent<BrandSettings>;
      applyBrand(customEvent.detail);
    };

    window.addEventListener(
      'fai-fai-brand-updated',
      brandUpdated,
    );

    const interval = window.setInterval(() => {
      replaceTree(document.body, currentBrand);
      updateMetadata(currentBrand);
    }, 2000);

    return () => {
      active = false;
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener(
        'fai-fai-brand-updated',
        brandUpdated,
      );
    };
  }, []);

  return null;
}
