import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Download,
  PackageCheck,
  Percent,
  RefreshCw,
  Search,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAPIBaseURL } from '@/lib/config';

type FinancePeriod =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'thirty_days'
  | 'six_months'
  | 'custom';

interface FinanceTotals {
  orders: number;
  delivered_orders: number;
  customer_total: number;
  food_subtotal: number;
  discount_amount: number;
  shop_food_sale: number;
  service_fee: number;
  small_order_fee: number;
  developer_fees: number;
  delivery_charges: number;
  rider_tips: number;
  shop_tips: number;
  rider_earnings: number;
  cash_collected: number;
  cash_payable_to_shop: number;
  cash_orders: number;
  card_orders: number;
}

interface FinanceSummary {
  period: {
    key: FinancePeriod;
    label: string;
    date_from: string | null;
    date_to: string | null;
  };
  totals: FinanceTotals;
  settlements?: {
    approved_cash: number;
    awaiting_approval: number;
    rejected_cash: number;
    submissions: number;
  };
  current_balance?: {
    cash_due_to_shop: number;
    approved_cash: number;
    awaiting_approval: number;
    remaining_to_submit: number;
    total_pending_cash: number;
  };
}

interface ReportOrder {
  id: number | string;
  customer_name?: string;
  customer_phone?: string;
  payment_method?: string;
  status?: string;
  order_type?: string;
  total_amount?: number;
  subtotal_amount?: number;
  discount_amount?: number;
  service_fee?: number;
  small_order_fee?: number;
  delivery_charge?: number;
  tip_amount?: number;
  tip_type?: string;
  rider_name?: string;
  items_json?: string;
  created_at?: string;
}

interface DailyPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
}

const PERIODS: Array<{ key: FinancePeriod; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days' },
  { key: 'thirty_days', label: 'Last 30 Days' },
  { key: 'six_months', label: 'Last 6 Months' },
  { key: 'custom', label: 'Custom' },
];

const EMPTY_TOTALS: FinanceTotals = {
  orders: 0,
  delivered_orders: 0,
  customer_total: 0,
  food_subtotal: 0,
  discount_amount: 0,
  shop_food_sale: 0,
  service_fee: 0,
  small_order_fee: 0,
  developer_fees: 0,
  delivery_charges: 0,
  rider_tips: 0,
  shop_tips: 0,
  rider_earnings: 0,
  cash_collected: 0,
  cash_payable_to_shop: 0,
  cash_orders: 0,
  card_orders: 0,
};

function money(value: unknown): string {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function numeric(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function localDateInput(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function shiftMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const wantedDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(wantedDay, lastDay));
  return result;
}

function orderGrossSales(order: ReportOrder): number {
  return Math.max(
    numeric(order.total_amount) -
      numeric(order.delivery_charge) -
      numeric(order.tip_amount),
    0,
  );
}

function isCountedOrder(order: ReportOrder): boolean {
  const status = String(order.status || '').toLowerCase();
  return status === 'completed';
}

function isCashPayment(method: string | undefined): boolean {
  return String(method || '').toLowerCase().includes('cash');
}

function formatDate(value: string | undefined): string {
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

function dateKey(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AdminSales() {
  const navigate = useNavigate();

  const [period, setPeriod] = useState<FinancePeriod>('today');
  const [customFrom, setCustomFrom] = useState(
    () => localDateInput(new Date()),
  );
  const [customTo, setCustomTo] = useState(
    () => localDateInput(new Date()),
  );
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('admin_auth') || '{}');
      if (!auth.loggedIn) {
        navigate('/admin');
        return;
      }
    } catch {
      navigate('/admin');
      return;
    }

    void loadData();
  }, []);

  useEffect(() => {
    if (period === 'custom') return;
    void loadData(true);
  }, [period]);

  function summaryUrl(): string {
    const today = new Date();
    let apiPeriod: string = period;
    let dateFrom = customFrom;
    let dateTo = customTo;

    if (period === 'week') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      apiPeriod = 'custom';
      dateFrom = localDateInput(start);
      dateTo = localDateInput(today);
    } else if (period === 'thirty_days') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      apiPeriod = 'custom';
      dateFrom = localDateInput(start);
      dateTo = localDateInput(today);
    } else if (period === 'six_months') {
      apiPeriod = 'custom';
      dateFrom = localDateInput(shiftMonths(today, -6));
      dateTo = localDateInput(today);
    }

    const params = new URLSearchParams({ period: apiPeriod });
    if (apiPeriod === 'custom') {
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
    }
    return `/api/v1/finance/admin/summary?${params.toString()}`;
  }

  async function loadData(silent = false): Promise<void> {
    if (period === 'custom' && (!customFrom || !customTo)) {
      toast.error('Select both custom dates');
      return;
    }

    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const baseURL = getAPIBaseURL().replace(/\/$/, '');
      const token = localStorage.getItem('fai_fai_admin_token') || '';
      const adminHeaders = { Authorization: `Bearer ${token}` };
      const [summaryResult, ordersResult] = await Promise.allSettled([
        axios.get(`${baseURL}${summaryUrl()}`, {
          headers: adminHeaders,
          timeout: 20000,
        }),
        axios.get(`${baseURL}/api/v1/admin/orders`, {
          params: { sort: '-created_at', limit: 2000 },
          headers: adminHeaders,
          timeout: 20000,
        }),
      ]);

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data as FinanceSummary);
      } else {
        console.error('Finance summary failed:', summaryResult.reason);
        toast.error('Could not load the finance summary');
      }

      if (ordersResult.status === 'fulfilled') {
        setOrders((ordersResult.value.data?.items || []) as ReportOrder[]);
      } else {
        console.error('Orders report failed:', ordersResult.reason);
        toast.error('Could not load order details');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const periodOrders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextDay = new Date(todayStart);
    nextDay.setDate(nextDay.getDate() + 1);

    return orders.filter(order => {
      const created = new Date(order.created_at || '');
      if (Number.isNaN(created.getTime())) return false;

      if (period === 'today') {
        return created >= todayStart && created < nextDay;
      }

      if (period === 'yesterday') {
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        return created >= yesterdayStart && created < todayStart;
      }

      if (period === 'week') {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 6);
        return created >= start;
      }

      if (period === 'thirty_days') {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 29);
        return created >= start;
      }

      if (period === 'six_months') {
        return created >= shiftMonths(todayStart, -6);
      }

      if (period === 'custom') {
        const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
        const to = customTo ? new Date(`${customTo}T23:59:59`) : null;
        return (!from || created >= from) && (!to || created <= to);
      }

      return true;
    });
  }, [orders, period, customFrom, customTo]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return periodOrders;

    return periodOrders.filter(order =>
      [
        order.id,
        order.customer_name,
        order.customer_phone,
        order.payment_method,
        order.status,
        order.rider_name,
      ]
        .map(value => String(value || '').toLowerCase())
        .some(value => value.includes(query)),
    );
  }, [periodOrders, search]);

  const countedOrders = useMemo(
    () => periodOrders.filter(isCountedOrder),
    [periodOrders],
  );

  const paymentSplit = useMemo(() => {
    return countedOrders.reduce(
      (result, order) => {
        const saleAmount = orderGrossSales(order);
        const isDelivery = String(order.order_type || '').toLowerCase() === 'delivery';
        const isCash = isCashPayment(order.payment_method);

        if (isDelivery && isCash) {
          result.deliveryCashSales += saleAmount;
          result.deliveryCashOrders += 1;
        } else if (isDelivery) {
          result.deliveryCardSales += saleAmount;
          result.deliveryCardOrders += 1;
        } else if (isCash) {
          result.pickupCashSales += saleAmount;
          result.pickupCashOrders += 1;
        } else {
          result.pickupCardSales += saleAmount;
          result.pickupCardOrders += 1;
        }

        return result;
      },
      {
        pickupCashSales: 0,
        pickupCardSales: 0,
        deliveryCashSales: 0,
        deliveryCardSales: 0,
        pickupCashOrders: 0,
        pickupCardOrders: 0,
        deliveryCashOrders: 0,
        deliveryCardOrders: 0,
      },
    );
  }, [countedOrders]);

  const bestSellers = useMemo(() => {
    const items = new Map<string, { quantity: number; revenue: number }>();

    countedOrders.forEach(order => {
      try {
        const parsed = JSON.parse(order.items_json || '[]');
        if (!Array.isArray(parsed)) return;

        parsed.forEach((item: any) => {
          const name = String(item.name || 'Unknown item');
          const quantity = Math.max(1, numeric(item.quantity));
          const price = numeric(item.price);
          const current = items.get(name) || { quantity: 0, revenue: 0 };
          current.quantity += quantity;
          current.revenue += price;
          items.set(name, current);
        });
      } catch {
        // Ignore invalid historical item JSON.
      }
    });

    return [...items.entries()]
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [countedOrders]);

  const statusBreakdown = useMemo(() => {
    const result = new Map<string, number>();
    periodOrders.forEach(order => {
      const status = String(order.status || 'unknown').toLowerCase();
      result.set(status, (result.get(status) || 0) + 1);
    });
    return [...result.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodOrders]);

  const dailyTrend = useMemo<DailyPoint[]>(() => {
    const grouped = new Map<string, DailyPoint>();

    countedOrders.forEach(order => {
      const key = dateKey(order.created_at);
      if (!key) return;

      const current = grouped.get(key) || {
        date: key,
        label: new Date(`${key}T00:00:00`).toLocaleDateString('en-AE', {
          day: '2-digit',
          month: 'short',
        }),
        revenue: 0,
        orders: 0,
      };

      current.revenue += orderGrossSales(order);
      current.orders += 1;
      grouped.set(key, current);
    });

    return [...grouped.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [countedOrders]);

  const maxDailyRevenue = Math.max(
    1,
    ...dailyTrend.map(point => point.revenue),
  );

  const totals = summary?.totals || EMPTY_TOTALS;
  const shopMustPayApp = numeric(totals.developer_fees);
  const grossSales =
    numeric(totals.shop_food_sale) + shopMustPayApp;
  const netShopSale = Math.max(grossSales - shopMustPayApp, 0);

  function exportCsv(): void {
    const headers = [
      'Order ID',
      'Date',
      'Customer',
      'Phone',
      'Payment',
      'Status',
      'Order Type',
      'Subtotal',
      'Discount',
      'Service Fee',
      'Small Order Fee',
      'Delivery Charge',
      'Tip',
      'Customer Total',
      'Rider',
    ];

    const rows = visibleOrders.map(order => [
      order.id,
      order.created_at,
      order.customer_name,
      order.customer_phone,
      order.payment_method,
      order.status,
      order.order_type,
      numeric(order.subtotal_amount),
      numeric(order.discount_amount),
      numeric(order.service_fee),
      numeric(order.small_order_fee),
      numeric(order.delivery_charge),
      numeric(order.tip_amount),
      numeric(order.total_amount),
      order.rider_name,
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsv).join(','))
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fai-fai-sales-${period}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Sales report downloaded');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading complete sales report...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start gap-3 mb-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/dashboard')}
            className="text-gray-400 hover:text-white mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Sales & Reports</h1>
            <p className="text-gray-500 text-xs mt-1">
              Clear shop sales and app payment summary
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            size="sm"
            onClick={exportCsv}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
        </div>

        <Card className="bg-gray-900 border-gray-800 p-3 mb-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PERIODS.map(option => (
              <button
                key={option.key}
                onClick={() => setPeriod(option.key)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  period === option.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_auto] gap-2 mt-3">
              <Input
                type="date"
                value={customFrom}
                onChange={event => setCustomFrom(event.target.value)}
                className="bg-gray-950 border-gray-700 text-white"
              />
              <Input
                type="date"
                value={customTo}
                onChange={event => setCustomTo(event.target.value)}
                className="bg-gray-950 border-gray-700 text-white"
              />
              <Button
                onClick={() => void loadData(true)}
                className="col-span-2 md:col-span-1 bg-emerald-600 hover:bg-emerald-500"
              >
                Apply Dates
              </Button>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-[11px] uppercase font-semibold">
                Gross Sales
              </p>
              <CircleDollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-white text-2xl font-black mt-2">
              AED {money(grossSales)}
            </p>
            <p className="text-gray-500 text-[11px] mt-1">
              Rider money not included
            </p>
          </Card>

          <Card className="bg-red-950/20 border-red-900/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-red-300 text-[11px] uppercase font-semibold">
                Shop Must Pay App
              </p>
              <Percent className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-red-400 text-2xl font-black mt-2">
              -AED {money(shopMustPayApp)}
            </p>
            <p className="text-red-300/60 text-[11px] mt-1">
              Amount due to the app
            </p>
          </Card>

          <Card className="bg-emerald-950/25 border-emerald-900/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-emerald-300 text-[11px] uppercase font-semibold">
                Net Shop Sale
              </p>
              <Wallet className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-white text-2xl font-black mt-2">
              AED {money(netShopSale)}
            </p>
            <p className="text-gray-500 text-[11px] mt-1">
              After app payment
            </p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-[11px] uppercase font-semibold">
                Completed Orders
              </p>
              <PackageCheck className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-white text-2xl font-black mt-2">
              {totals.orders}
            </p>
            <p className="text-gray-500 text-[11px] mt-1">
              Final sales only
            </p>
          </Card>
        </div>

        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-gray-500 text-xs uppercase font-semibold">
                Simple Calculation
              </p>
              <p className="text-gray-300 text-sm mt-1">
                Gross Sales AED {money(grossSales)} - Shop Must Pay App AED {money(shopMustPayApp)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-gray-500 text-[10px] uppercase">Shop Keeps</p>
              <p className="text-emerald-400 font-black">AED {money(netShopSale)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-white font-semibold">Payment Split</h2>
              <p className="text-gray-500 text-[11px] mt-0.5">
                Pickup and delivery sales are separated by cash and card. Rider charges and tips are excluded.
              </p>
            </div>
          </div>

          <div className="mb-3">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Pickup Sales
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-emerald-300 text-xs font-semibold uppercase">
                    Pickup Cash
                  </p>
                  <Banknote className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-white text-xl font-black mt-3">
                  AED {money(paymentSplit.pickupCashSales)}
                </p>
                <p className="text-emerald-300/60 text-[11px] mt-1">
                  {paymentSplit.pickupCashOrders} completed {paymentSplit.pickupCashOrders === 1 ? 'order' : 'orders'}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-blue-300 text-xs font-semibold uppercase">
                    Pickup Card
                  </p>
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-white text-xl font-black mt-3">
                  AED {money(paymentSplit.pickupCardSales)}
                </p>
                <p className="text-blue-300/60 text-[11px] mt-1">
                  {paymentSplit.pickupCardOrders} completed {paymentSplit.pickupCardOrders === 1 ? 'order' : 'orders'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Delivery Sales
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-emerald-300 text-xs font-semibold uppercase">
                    Delivery Cash
                  </p>
                  <Banknote className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-white text-xl font-black mt-3">
                  AED {money(paymentSplit.deliveryCashSales)}
                </p>
                <p className="text-emerald-300/60 text-[11px] mt-1">
                  {paymentSplit.deliveryCashOrders} completed {paymentSplit.deliveryCashOrders === 1 ? 'order' : 'orders'}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-blue-300 text-xs font-semibold uppercase">
                    Delivery Card
                  </p>
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-white text-xl font-black mt-3">
                  AED {money(paymentSplit.deliveryCardSales)}
                </p>
                <p className="text-blue-300/60 text-[11px] mt-1">
                  {paymentSplit.deliveryCardOrders} completed {paymentSplit.deliveryCardOrders === 1 ? 'order' : 'orders'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h2 className="text-white font-semibold">Sales Trend</h2>
            </div>

            {dailyTrend.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-600 text-sm">
                No sales in this period
              </div>
            ) : (
              <div className="h-44 flex items-end gap-2 overflow-x-auto pb-1">
                {dailyTrend.map(point => (
                  <div
                    key={point.date}
                    className="min-w-[38px] flex-1 h-full flex flex-col justify-end items-center gap-1"
                    title={`${point.label}: AED ${money(point.revenue)} · ${point.orders} orders`}
                  >
                    <span className="text-gray-500 text-[9px]">
                      {point.orders}
                    </span>
                    <div
                      className="w-full max-w-[34px] bg-emerald-500/70 rounded-t-lg min-h-[4px]"
                      style={{
                        height: `${Math.max(
                          4,
                          (point.revenue / maxDailyRevenue) * 125,
                        )}px`,
                      }}
                    />
                    <span className="text-gray-600 text-[9px] whitespace-nowrap">
                      {point.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag className="w-4 h-4 text-cyan-400" />
              <h2 className="text-white font-semibold">Best Sellers</h2>
            </div>

            {bestSellers.length === 0 ? (
              <p className="text-gray-600 text-sm">No item sales in this period</p>
            ) : (
              <div className="space-y-2">
                {bestSellers.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 bg-gray-950/70 rounded-xl px-3 py-2.5"
                  >
                    <span className="w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-gray-200 text-sm flex-1 truncate">
                      {item.name}
                    </span>
                    <span className="text-white text-sm font-bold">
                      {item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-purple-400" />
              <h2 className="text-white font-semibold">Order Status</h2>
            </div>

            {statusBreakdown.length === 0 ? (
              <p className="text-gray-600 text-sm">No orders in this period</p>
            ) : (
              <div className="space-y-2">
                {statusBreakdown.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between bg-gray-950/70 rounded-xl px-3 py-2.5"
                  >
                    <span className="text-gray-300 text-sm capitalize">{status}</span>
                    <span className="text-white font-bold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="bg-gray-900 border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div>
                <h2 className="text-white font-semibold">Order Report</h2>
                <p className="text-gray-500 text-xs mt-1">
                  Showing {visibleOrders.length} orders
                </p>
              </div>

              <div className="md:ml-auto relative w-full md:w-80">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Order, customer, phone, payment..."
                  className="pl-9 bg-gray-950 border-gray-700 text-white"
                />
              </div>
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="p-10 text-center text-gray-600">
              No matching orders
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {visibleOrders.slice(0, 300).map(order => (
                <div key={String(order.id)} className="p-4 hover:bg-gray-800/30">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isCashPayment(order.payment_method)
                          ? 'bg-green-500/10'
                          : 'bg-blue-500/10'
                      }`}
                    >
                      {isCashPayment(order.payment_method) ? (
                        <Banknote className="w-5 h-5 text-green-400" />
                      ) : (
                        <CreditCard className="w-5 h-5 text-blue-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-semibold">
                          Order #{order.id}
                        </span>
                        <span className="text-gray-500 text-xs capitalize">
                          {order.status || 'unknown'}
                        </span>
                        <span className="text-gray-600 text-xs">
                          {order.order_type || ''}
                        </span>
                      </div>

                      <p className="text-gray-300 text-sm mt-1 truncate">
                        {order.customer_name || 'Guest'} · {order.payment_method || '-'}
                      </p>
                      <p className="text-gray-600 text-[11px] mt-1">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-white font-black">
                        AED {money(order.total_amount)}
                      </p>
                      <p className="text-gray-600 text-[10px] mt-1">
                        App fee AED {money(
                          numeric(order.service_fee) +
                            numeric(order.small_order_fee),
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
