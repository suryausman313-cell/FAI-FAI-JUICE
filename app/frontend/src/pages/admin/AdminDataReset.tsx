import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  Database,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  loadResetPreview,
  readAdminSession,
  ResetPreview,
  runDataReset,
} from '@/lib/admin-control';

interface ResetOption {
  key: string;
  title: string;
  description: string;
  confirmation: string;
  icon: typeof ShoppingBag;
  danger?: boolean;
}

const RESET_OPTIONS: ResetOption[] = [
  {
    key: 'orders',
    title: 'Reset Orders',
    description: 'Delete all orders, delivery assignments and related order records',
    confirmation: 'RESET ORDERS',
    icon: ShoppingBag,
  },
  {
    key: 'sales',
    title: 'Reset Sales / Revenue',
    description: 'Delete orders and related finance history because sales come from orders',
    confirmation: 'RESET SALES',
    icon: Wallet,
  },
  {
    key: 'menu',
    title: 'Reset Menu',
    description: 'Delete all menu items, categories and extras. Fai Fai menu must be installed again after this.',
    confirmation: 'RESET MENU',
    icon: UtensilsCrossed,
  },
  {
    key: 'customers',
    title: 'Reset Customers',
    description: 'Delete customer sessions and visitor records',
    confirmation: 'RESET CUSTOMERS',
    icon: Users,
  },
  {
    key: 'rider_history',
    title: 'Reset Rider History',
    description: 'Delete rider deliveries and rider cash history, but keep rider accounts',
    confirmation: 'RESET RIDER HISTORY',
    icon: Truck,
  },
  {
    key: 'feedback',
    title: 'Reset Feedback',
    description: 'Delete customer feedback and reviews',
    confirmation: 'RESET FEEDBACK',
    icon: MessageSquare,
  },
  {
    key: 'activity_logs',
    title: 'Reset Activity Logs',
    description: 'Delete all admin activity history',
    confirmation: 'RESET ACTIVITY LOGS',
    icon: ClipboardList,
  },
  {
    key: 'notifications',
    title: 'Reset Notifications',
    description: 'Delete customer and app notifications',
    confirmation: 'RESET NOTIFICATIONS',
    icon: Bell,
  },
  {
    key: 'all',
    title: 'Reset ALL Data',
    description: 'Delete orders, sales, customers, rider history, feedback, logs and notifications. Keep menu, settings, riders, deals, offers and admin accounts.',
    confirmation: 'RESET ALL DATA',
    icon: Trash2,
    danger: true,
  },
];

function tableLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function AdminDataReset() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [selected, setSelected] = useState<ResetOption | null>(null);
  const [confirmation, setConfirmation] = useState('');

  const session = useMemo(() => readAdminSession(), []);

  useEffect(() => {
    if (!session) {
      navigate('/admin');
      return;
    }
    if (session.role !== 'super_admin') {
      toast.error('Sirf Super Admin data reset kar sakta hai');
      navigate('/admin/dashboard');
      return;
    }
    void loadPreview();
  }, [navigate, session]);

  async function loadPreview() {
    setLoading(true);
    try {
      setPreview(await loadResetPreview());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Reset data check nahi hua',
      );
    } finally {
      setLoading(false);
    }
  }

  function openReset(option: ResetOption) {
    setSelected(option);
    setConfirmation('');
  }

  function clearBrowserCache(resetType: string) {
    const removeKeys = new Set<string>();

    if (['orders', 'sales', 'all'].includes(resetType)) {
      [
        'vita_cart',
        'vita_orders',
        'vita_last_order',
        'vita_order_submitted',
        'deleted_orders',
      ].forEach((key) => removeKeys.add(key));
    }

    if (['customers', 'all'].includes(resetType)) {
      [
        'vita_customer_name',
        'vita_customer_phone',
        'vita_session_id',
      ].forEach((key) => removeKeys.add(key));
    }

    if (['menu', 'all'].includes(resetType)) {
      ['vita_cart', 'vita_menu_cache', 'menu_cache'].forEach((key) =>
        removeKeys.add(key),
      );
    }

    if (['feedback', 'all'].includes(resetType)) {
      removeKeys.add('vita_reviewed_orders');
    }

    if (['rider_history', 'all'].includes(resetType)) {
      removeKeys.add('rider_notifications');
    }

    removeKeys.forEach((key) => localStorage.removeItem(key));
  }

  async function confirmReset() {
    if (!selected) return;

    if (confirmation.trim().toUpperCase() !== selected.confirmation) {
      toast.error(`Type "${selected.confirmation}" exactly`);
      return;
    }

    setResetting(true);
    try {
      const result = await runDataReset(
        selected.key,
        confirmation.trim(),
      );
      clearBrowserCache(selected.key);
      toast.success(
        `${result.message} Deleted rows: ${result.deleted_rows}`,
      );
      setSelected(null);
      setConfirmation('');
      await loadPreview();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Data reset failed',
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/settings')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Data Reset</h1>
            <p className="text-gray-500 text-sm">
              Har reset separate hai aur exact confirmation mangta hai
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={() => void loadPreview()}
            disabled={loading}
            className="text-gray-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Card className="bg-red-950/20 border-red-900/40 p-4 mb-5">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <p className="text-red-200 text-sm font-semibold">
                These actions cannot be undone
              </p>
              <p className="text-red-300/60 text-xs mt-1">
                Button ke neeche real database rows ka count show hota hai. Reset se pehle check karo.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {RESET_OPTIONS.map((option) => {
            const Icon = option.icon;
            const details = preview?.resets?.[option.key];
            const tables = details?.tables || {};

            return (
              <Card
                key={option.key}
                className={`p-4 ${
                  option.danger
                    ? 'bg-red-950/30 border-red-800/50 mt-6'
                    : 'bg-gray-900 border-gray-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      option.danger ? 'bg-red-500/15' : 'bg-gray-800'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        option.danger ? 'text-red-400' : 'text-gray-300'
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold ${
                        option.danger ? 'text-red-300' : 'text-white'
                      }`}
                    >
                      {option.title}
                    </p>
                    <p className="text-gray-500 text-xs mt-1 leading-5">
                      {option.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {Object.entries(tables)
                        .filter(([, count]) => count > 0)
                        .map(([table, count]) => (
                          <span
                            key={table}
                            className="text-[10px] px-2 py-1 rounded-lg bg-gray-950 text-gray-400"
                          >
                            {tableLabel(table)}: {count}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-gray-500 text-[10px] uppercase">
                      Rows
                    </p>
                    <p
                      className={`text-xl font-black ${
                        option.danger ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {loading ? '…' : details?.rows || 0}
                    </p>
                    <Button
                      onClick={() => openReset(option)}
                      disabled={loading || resetting}
                      className={`mt-2 ${
                        option.danger
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !resetting) {
            setSelected(null);
            setConfirmation('');
          }
        }}
      >
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-300">
              Confirm {selected?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-gray-400 text-sm leading-6">
              Ye data permanently delete hoga. Confirm karne ke liye neeche exact text likho:
            </p>

            <div className="rounded-xl bg-gray-950 border border-red-900/40 px-3 py-3 text-center text-red-300 font-mono font-bold">
              {selected?.confirmation}
            </div>

            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={selected?.confirmation}
              className="bg-gray-950 border-gray-700 text-white font-mono"
              autoFocus
            />

            <Button
              onClick={() => void confirmReset()}
              disabled={
                resetting ||
                confirmation.trim().toUpperCase() !==
                  selected?.confirmation
              }
              className="w-full h-12 bg-red-600 hover:bg-red-500"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {resetting ? 'Deleting...' : 'Permanently Reset'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
