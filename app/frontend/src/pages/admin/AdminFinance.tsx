
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAPIBaseURL } from '@/lib/config';
import {
  AdminPushState,
  disableAdminPush,
  enableAdminPush,
  getAdminPushState,
  getStoredAdminPushPreferences,
  scanAdminPushEventsNow,
  sendAdminPushTest,
  updateAdminPushPreferences,
} from '@/lib/admin-push';

type Period =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'custom';

interface Summary {
  period: {
    key: Period;
    label: string;
    date_from?: string | null;
    date_to?: string | null;
  };
  totals: Record<string, number>;
  current_balance: Record<string, number>;
  settlements?: Record<string, number>;
}

interface Submission {
  id: number;
  rider_id: number;
  rider_name: string;
  rider_phone: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  rider_note: string;
  admin_note: string;
  submitted_at: string | null;
}

const periods: Array<{ key: Period; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' },
];

function money(value: unknown): string {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-AE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getAPIBaseURL()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('fai_fai_admin_token') || ''}`,
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Admin finance request failed');
  }
  return data as T;
}

export default function AdminFinance() {
  const today = new Date().toISOString().slice(0, 10);
  const initialPreferences = useMemo(getStoredAdminPushPreferences, []);

  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const [pushState, setPushState] = useState<AdminPushState>({
    supported: true,
    permission: 'default',
    subscribed: false,
    cashEnabled: initialPreferences.cashEnabled,
    readyEnabled: initialPreferences.readyEnabled,
  });
  const [pushWorking, setPushWorking] = useState(false);

  useEffect(() => {
    void Promise.all([
      loadSummary('today'),
      loadSubmissions(),
      refreshPushState(),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const cashTimer = window.setInterval(() => {
      void loadSubmissions(true);
      void scanAdminPushEventsNow().catch(() => undefined);
    }, 8000);

    const summaryTimer = window.setInterval(() => {
      if (period !== 'custom') {
        void loadSummary(period, true);
      }
    }, 20000);

    return () => {
      window.clearInterval(cashTimer);
      window.clearInterval(summaryTimer);
    };
  }, [period]);

  async function refreshPushState() {
    try {
      setPushState(await getAdminPushState());
    } catch (error: any) {
      console.error('Could not inspect Admin push state:', error);
    }
  }

  async function loadSummary(selected: Period = period, silent = false) {
    if (selected === 'custom' && (!dateFrom || !dateTo)) {
      toast.error('Select both custom dates');
      return;
    }

    if (!silent) setFinanceLoading(true);
    const params = new URLSearchParams({ period: selected });
    if (selected === 'custom') {
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
    }

    try {
      const data = await apiRequest<Summary>(
        `/api/v1/finance/admin/summary?${params.toString()}`,
      );
      setSummary(data);
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Could not load finance report');
    } finally {
      if (!silent) setFinanceLoading(false);
    }
  }

  async function loadSubmissions(silent = false) {
    try {
      const data = await apiRequest<{ items: Submission[] }>(
        '/api/v1/finance/admin/cash-submissions?status=pending&limit=100',
      );
      setSubmissions(data.items || []);
    } catch (error: any) {
      if (!silent) toast.error(error?.message || 'Could not load rider cash requests');
    }
  }

  function adminName(): string {
    try {
      const auth = JSON.parse(localStorage.getItem('admin_auth') || '{}');
      return auth.name || auth.username || auth.email || 'Admin';
    } catch {
      return 'Admin';
    }
  }

  async function review(
    submission: Submission,
    status: 'approved' | 'rejected',
  ) {
    const verb = status === 'approved' ? 'APPROVE' : 'REJECT';
    if (
      !window.confirm(
        `${verb} AED ${money(submission.amount)} from ${submission.rider_name}?`,
      )
    ) {
      return;
    }

    const note =
      window.prompt(
        status === 'approved' ? 'Optional Admin note:' : 'Reason for rejection:',
        '',
      ) || '';

    setReviewingId(submission.id);
    try {
      await apiRequest(
        `/api/v1/finance/admin/cash-submissions/${submission.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            status,
            admin_note: note,
            reviewed_by: adminName(),
          }),
        },
      );
      toast.success(status === 'approved' ? 'Rider cash approved' : 'Rider cash rejected');
      await Promise.all([loadSummary(period), loadSubmissions()]);
    } catch (error: any) {
      toast.error(error?.message || 'Could not review rider cash');
    } finally {
      setReviewingId(null);
    }
  }

  async function handleEnablePush() {
    setPushWorking(true);
    try {
      const state = await enableAdminPush({
        cashEnabled: pushState.cashEnabled,
        readyEnabled: pushState.readyEnabled,
      });
      setPushState(state);
      toast.success('Admin background notifications enabled');
      await scanAdminPushEventsNow();
    } catch (error: any) {
      toast.error(error?.message || 'Could not enable notifications');
    } finally {
      setPushWorking(false);
    }
  }

  async function handleDisablePush() {
    setPushWorking(true);
    try {
      setPushState(await disableAdminPush());
      toast.success('Admin background notifications disabled');
    } catch (error: any) {
      toast.error(error?.message || 'Could not disable notifications');
    } finally {
      setPushWorking(false);
    }
  }

  async function changePreference(
    key: 'cashEnabled' | 'readyEnabled',
    enabled: boolean,
  ) {
    const preferences = {
      cashEnabled: key === 'cashEnabled' ? enabled : pushState.cashEnabled,
      readyEnabled: key === 'readyEnabled' ? enabled : pushState.readyEnabled,
    };

    setPushState(current => ({ ...current, ...preferences }));
    try {
      const state = await updateAdminPushPreferences(preferences);
      setPushState(state);
    } catch (error: any) {
      toast.error(error?.message || 'Could not save notification setting');
      await refreshPushState();
    }
  }

  async function handlePushTest() {
    setPushWorking(true);
    try {
      const sent = await sendAdminPushTest();
      toast.success(`Test notification sent to ${sent} Admin device(s)`);
    } catch (error: any) {
      toast.error(error?.message || 'Test notification failed');
    } finally {
      setPushWorking(false);
    }
  }

  const totals = summary?.totals || {};
  const balance = summary?.current_balance || {};

  const cards = [
    ['Shop Food Sale', totals.shop_food_sale, 'text-green-300'],
    ['Customer Total', totals.customer_total, 'text-blue-300'],
    ['Menu Discount', totals.discount_amount, 'text-red-300'],
    ['Developer Fees', totals.developer_fees, 'text-yellow-300'],
    ['Service Fee', totals.service_fee, 'text-yellow-300'],
    ['Small-Order Fee', totals.small_order_fee, 'text-yellow-300'],
    ['Delivery Charges', totals.delivery_charges, 'text-cyan-300'],
    ['Rider Tips', totals.rider_tips, 'text-pink-300'],
    ['Rider Earnings', totals.rider_earnings, 'text-blue-300'],
    ['Shop Tips', totals.shop_tips, 'text-purple-300'],
    ['Cash Collected', totals.cash_collected, 'text-green-300'],
    ['Rider Cash Pending', balance.total_pending_cash, 'text-orange-300'],
    ['Awaiting Approval', balance.awaiting_approval, 'text-yellow-300'],
    ['Admin Approved', balance.approved_cash, 'text-green-300'],
    ['Still To Submit', balance.remaining_to_submit, 'text-blue-300'],
  ] as const;

  return (
    <AdminSettingsPageLayout
      title="Finance & Rider Cash"
      subtitle="All shop finance, Rider cash approval and Admin notifications"
      backTo="/admin/dashboard"
      maxWidth="max-w-6xl"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {pushState.subscribed ? (
                  <Bell className="w-5 h-5 text-green-400" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-500" />
                )}
                <h2 className="text-white font-semibold">Admin Push Notifications</h2>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                Rider cash requests and ready delivery orders can alert this Admin device.
              </p>
              <p className="text-xs mt-2">
                <span className={pushState.subscribed ? 'text-green-400' : 'text-orange-400'}>
                  {pushState.subscribed ? 'Enabled on this device' : 'Not enabled on this device'}
                </span>
                {' · '}
                <span className="text-gray-500">Permission: {pushState.permission}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!pushState.subscribed ? (
                <Button
                  onClick={handleEnablePush}
                  disabled={pushWorking || !pushState.supported}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {pushWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
                  Enable Notifications
                </Button>
              ) : (
                <Button
                  onClick={handleDisablePush}
                  disabled={pushWorking}
                  variant="outline"
                  className="border-gray-700 text-gray-300"
                >
                  Disable
                </Button>
              )}

              <Button
                onClick={handlePushTest}
                disabled={pushWorking || !pushState.subscribed}
                variant="outline"
                className="border-gray-700 text-gray-300"
              >
                <Send className="w-4 h-4 mr-2" />
                Test
              </Button>
            </div>
          </div>

          {!pushState.supported && (
            <p className="mt-3 text-sm text-red-400">
              This browser does not support web push notifications.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
            <label className="flex items-center justify-between rounded-xl bg-gray-950 border border-gray-800 p-4 cursor-pointer">
              <div>
                <p className="text-white text-sm font-medium">Rider Cash Requests</p>
                <p className="text-gray-500 text-xs mt-1">Notify when a Rider submits cash</p>
              </div>
              <input
                type="checkbox"
                checked={pushState.cashEnabled}
                onChange={event => void changePreference('cashEnabled', event.target.checked)}
                className="h-5 w-5 accent-green-600"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl bg-gray-950 border border-gray-800 p-4 cursor-pointer">
              <div>
                <p className="text-white text-sm font-medium">Ready Delivery Orders</p>
                <p className="text-gray-500 text-xs mt-1">Notify when Kitchen needs a Rider assignment</p>
              </div>
              <input
                type="checkbox"
                checked={pushState.readyEnabled}
                onChange={event => void changePreference('readyEnabled', event.target.checked)}
                className="h-5 w-5 accent-green-600"
              />
            </label>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="flex flex-wrap gap-2">
            {periods.map(item => (
              <Button
                key={item.key}
                size="sm"
                variant={period === item.key ? 'default' : 'outline'}
                onClick={() => {
                  setPeriod(item.key);
                  if (item.key !== 'custom') void loadSummary(item.key);
                }}
                className={
                  period === item.key
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'border-gray-700 text-gray-400'
                }
              >
                {item.label}
              </Button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mt-4">
              <Input
                type="date"
                value={dateFrom}
                onChange={event => setDateFrom(event.target.value)}
                className="bg-gray-950 border-gray-700 text-white"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={event => setDateTo(event.target.value)}
                className="bg-gray-950 border-gray-700 text-white"
              />
              <Button
                onClick={() => void loadSummary('custom')}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CalendarDays className="w-4 h-4 mr-2" />
                Apply
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 border-t border-gray-800 pt-3">
            <p className="text-gray-500 text-xs">
              {summary?.period?.label || 'Finance period'}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={financeLoading}
              onClick={() => void Promise.all([loadSummary(period), loadSubmissions()])}
              className="text-gray-400"
            >
              <RefreshCw className={`w-4 h-4 ${financeLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading finance...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {cards.map(([title, value, color]) => (
                <Card key={title} className="bg-gray-900 border-gray-800 p-4">
                  <p className="text-gray-500 text-xs">{title}</p>
                  <p className={`font-bold mt-1 ${color}`}>AED {money(value)}</p>
                </Card>
              ))}
            </div>

            <Card className="bg-gray-900 border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white font-semibold">Rider Cash Approval</h2>
                  <p className="text-gray-500 text-xs mt-1">
                    Rider submission stays pending until Admin approves or rejects it.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void Promise.all([loadSummary(period), loadSubmissions()])}
                  className="border-gray-700 text-gray-400"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {submissions.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-9 h-9 text-green-700 mx-auto mb-2" />
                  <p className="text-gray-400">No cash waiting for approval</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissions.map(submission => (
                    <Card key={submission.id} className="bg-gray-950 border-gray-800 p-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1">
                          <p className="text-white font-semibold">{submission.rider_name}</p>
                          <p className="text-gray-500 text-xs">{submission.rider_phone}</p>
                          <p className="text-gray-600 text-xs mt-1">
                            Submitted: {formatDate(submission.submitted_at)}
                          </p>
                          {submission.rider_note && (
                            <p className="text-gray-400 text-xs mt-1">Note: {submission.rider_note}</p>
                          )}
                        </div>

                        <p className="text-orange-300 font-bold text-lg">
                          AED {money(submission.amount)}
                        </p>

                        <Button
                          size="sm"
                          disabled={reviewingId === submission.id}
                          onClick={() => void review(submission, 'approved')}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingId === submission.id}
                          onClick={() => void review(submission, 'rejected')}
                          className="border-red-800 text-red-400"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminSettingsPageLayout>
  );
}
