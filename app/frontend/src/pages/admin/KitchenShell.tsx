import { ComponentType, useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  History,
  UtensilsCrossed,
} from 'lucide-react';

import KitchenHistoryPanel from './KitchenHistoryPanel';
import KitchenMenuPanel from './KitchenMenuPanel';
import KitchenOrders from './KitchenOrders';

type KitchenTab = 'live' | 'today' | 'yesterday' | 'menu';

const HistoryPanel =
  KitchenHistoryPanel as ComponentType<Record<string, unknown>>;

const tabs: Array<{
  key: KitchenTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    key: 'live',
    label: 'Live Orders',
    icon: ClipboardList,
  },
  {
    key: 'today',
    label: 'Today',
    icon: CalendarDays,
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    icon: History,
  },
  {
    key: 'menu',
    label: 'Menu',
    icon: UtensilsCrossed,
  },
];

export default function KitchenShell() {
  const [activeTab, setActiveTab] =
    useState<KitchenTab>('live');

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/95 px-2 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-4 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-[10px] font-semibold transition-colors sm:flex-row sm:text-xs ${
                  active
                    ? 'bg-yellow-500 text-black'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />

                <span className="truncate">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'live' && (
        <KitchenOrders />
      )}

      {activeTab === 'today' && (
        <HistoryPanel
          period="today"
          day="today"
          mode="today"
          dateFilter="today"
        />
      )}

      {activeTab === 'yesterday' && (
        <HistoryPanel
          period="yesterday"
          day="yesterday"
          mode="yesterday"
          dateFilter="yesterday"
        />
      )}

      {activeTab === 'menu' && (
        <KitchenMenuPanel />
      )}
    </div>
  );
}
