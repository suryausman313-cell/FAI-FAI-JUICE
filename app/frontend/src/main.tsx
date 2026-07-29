import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRuntimeConfig } from './lib/config.ts';

function setCorrectManifest() {
  const path = window.location.pathname.toLowerCase();

  let manifestPath = '/manifest.json';
  let themeColor = '#dc2626';

  if (path.startsWith('/admin')) {
    manifestPath = '/manifest-admin.json';
  } else if (path.startsWith('/kitchen')) {
    manifestPath = '/manifest-kitchen.json';
  } else if (path.startsWith('/rider')) {
    manifestPath = '/manifest-rider.json';
  }

  // Purana manifest remove karo
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')
    .forEach((link) => link.remove());

  // Sahi manifest add karo
  const manifestLink = document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = manifestPath;
  document.head.appendChild(manifestLink);

  // Theme color bhi ensure karo
  let themeMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );

  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    document.head.appendChild(themeMeta);
  }

  themeMeta.content = themeColor;

  console.log(`Manifest loaded: ${manifestPath}`);
}

// Load runtime configuration before rendering the app
async function initializeApp() {
  // URL ke hisaab se sahi app manifest load karo
  setCorrectManifest();

  // Prerendered blog pages are served as pure static HTML for SEO.
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  try {
    await loadRuntimeConfig();
    console.log('Runtime configuration loaded successfully');
  } catch (error) {
    console.warn(
      'Failed to load runtime configuration, using defaults:',
      error
    );
  }

  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element not found');
  }

  createRoot(rootElement).render(<App />);
}

// Initialize the app
initializeApp();
