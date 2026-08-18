import { ReactNode, useEffect } from 'react';
import { useCustomerHeartbeat } from '@/hooks/useCustomerHeartbeat';
import { ensureCustomerPushOnAppOpen } from '@/lib/customer-push';

export function CustomerHeartbeatProvider({ children }: { children: ReactNode }) {
  useCustomerHeartbeat();

  useEffect(() => {
    let timer: number | null = null;

    const ensureNotifications = () => {
      const path = window.location.pathname.toLowerCase();
      if (
        path.startsWith('/admin') ||
        path.startsWith('/kitchen') ||
        path.startsWith('/rider') ||
        path.startsWith('/track/')
      ) {
        return;
      }

      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void ensureCustomerPushOnAppOpen().catch((error) => {
          // Notifications must never block the customer app from opening.
          console.debug('Customer notification startup sync skipped:', error);
        });
      }, 700);
    };

    // Existing logged-in customer: check once whenever the app opens.
    ensureNotifications();
    // New login/signup in this same tab: check once after auth session is saved.
    window.addEventListener('customer-auth-changed', ensureNotifications);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('customer-auth-changed', ensureNotifications);
    };
  }, []);

  return <>{children}</>;
}
