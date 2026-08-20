import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadRuntimeConfig } from './lib/config.ts';
import FaiFaiBranding from './components/FaiFaiBranding';

// Customer PWA should feel like an installed app, not a selectable web page.
// Keep normal text selection inside form fields only. Admin/kitchen/rider pages are excluded.
function installCustomerAppInteractionGuards() {
  const isCustomerPath = () => !/^\/(?:admin|kitchen|rider)(?:\/|$)/i.test(window.location.pathname);

  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
  };

  const preventCustomerContextMenu = (event: Event) => {
    if (!isCustomerPath() || isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('contextmenu', preventCustomerContextMenu, { passive: false });
  document.addEventListener('selectstart', preventCustomerContextMenu, { passive: false });
  document.addEventListener('dragstart', preventCustomerContextMenu, { passive: false });

  // Android Chrome/WebView can still create a selection toolbar after a long press
  // even when CSS user-select is disabled. Clear that selection immediately on
  // customer pages, while keeping text editing normal inside form controls.
  document.addEventListener('selectionchange', () => {
    if (!isCustomerPath()) return;
    const active = document.activeElement;
    if (isEditableTarget(active)) return;
    const selection = window.getSelection?.();
    if (selection && selection.rangeCount > 0) selection.removeAllRanges();
  });

  document.documentElement.style.overscrollBehaviorY = 'none';
  document.body.style.overscrollBehaviorY = 'none';
}

installCustomerAppInteractionGuards();

async function initializeApp() {
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
      error,
    );
  }

  createRoot(document.getElementById('root')!).render(
    <>
      <FaiFaiBranding />
      <App />
    </>,
  );
}

void initializeApp();
