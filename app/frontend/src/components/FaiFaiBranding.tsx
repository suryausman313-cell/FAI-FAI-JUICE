import { useEffect } from 'react';

const BRAND = {
  name: 'Fai Fai Juice',
  shortName: 'Fai Fai',
  phoneDisplay: '+971 52 109 1092',
  phoneTel: '+971521091092',
  whatsapp: '971521091092',
  address: 'Murbah, Fujairah, UAE',
  adminUsername: 'faifaiadmin',
  adminPassword: 'FaiFai@2026',
  kitchenPin: '1122',
};

const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/VITA NAPOLI PIZZA/g, 'FAI FAI JUICE'],
  [/Vita Napoli Pizza/g, BRAND.name],
  [/VITA NAPOLI/g, 'FAI FAI JUICE'],
  [/Vita Napoli/g, BRAND.name],
  [/Authentic Italian Pizza/g, 'Fresh Juices, Shakes & Smoothies'],
  [/Authentic Italian pizza/g, 'fresh juices, shakes and smoothies'],
  [/authentic Italian pizza/g, 'fresh juices, shakes and smoothies'],
  [/Italian pizza and pasta/g, 'fresh juices, desserts and beverages'],
  [/Italian Pizza/g, 'Fresh Juice'],
  [/\+971\s*54\s*294\s*0112/g, BRAND.phoneDisplay],
  [/\+971542940112/g, BRAND.phoneTel],
  [/971542940112/g, BRAND.whatsapp],
];

function replaceBrandText(value: string): string {
  return TEXT_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

function updateStoredSettings(): void {
  try {
    const raw = localStorage.getItem('extended_settings');
    const current = raw ? JSON.parse(raw) : {};

    localStorage.setItem(
      'extended_settings',
      JSON.stringify({
        ...current,
        admin_username: BRAND.adminUsername,
        admin_password: BRAND.adminPassword,
        kitchen_pin: BRAND.kitchenPin,
        banner_text: current.banner_text || 'Fresh juices, desserts and beverages',
      }),
    );

    localStorage.setItem('kitchen_pin', BRAND.kitchenPin);

    const conversionVersion = 'fai-fai-brand-v1';
    if (localStorage.getItem('fai_fai_conversion_version') !== conversionVersion) {
      [
        'vita_home_cache',
        'vita_menu_cache',
        'home_cache',
        'menu_cache',
      ].forEach((key) => localStorage.removeItem(key));

      localStorage.setItem('fai_fai_conversion_version', conversionVersion);
    }
  } catch {
    // Branding must never stop the app from opening.
  }
}

function updateDocumentMetadata(): void {
  document.title = `${BRAND.name}`;

  const description = 'Order fresh juices, desserts, mojitos and milkshakes from Fai Fai Juice.';
  const path = window.location.pathname.toLowerCase();

  const title = path.startsWith('/admin')
    ? 'Fai Fai Admin'
    : path.startsWith('/kitchen')
      ? 'Fai Fai Kitchen'
      : path.startsWith('/rider')
        ? 'Fai Fai Rider'
        : BRAND.name;

  document.title = title;

  document.querySelectorAll<HTMLMetaElement>('meta[name="description"]').forEach((meta) => {
    meta.content = description;
  });

  document
    .querySelectorAll<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')
    .forEach((meta) => {
      meta.content = title;
    });

  document
    .querySelectorAll<HTMLMetaElement>('meta[property="og:description"], meta[name="twitter:description"]')
    .forEach((meta) => {
      meta.content = description;
    });
}

function replaceNodeText(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('script, style, textarea')) continue;
    textNodes.push(node);
  }

  textNodes.forEach((node) => {
    const current = node.nodeValue || '';
    const next = replaceBrandText(current);
    if (next !== current) node.nodeValue = next;
  });

  root.querySelectorAll?.<HTMLElement>('[title], [aria-label], [placeholder], a[href]').forEach((element) => {
    ['title', 'aria-label', 'placeholder'].forEach((attribute) => {
      const current = element.getAttribute(attribute);
      if (!current) return;
      const next = replaceBrandText(current);
      if (next !== current) element.setAttribute(attribute, next);
    });

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href') || '';
      const nextHref = href
        .replace(/tel:\+?971542940112/gi, `tel:${BRAND.phoneTel}`)
        .replace(/wa\.me\/971542940112/gi, `wa.me/${BRAND.whatsapp}`);
      if (nextHref !== href) element.setAttribute('href', nextHref);
    }
  });
}

function patchPrintWindows(): () => void {
  const originalOpen = window.open.bind(window);

  window.open = ((...args: Parameters<typeof window.open>) => {
    const opened = originalOpen(...args);

    try {
      if (opened?.document) {
        const originalWrite = opened.document.write.bind(opened.document);
        opened.document.write = (...html: string[]) =>
          originalWrite(...html.map(replaceBrandText));
      }
    } catch {
      // Cross-origin or browser restrictions: keep normal behavior.
    }

    return opened;
  }) as typeof window.open;

  return () => {
    window.open = originalOpen as typeof window.open;
  };
}

// Apply login/PIN defaults before the first page interaction.
if (typeof window !== 'undefined') {
  updateStoredSettings();
}

export default function FaiFaiBranding() {
  useEffect(() => {
    updateStoredSettings();
    updateDocumentMetadata();
    replaceNodeText(document.body);

    const restoreOpen = patchPrintWindows();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const textNode = node as Text;
            const current = textNode.nodeValue || '';
            const next = replaceBrandText(current);
            if (current !== next) textNode.nodeValue = next;
          } else if (node instanceof HTMLElement) {
            replaceNodeText(node);
          }
        });
      });
      updateDocumentMetadata();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      restoreOpen();
    };
  }, []);

  return null;
}
