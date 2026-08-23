// Runtime configuration. The app always has a usable production fallback, so
// loading /api/config must never delay the first screen.
let runtimeConfig: { API_BASE_URL: string } | null = null;

const defaultConfig = {
  API_BASE_URL: 'https://vita-napoli-backend-usman.onrender.com',
};

export async function loadRuntimeConfig(): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch('/api/config', {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return;

    const data = await response.json();
    const apiBaseUrl = String(data?.API_BASE_URL || '').trim();
    if (apiBaseUrl) runtimeConfig = { API_BASE_URL: apiBaseUrl };
  } catch {
    // Defaults stay active when runtime config is slow or unavailable.
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getConfig() {
  if (runtimeConfig) return runtimeConfig;

  if (import.meta.env.VITE_API_BASE_URL) {
    return { API_BASE_URL: import.meta.env.VITE_API_BASE_URL };
  }

  return defaultConfig;
}

export function getAPIBaseURL(): string {
  return getConfig().API_BASE_URL;
}

export const config = {
  get API_BASE_URL() {
    return getAPIBaseURL();
  },
};
