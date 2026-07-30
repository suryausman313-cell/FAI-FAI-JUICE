const SESSION_KEY = 'vita_session_id';

/**
 * Stable anonymous customer ID used for guest checkout and order history.
 * No login is required. The ID stays only in this browser/app installation.
 */
export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (sessionId) return sessionId;

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  sessionId = `${Date.now()}_${randomPart.slice(0, 24)}`;
  localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}
