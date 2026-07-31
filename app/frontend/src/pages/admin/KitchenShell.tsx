import { useState } from 'react';
import { CalendarDays, ChefHat, Clock3 } from 'lucide-react';

import KitchenOrders from './KitchenOrders';
import KitchenHistoryPanel from './KitchenHistoryPanel';

type KitchenTab = 'live' | 'today' | 'yesterday';

export default function KitchenShell() {
  const [tab, setTab] = useState<KitchenTab>('live');

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-3 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTab('live')}
              className={`rounded-xl px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                tab === 'live'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-900 text-gray-400 border border-gray-800'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              Live Orders
            </button>

            <button
              type="button"
              onClick={() => setTab('today')}
              className={`rounded-xl px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                tab === 'today'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-900 text-gray-400 border border-gray-800'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Today
            </button>

            <button
              type="button"
              onClick={() => setTab('yesterday')}
              className={`rounded-xl px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                tab === 'yesterday'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-400 border border-gray-800'
              }`}
            >
              <Clock3 className="w-4 h-4" />
              Yesterday
            </button>
          </div>
        </div>
      </div>

      {tab === 'live' ? (
        <KitchenOrders />
      ) : (
        <KitchenHistoryPanel day={tab} />
      )}
    </div>
  );
}
