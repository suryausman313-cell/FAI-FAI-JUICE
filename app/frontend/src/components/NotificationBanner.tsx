import { useEffect, useState, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { client } from '@/lib/api';

interface AppNotification {
  id: number;
  title: string;
  message: string;
}

export default function NotificationBanner() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    // Load dismissed from localStorage immediately (no API call)
    const stored = localStorage.getItem('dismissed_notifications');
    if (stored) {
      try { setDismissed(JSON.parse(stored)); } catch { /* ignore */ }
    }

    // DEFER notification loading by 3 seconds to not block page render
    const timer = setTimeout(() => {
      if (!loadedRef.current) {
        loadedRef.current = true;
        loadNotifications();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  async function loadNotifications() {
    try {
      const res = await client.entities.app_notifications.query({ query: { is_active: true }, sort: '-id', limit: 10 });
      const items = res?.data?.items || res?.items || [];
      setNotifications(items);
    } catch {
      // Silently fail
    }
  }

  function dismiss(id: number) {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem('dismissed_notifications', JSON.stringify(updated));
  }

  const activeNotifications = notifications.filter(n => !dismissed.includes(n.id));

  if (activeNotifications.length === 0) return null;

  const latestNotif = activeNotifications[0];

  return (
    <div className="px-4 pt-3">
      <div className="bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border border-yellow-700/50 rounded-xl p-3 relative">
        <button
          onClick={() => dismiss(latestNotif.id)}
          className="absolute top-2 right-2 text-gray-400 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="w-8 h-8 rounded-full bg-yellow-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bell className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-semibold text-sm">{latestNotif.title}</h4>
            <p className="text-gray-300 text-xs mt-0.5">{latestNotif.message}</p>
          </div>
        </div>

        {activeNotifications.length > 1 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-yellow-400 text-xs mt-2 ml-11 hover:underline cursor-pointer"
          >
            {showAll ? 'Hide' : `+${activeNotifications.length - 1} more notification${activeNotifications.length - 1 > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {showAll && activeNotifications.length > 1 && (
        <div className="mt-2 space-y-2">
          {activeNotifications.slice(1).map(notif => (
            <div key={notif.id} className="bg-gray-900/80 border border-gray-800 rounded-lg p-3 relative">
              <button
                onClick={() => dismiss(notif.id)}
                className="absolute top-2 right-2 text-gray-500 hover:text-white cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="flex items-start gap-2 pr-5">
                <Bell className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="text-white text-xs font-semibold">{notif.title}</h5>
                  <p className="text-gray-400 text-xs">{notif.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}