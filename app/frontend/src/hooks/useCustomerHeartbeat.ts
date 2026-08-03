import { useEffect, useRef } from 'react';
import { client } from '@/lib/api';
import { customerAuthApi } from '@/lib/customer-auth';

/**
 * Tracks ALL visitors to the app - both guests and authenticated users.
 * PERFORMANCE: Defers first heartbeat by 5 seconds to not block initial page render.
 * Then fires every 60 seconds (reduced from 30s).
 */
export function useCustomerHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function getSessionId(): string {
      let sessionId = localStorage.getItem('vita_session_id');
      if (!sessionId) {
        sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem('vita_session_id', sessionId);
      }
      return sessionId;
    }

    async function sendHeartbeat() {
      if (cancelled) return;

      const sessionId = getSessionId();
      const savedName = localStorage.getItem('vita_customer_name') || localStorage.getItem('customer_name') || '';
      const savedPhone = localStorage.getItem('vita_customer_phone') || localStorage.getItem('customer_phone') || '';

      // 1. Always send guest heartbeat (works without auth)
      try {
        await client.apiCall.invoke({
          url: '/api/v1/admin/guest-heartbeat',
          method: 'POST',
          data: {
            session_id: sessionId,
            customer_name: savedName || 'Guest',
            customer_phone: savedPhone || '',
          },
        });
      } catch {
        // Silently fail
      }

      // 2. If user is authenticated, also send authenticated heartbeat
      try {
        const user = customerAuthApi.getSavedCustomer();
        if (!user || cancelled) return;
        await client.apiCall.invoke({
          url: '/api/v1/admin/customer-heartbeat',
          method: 'POST',
          data: {
            customer_name: user.name || savedName || 'Customer',
            customer_email: '',
            customer_phone: user.phone || savedPhone || '',
          },
        });
      } catch {
        // Not logged in - fine
      }
    }

    // DEFER first heartbeat by 5 seconds so it doesn't block page load
    timeoutRef.current = setTimeout(() => {
      if (cancelled) return;
      sendHeartbeat();
      // Then every 60 seconds (reduced from 30s)
      intervalRef.current = setInterval(sendHeartbeat, 60000);
    }, 5000);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
