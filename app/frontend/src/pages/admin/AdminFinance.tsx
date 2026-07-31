import { useEffect, useState } from 'react';
import {
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Code2,
  Percent,
  RefreshCw,
  ShoppingBag,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { client } from '@/lib/api';

type Period =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'custom';

interface Summary {
  period: { label: string };
  totals: Record<string, number>;
  current_balance: Record<string, number>;
}

interface Submission {
  id: number;
  rider_name: string;
  rider_phone: string;
  amount: number;
  rider_note: string;
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

export default function AdminFinance() {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([loadSummary('today'), loadSubmissions()]).finally(
      () => setLoading(false),
    );
  }, []);

  async function loadSummary(selected: Period = period) {
    const params = new URLSearchParams({ period: selected });
    if (selected === 'custom') {
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
    }

    try {
      const response = await client.apiCall.invoke({
        url: `/api/v1/finance/admin/summary?${params.toString()}`,
        method: 'GET',
        data: {},
      });
      setSummary(response.data);
    } catch (error: any) {
      toast.error(
        error?.data?.detail ||
          error?.response?.data?.detail ||
          'Could not load finance report',
      );
    }
  }

  async function loadSubmissions() {
    try {
      const response = await client.apiCall.invoke({
        url:
          '/api/v1/finance/admin/cash-submissions' +
          '?status=pending&limit=100',
        method: 'GET',
        data: {},
      });
      setSubmissions(response.data?.items || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function review(
    submission: Submission,
    status: 'approved' | 'rejected',
  ) {
    if (
      !window.confirm(
        `${status.toUpperCase()} AED ${money(submission.amount)} from ${
          submission.rider_name
        }?`,
      )
    ) {
      return;
    }

    setReviewingId(submission.id);
    try {
      await client.apiCall.invoke({
        url: `/api/v1/finance/admin/cash-submissions/${submission.id}`,
        method: 'PUT',
        data: {
          status,
          admin_note: '',
          reviewed_by: 'Admin',
        },
      });
      toast.success(`Cash ${status}`);
      await Promise.all([loadSummary(period), loadSubmissions()]);
    } catch (error: any) {
      toast.error(error?.data?.detail || 'Could not review cash');
    } finally {
      setReviewingId(null);
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
      subtitle="Sales, developer fees, rider earnings and cash settlement"
      backTo="/admin/dashboard"
      maxWidth="max-w-6xl"
    >
      {loading ? (
        <p className="text-gray-400">Loading finance...</p>
      ) : (
        <div className="space-y-5">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex flex-wrap gap-2">
              {periods.map(item => (
                <Button
                  key={item.key}
                  size="sm"
                  variant={period === item.key ? 'default' : 'outline'}
                  onClick={() => {
                    setPeriod(item.key);
                    if (item.key !== 'custom') {
                      void loadSummary(item.key);
                    }
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
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map(([title, value, color]) => (
              <Card
                key={title}
                className="bg-gray-900 border-gray-800 p-4"
              >
                <p className="text-gray-500 text-xs">{title}</p>
                <p className={`font-bold mt-1 ${color}`}>
                  AED {money(value)}
                </p>
              </Card>
            ))}
          </div>

          <Card className="bg-gray-900 border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold">
                  Rider Cash Approval
                </h2>
                <p className="text-gray-500 text-xs mt-1">
                  Submitted cash remains pending until Admin approves
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void Promise.all([
                    loadSummary(period),
                    loadSubmissions(),
                  ])
                }
                className="border-gray-700 text-gray-400"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {submissions.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-9 h-9 text-green-700 mx-auto mb-2" />
                <p className="text-gray-400">
                  No cash waiting for approval
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {submissions.map(submission => (
                  <Card
                    key={submission.id}
                    className="bg-gray-950 border-gray-800 p-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="flex-1">
                        <p className="text-white font-semibold">
                          {submission.rider_name}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {submission.rider_phone}
                        </p>
                        {submission.rider_note && (
                          <p className="text-gray-400 text-xs mt-1">
                            {submission.rider_note}
                          </p>
                        )}
                      </div>

                      <p className="text-orange-300 font-bold text-lg">
                        AED {money(submission.amount)}
                      </p>

                      <Button
                        size="sm"
                        disabled={reviewingId === submission.id}
                        onClick={() =>
                          void review(submission, 'approved')
                        }
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewingId === submission.id}
                        onClick={() =>
                          void review(submission, 'rejected')
                        }
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
        </div>
      )}
    </AdminSettingsPageLayout>
  );
}
