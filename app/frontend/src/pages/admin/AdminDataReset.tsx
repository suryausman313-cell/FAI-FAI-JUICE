import { useState } from 'react';
import { Database } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client } from '@/lib/api';

const actions = [
  {
    label: 'Reset Orders',
    description: 'Delete all orders and delivery assignments',
    resetType: 'orders',
    icon: '📦',
  },
  {
    label: 'Reset Sales / Revenue',
    description: 'Delete all sales data by clearing orders',
    resetType: 'sales',
    icon: '💰',
  },
  {
    label: 'Reset Menu',
    description: 'Delete all menu items, categories and extras',
    resetType: 'menu',
    icon: '🍕',
  },
  {
    label: 'Reset Customers',
    description: 'Delete customer sessions and registration data',
    resetType: 'customers',
    icon: '👥',
  },
  {
    label: 'Reset Rider History',
    description: 'Delete rider delivery assignments',
    resetType: 'rider_history',
    icon: '🛵',
  },
  {
    label: 'Reset Feedback',
    description: 'Delete customer feedback and reviews',
    resetType: 'feedback',
    icon: '⭐',
  },
  {
    label: 'Reset Activity Logs',
    description: 'Delete all admin activity logs',
    resetType: 'activity_logs',
    icon: '📋',
  },
  {
    label: 'Reset Notifications',
    description: 'Delete all notifications',
    resetType: 'notifications',
    icon: '🔔',
  },
];

export default function AdminDataReset() {
  return (
    <AdminSettingsPageLayout
      title="Data Reset"
      subtitle="Every reset is separate and requires confirmation"
    >
      <Card className="bg-red-950/20 border-red-900/50 p-5 mb-5">
        <div className="flex gap-3">
          <Database className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">
            These actions cannot be undone. Use them only after checking
            which data will be removed.
          </p>
        </div>
      </Card>

      <div className="space-y-3">
        {actions.map(action => (
          <ResetButton key={action.resetType} {...action} />
        ))}

        <div className="pt-4 border-t border-red-900/40">
          <ResetButton
            label="Reset ALL Data"
            description="Delete everything except admin accounts, settings, riders, deals and offers"
            resetType="all"
            icon="🗑️"
            isDanger
          />
        </div>
      </div>
    </AdminSettingsPageLayout>
  );
}

function ResetButton({
  label,
  description,
  resetType,
  icon,
  isDanger = false,
}: {
  label: string;
  description: string;
  resetType: string;
  icon: string;
  isDanger?: boolean;
}) {
  const [resetting, setResetting] = useState(false);

  async function reset() {
    const phrase = isDanger ? 'RESET ALL' : 'RESET';
    const entered = window.prompt(
      `${label}\n\n${description}\n\nType ${phrase} to continue:`,
      '',
    );

    if (entered !== phrase) {
      if (entered !== null) toast.error('Confirmation text did not match');
      return;
    }

    setResetting(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/admin/reset-data',
        method: 'POST',
        data: { reset_type: resetType },
      });

      if (resetType === 'orders' || resetType === 'sales' || resetType === 'all') {
        localStorage.removeItem('deleted_orders');
      }
      if (resetType === 'customers' || resetType === 'all') {
        localStorage.removeItem('customer_session_id');
        localStorage.removeItem('customer_info');
      }
      if (resetType === 'feedback' || resetType === 'all') {
        localStorage.removeItem('vita_reviewed_orders');
      }
      if (resetType === 'rider_history' || resetType === 'all') {
        localStorage.removeItem('rider_auth');
        localStorage.removeItem('rider_notifications');
      }
      if (resetType === 'all') {
        const keys: string[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (
            key &&
            (key.startsWith('vita_') || key.startsWith('rider_'))
          ) {
            keys.push(key);
          }
        }
        keys.forEach(key => localStorage.removeItem(key));
      }

      toast.success(`${label} completed`);
    } catch (error: any) {
      toast.error(
        error?.data?.detail ||
          error?.response?.data?.detail ||
          `Could not ${label.toLowerCase()}`,
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card
      className={`p-4 ${
        isDanger
          ? 'bg-red-950/40 border-red-700'
          : 'bg-gray-900 border-gray-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <p
            className={`font-medium ${
              isDanger ? 'text-red-300' : 'text-white'
            }`}
          >
            {label}
          </p>
          <p className="text-gray-500 text-xs mt-1">{description}</p>
        </div>
        <Button
          size="sm"
          disabled={resetting}
          onClick={() => void reset()}
          className={
            isDanger
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }
        >
          {resetting ? '...' : 'Reset'}
        </Button>
      </div>
    </Card>
  );
}
