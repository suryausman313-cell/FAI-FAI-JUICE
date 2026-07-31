import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Banknote,
  Bell,
  Bike,
  CalendarDays,
  ChefHat,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Code2,
  DollarSign,
  LogOut,
  MessageSquare,
  Package,
  Percent,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  TrendingUp,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  client,
  RestaurantSettings,
  SalesReport,
} from '@/lib/api';

interface AdminPermissions {
  orders?: boolean;
  menu?: boolean;
  sales?: boolean;
  customers?: boolean;
  settings?: boolean;
  deals?: boolean;
  notifications?: boolean;
  feedback?: boolean;
  accounts?: boolean;
  riders?: boolean;
  kitchen?: boolean;
  logs?: boolean;
}

type FinancePeriod =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'year'
  | 'all'
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

interface SettlementTotals {
  approved_cash: number;
  awaiting_approval: number;
  rejected_cash: number;
  submissions: number;
}

interface CurrentBalance {
  cash_due_to_shop: number;
  approved_cash: number;
  awaiting_approval: number;
  remaining_to_submit: number;
  total_pending_cash: number;
}

interface FinanceSummary {
  period: {
    key: FinancePeriod;
    label: string;
    date_from: string | null;
    date_to: string | null;
  };
  totals: FinanceTotals;
  settlements: SettlementTotals;
  current_balance: CurrentBalance;
}

interface CashSubmission {
  id: number;
  rider_id: number;
  rider_name: string;
  rider_phone: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  rider_note: string;
  admin_note: string;
  reviewed_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
}

const PERIODS: Array<{
  key: FinancePeriod;
  label: string;
}> = [
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

function formatDateTime(value: string | null): string {
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

function getErrorMessage(error: any, fallback: string): string {
  return (
    error?.data?.detail ||
    error?.response?.data?.detail ||
    error?.message ||
    fallback
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [report, setReport] = useState<SalesReport | null>(null);
  const [finance, setFinance] = useState<FinanceSummary | null>(
    null
  );
  const [cashSubmissions, setCashSubmissions] = useState<
    CashSubmission[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(
    null
  );

  const [restaurantStatus, setRestaurantStatus] = useState<
    'open' | 'busy' | 'closed'
  >('open');

  const [settingsId, setSettingsId] = useState<number | null>(
    null
  );

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] =
    useState<AdminPermissions>({});

  const [financePeriod, setFinancePeriod] =
    useState<FinancePeriod>('today');

  const [customFrom, setCustomFrom] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const [customTo, setCustomTo] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    void checkAuthAndLoad();
  }, []);

  useEffect(() => {
    if (
      loading ||
      financePeriod === 'custom'
    ) {
      return;
    }

    void loadFinance(financePeriod);
  }, [financePeriod]);

  useEffect(() => {
    if (loading) return;

    const interval = window.setInterval(() => {
      void loadReport();
      void loadCashSubmissions();

      if (financePeriod !== 'custom') {
        void loadFinance(financePeriod, true);
      }
    }, 20000);

    return () => window.clearInterval(interval);
  }, [loading, financePeriod]);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');

    if (!auth) {
      navigate('/admin');
      return;
    }

    try {
      const parsed = JSON.parse(auth);

      if (!parsed.loggedIn) {
        navigate('/admin');
        return;
      }

      if (parsed.role === 'super_admin') {
        setIsSuperAdmin(true);
      } else {
        setIsSuperAdmin(false);
        setPermissions(parsed.permissions || {});
      }
    } catch {
      navigate('/admin');
      return;
    }

    await Promise.all([
      loadReport(),
      loadSettings(),
      loadFinance('today'),
      loadCashSubmissions(),
    ]);

    setLoading(false);
  }

  function hasPermission(key: string): boolean {
    if (isSuperAdmin) return true;
    return Boolean((permissions as any)[key]);
  }

  async function loadReport() {
    try {
      const response = await client.apiCall.invoke({
        url: '/api/v1/admin/sales-report',
        method: 'GET',
        data: {},
      });

      setReport(response.data);
    } catch (error) {
      console.error('Failed to load old sales report:', error);
    }
  }

  function financeUrl(period: FinancePeriod): string {
    const params = new URLSearchParams({ period });

    if (period === 'custom') {
      params.set('date_from', customFrom);
      params.set('date_to', customTo);
    }

    return `/api/v1/finance/admin/summary?${params.toString()}`;
  }

  async function loadFinance(
    period: FinancePeriod = financePeriod,
    silent = false
  ) {
    if (
      period === 'custom' &&
      (!customFrom || !customTo)
    ) {
      toast.error('Select both custom dates');
      return;
    }

    if (!silent) setFinanceLoading(true);

    try {
      const response = await client.apiCall.invoke({
        url: financeUrl(period),
        method: 'GET',
        data: {},
      });

      setFinance(response.data);
    } catch (error: any) {
      console.error('Failed to load finance report:', error);

      if (!silent) {
        toast.error(
          getErrorMessage(
            error,
            'Could not load finance breakdown'
          )
        );
      }
    } finally {
      if (!silent) setFinanceLoading(false);
    }
  }

  async function loadCashSubmissions() {
    try {
      const response = await client.apiCall.invoke({
        url:
          '/api/v1/finance/admin/cash-submissions' +
          '?status=pending&limit=100',
        method: 'GET',
        data: {},
      });

      setCashSubmissions(response.data?.items || []);
    } catch (error) {
      console.error(
        'Failed to load pending rider cash:',
        error
      );
    }
  }

  async function loadSettings() {
    try {
      const response =
        await client.entities.restaurant_settings.query({
          query: {},
          limit: 1,
        });

      const settings =
        response?.data?.items?.[0] as
          | RestaurantSettings
          | undefined;

      if (settings) {
        setRestaurantStatus(
          (settings.restaurant_status || 'open') as
            | 'open'
            | 'busy'
            | 'closed'
        );

        setSettingsId(Number(settings.id));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function updateStatus(
    newStatus: 'open' | 'busy' | 'closed'
  ) {
    if (!settingsId) return;

    try {
      await client.entities.restaurant_settings.update({
        id: String(settingsId),
        data: {
          restaurant_status: newStatus,
        },
      });

      setRestaurantStatus(newStatus);

      toast.success(
        `Restaurant status changed to ${newStatus.toUpperCase()}`
      );
    } catch {
      toast.error('Failed to update status');
    }
  }

  function adminName(): string {
    try {
      const auth = JSON.parse(
        localStorage.getItem('admin_auth') || '{}'
      );

      return (
        auth.name ||
        auth.email ||
        auth.username ||
        'Admin'
      );
    } catch {
      return 'Admin';
    }
  }

  async function reviewCashSubmission(
    submission: CashSubmission,
    status: 'approved' | 'rejected'
  ) {
    const action =
      status === 'approved' ? 'approve' : 'reject';

    const confirmed = window.confirm(
      `${action.toUpperCase()} AED ${money(
        submission.amount
      )} from ${submission.rider_name}?`
    );

    if (!confirmed) return;

    const note =
      window.prompt(
        status === 'approved'
          ? 'Optional admin note:'
          : 'Reason for rejection:',
        ''
      ) || '';

    setReviewingId(submission.id);

    try {
      await client.apiCall.invoke({
        url:
          `/api/v1/finance/admin/cash-submissions/` +
          submission.id,
        method: 'PUT',
        data: {
          status,
          admin_note: note,
          reviewed_by: adminName(),
        },
      });

      toast.success(
        status === 'approved'
          ? 'Rider cash approved'
          : 'Rider cash rejected'
      );

      await Promise.all([
        loadCashSubmissions(),
        loadFinance(financePeriod),
      ]);
    } catch (error: any) {
      toast.error(
        getErrorMessage(
          error,
          'Could not review rider cash'
        )
      );
    } finally {
      setReviewingId(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_auth');
    navigate('/admin');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">
          Loading dashboard...
        </div>
      </div>
    );
  }

  const allNavItems = [
    {
      path: '/admin/orders',
      icon: ShoppingBag,
      label: 'Orders',
      color: 'text-blue-400',
      perm: 'orders',
    },
    {
      path: '/admin/sales',
      icon: BarChart3,
      label: 'Sales & Reports',
      color: 'text-green-400',
      perm: 'sales',
    },
    {
      path: '/admin/menu',
      icon: UtensilsCrossed,
      label: 'Menu',
      color: 'text-emerald-400',
      perm: 'menu',
    },
    {
      path: '/admin/offers',
      icon: Tag,
      label: 'Offers',
      color: 'text-pink-400',
      perm: 'deals',
    },
    {
      path: '/admin/deals',
      icon: Package,
      label: 'Deal Builder',
      color: 'text-orange-400',
      perm: 'deals',
    },
    {
      path: '/admin/notifications',
      icon: Bell,
      label: 'Notifications',
      color: 'text-yellow-400',
      perm: 'notifications',
    },
    {
      path: '/admin/customers',
      icon: Users,
      label: 'Customers',
      color: 'text-purple-400',
      perm: 'customers',
    },
    {
      path: '/admin/feedback',
      icon: MessageSquare,
      label: 'Feedback',
      color: 'text-cyan-400',
      perm: 'feedback',
    },
    {
      path: '/admin/activity-logs',
      icon: ClipboardList,
      label: 'Activity Logs',
      color: 'text-amber-400',
      perm: 'logs',
    },
    {
      path: '/admin/accounts',
      icon: Shield,
      label: 'Admin Accounts',
      color: 'text-indigo-400',
      perm: 'accounts',
    },
    {
      path: '/admin/riders',
      icon: Bike,
      label: 'Rider Management',
      color: 'text-pink-400',
      perm: 'riders',
    },
    {
      path: '/admin/settings',
      icon: Settings,
      label: 'Settings',
      color: 'text-yellow-400',
      perm: 'settings',
    },
    {
      path: '/kitchen',
      icon: ChefHat,
      label: 'Kitchen Display',
      color: 'text-orange-400',
      perm: 'kitchen',
    },
  ];

  const navItems = allNavItems.filter(item =>
    hasPermission(item.perm)
  );

  const totals = finance?.totals;
  const balance = finance?.current_balance;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold">
              Admin Dashboard
            </h1>

            <p className="text-gray-400">
              Vita Napoli Pizza Management

              {!isSuperAdmin && (
                <span className="text-yellow-400 text-xs ml-2">
                  (Limited Access)
                </span>
              )}
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {hasPermission('settings') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-white font-semibold text-sm">
                  Restaurant Status
                </h3>

                <p className="text-gray-500 text-xs mt-0.5">
                  Controls what customers see on the home page
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => void updateStatus('open')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    restaurantStatus === 'open'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  🟢 Open
                </button>

                <button
                  onClick={() => void updateStatus('busy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    restaurantStatus === 'busy'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  🟡 Busy
                </button>

                <button
                  onClick={() => void updateStatus('closed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    restaurantStatus === 'closed'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  🔴 Closed
                </button>
              </div>
            </div>
          </Card>
        )}

        {(hasPermission('sales') ||
          hasPermission('orders')) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>

                <div>
                  <p className="text-gray-400 text-xs">
                    Today Customer Total
                  </p>

                  <p className="text-white font-bold">
                    AED {report?.daily_sales?.toFixed(0) || 0}
                  </p>

                  <p className="text-blue-400 text-[10px]">
                    {report?.daily_orders || 0} orders
                  </p>
                </div>
              </div>
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-green-400" />
                </div>

                <div>
                  <p className="text-gray-400 text-xs">
                    This Week
                  </p>

                  <p className="text-white font-bold">
                    AED {report?.weekly_sales?.toFixed(0) || 0}
                  </p>

                  <p className="text-green-400 text-[10px]">
                    {report?.weekly_orders || 0} orders
                  </p>
                </div>
              </div>
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                </div>

                <div>
                  <p className="text-gray-400 text-xs">
                    This Month
                  </p>

                  <p className="text-white font-bold">
                    AED {report?.monthly_sales?.toFixed(0) || 0}
                  </p>

                  <p className="text-purple-400 text-[10px]">
                    {report?.monthly_orders || 0} orders
                  </p>
                </div>
              </div>
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-red-400" />
                </div>

                <div>
                  <p className="text-gray-400 text-xs">
                    Total Orders
                  </p>

                  <p className="text-white font-bold">
                    {report?.total_orders || 0}
                  </p>

                  <p className="text-red-400 text-[10px]">
                    all time
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {hasPermission('sales') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-green-400" />

                  <h2 className="text-white font-bold text-lg">
                    Money Breakdown
                  </h2>

                  {financeLoading && (
                    <RefreshCw className="w-4 h-4 text-gray-500 animate-spin" />
                  )}
                </div>

                <p className="text-gray-500 text-xs mt-1">
                  {finance?.period?.label || 'Today'} · Discount
                  applies only to menu items
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {PERIODS.map(period => (
                  <Button
                    key={period.key}
                    size="sm"
                    variant={
                      financePeriod === period.key
                        ? 'default'
                        : 'outline'
                    }
                    onClick={() => {
                      setFinancePeriod(period.key);

                      if (period.key !== 'custom') {
                        void loadFinance(period.key);
                      }
                    }}
                    className={
                      financePeriod === period.key
                        ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                        : 'border-gray-700 text-gray-400 hover:text-white'
                    }
                  >
                    {period.label}
                  </Button>
                ))}
              </div>
            </div>

            {financePeriod === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mb-4">
                <div>
                  <p className="text-gray-500 text-xs mb-1">
                    From
                  </p>

                  <Input
                    type="date"
                    value={customFrom}
                    onChange={event =>
                      setCustomFrom(event.target.value)
                    }
                    className="bg-gray-950 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <p className="text-gray-500 text-xs mb-1">
                    To
                  </p>

                  <Input
                    type="date"
                    value={customTo}
                    onChange={event =>
                      setCustomTo(event.target.value)
                    }
                    className="bg-gray-950 border-gray-700 text-white"
                  />
                </div>

                <Button
                  onClick={() => void loadFinance('custom')}
                  className="sm:self-end bg-green-600 hover:bg-green-700 text-white"
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Apply
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-green-950/25 border-green-900/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag className="w-4 h-4 text-green-400" />
                  <p className="text-green-300 text-xs">
                    Shop Food Sale
                  </p>
                </div>

                <p className="text-white font-bold text-lg">
                  AED {money(totals?.shop_food_sale)}
                </p>

                <p className="text-gray-500 text-[10px]">
                  Menu after discount
                </p>
              </Card>

              <Card className="bg-blue-950/25 border-blue-900/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                  <p className="text-blue-300 text-xs">
                    Customer Total
                  </p>
                </div>

                <p className="text-white font-bold text-lg">
                  AED {money(totals?.customer_total)}
                </p>

                <p className="text-gray-500 text-[10px]">
                  All customer charges
                </p>
              </Card>

              <Card className="bg-red-950/25 border-red-900/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-red-400" />
                  <p className="text-red-300 text-xs">
                    Menu Discount
                  </p>
                </div>

                <p className="text-red-300 font-bold text-lg">
                  - AED {money(totals?.discount_amount)}
                </p>

                <p className="text-gray-500 text-[10px]">
                  Fees are not discounted
                </p>
              </Card>

              <Card className="bg-yellow-950/25 border-yellow-900/50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Code2 className="w-4 h-4 text-yellow-400" />
                  <p className="text-yellow-300 text-xs">
                    Developer Fees
                  </p>
                </div>

                <p className="text-white font-bold text-lg">
                  AED {money(totals?.developer_fees)}
                </p>

                <p className="text-gray-500 text-[10px]">
                  Service + small order
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Service Fee
                </p>

                <p className="text-yellow-300 font-bold">
                  AED {money(totals?.service_fee)}
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Small-Order Fee
                </p>

                <p className="text-yellow-300 font-bold">
                  AED {money(totals?.small_order_fee)}
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-cyan-400" />

                  <p className="text-gray-400 text-xs">
                    Delivery Charges
                  </p>
                </div>

                <p className="text-cyan-300 font-bold mt-1">
                  AED {money(totals?.delivery_charges)}
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-pink-400" />

                  <p className="text-gray-400 text-xs">
                    Rider Tips
                  </p>
                </div>

                <p className="text-pink-300 font-bold mt-1">
                  AED {money(totals?.rider_tips)}
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Rider Earnings
                </p>

                <p className="text-blue-300 font-bold">
                  AED {money(totals?.rider_earnings)}
                </p>

                <p className="text-gray-600 text-[10px]">
                  Delivery + rider tips
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Shop Tips
                </p>

                <p className="text-purple-300 font-bold">
                  AED {money(totals?.shop_tips)}
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Cash Collected
                </p>

                <p className="text-green-300 font-bold">
                  AED {money(totals?.cash_collected)}
                </p>

                <p className="text-gray-600 text-[10px]">
                  {totals?.cash_orders || 0} cash orders
                </p>
              </Card>

              <Card className="bg-gray-950 border-gray-800 p-3">
                <p className="text-gray-400 text-xs">
                  Card Orders
                </p>

                <p className="text-blue-300 font-bold">
                  {totals?.card_orders || 0}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Card className="bg-orange-950/25 border-orange-900/50 p-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-orange-400" />

                  <p className="text-orange-300 text-xs">
                    Rider Cash Pending
                  </p>
                </div>

                <p className="text-white font-bold mt-1">
                  AED {money(balance?.total_pending_cash)}
                </p>
              </Card>

              <Card className="bg-yellow-950/25 border-yellow-900/50 p-3">
                <p className="text-yellow-300 text-xs">
                  Awaiting Approval
                </p>

                <p className="text-white font-bold mt-1">
                  AED {money(balance?.awaiting_approval)}
                </p>
              </Card>

              <Card className="bg-green-950/25 border-green-900/50 p-3">
                <p className="text-green-300 text-xs">
                  Admin Approved
                </p>

                <p className="text-white font-bold mt-1">
                  AED {money(balance?.approved_cash)}
                </p>
              </Card>

              <Card className="bg-blue-950/25 border-blue-900/50 p-3">
                <p className="text-blue-300 text-xs">
                  Still To Submit
                </p>

                <p className="text-white font-bold mt-1">
                  AED {money(balance?.remaining_to_submit)}
                </p>
              </Card>
            </div>
          </Card>
        )}

        {hasPermission('sales') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-orange-400" />

                  <h2 className="text-white font-bold">
                    Rider Cash Approval
                  </h2>
                </div>

                <p className="text-gray-500 text-xs mt-1">
                  Rider submitted cash stays pending until Admin
                  approves it
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadCashSubmissions()}
                className="border-gray-700 text-gray-400"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {cashSubmissions.length === 0 ? (
              <div className="text-center py-7">
                <CheckCircle2 className="w-9 h-9 text-green-700 mx-auto mb-2" />

                <p className="text-gray-400 text-sm">
                  No cash waiting for approval
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cashSubmissions.map(submission => (
                  <Card
                    key={submission.id}
                    className="bg-gray-950 border-gray-800 p-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-white font-semibold">
                          {submission.rider_name}
                        </p>

                        <p className="text-gray-500 text-xs">
                          {submission.rider_phone} ·{' '}
                          {formatDateTime(
                            submission.submitted_at
                          )}
                        </p>

                        {submission.rider_note && (
                          <p className="text-gray-400 text-xs mt-1">
                            Rider note: {submission.rider_note}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="text-orange-300 font-bold text-lg sm:mr-3">
                          AED {money(submission.amount)}
                        </p>

                        <Button
                          size="sm"
                          disabled={
                            reviewingId === submission.id
                          }
                          onClick={() =>
                            void reviewCashSubmission(
                              submission,
                              'approved'
                            )
                          }
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            reviewingId === submission.id
                          }
                          onClick={() =>
                            void reviewCashSubmission(
                              submission,
                              'rejected'
                            )
                          }
                          className="border-red-800 text-red-400 hover:text-red-300"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        )}

        {hasPermission('sales') &&
          report?.today_payment_breakdown &&
          Object.keys(report.today_payment_breakdown).length >
            0 && (
            <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
              <h3 className="text-white font-semibold text-sm mb-3">
                💰 Today's Payment Breakdown
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(
                  report.today_payment_breakdown
                ).map(
                  ([method, info]: [string, any]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            method
                              .toLowerCase()
                              .includes('cash')
                              ? 'bg-green-500'
                              : method
                                    .toLowerCase()
                                    .includes('card')
                                ? 'bg-blue-500'
                                : 'bg-orange-500'
                          }`}
                        />

                        <span className="text-gray-300 text-xs">
                          {method}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-green-400 font-bold text-xs">
                          AED {info.revenue?.toFixed(0)}
                        </span>

                        <span className="text-gray-500 text-[10px] ml-1">
                          ({info.orders})
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </Card>
          )}

        {hasPermission('sales') && (
          <Card
            className="bg-gray-900/50 border-gray-800 p-3 mb-8 cursor-pointer hover:border-gray-600 transition-all"
            onClick={() => navigate('/admin/sales')}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-gray-400 text-sm">
                📊 Custom reports and detailed order history
              </p>

              <span className="text-green-400 text-sm font-medium whitespace-nowrap">
                Sales & Reports →
              </span>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {navItems.map(
            ({
              path,
              icon: Icon,
              label,
              color,
            }) => (
              <Card
                key={path}
                className="bg-gray-900 border-gray-800 p-6 cursor-pointer hover:border-gray-600 transition-all"
                onClick={() => navigate(path)}
              >
                <Icon className={`w-8 h-8 ${color} mb-3`} />

                <h3 className="text-white font-semibold">
                  {label}
                </h3>
              </Card>
            )
          )}
        </div>

        {hasPermission('kitchen') && (
          <Card className="bg-orange-600/5 border-orange-600/20 p-4 mb-8">
            <div className="flex items-start gap-3">
              <ChefHat className="w-5 h-5 text-orange-400 mt-0.5" />

              <div>
                <p className="text-orange-400 font-medium text-sm">
                  Kitchen Display (Separate Device)
                </p>

                <p className="text-gray-400 text-xs mt-1">
                  Open{' '}
                  <span className="text-orange-300 font-mono">
                    /kitchen
                  </span>{' '}
                  on the kitchen tablet.
                </p>
              </div>
            </div>
          </Card>
        )}

        {hasPermission('sales') &&
          report?.best_selling_items &&
          report.best_selling_items.length > 0 && (
            <Card className="bg-gray-900 border-gray-800 p-6">
              <h3 className="text-white font-semibold mb-4">
                Best Selling Items
              </h3>

              <div className="space-y-3">
                {report.best_selling_items.map(
                  (item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-sm w-6">
                          {index + 1}.
                        </span>

                        <span className="text-gray-300">
                          {item.name}
                        </span>
                      </div>

                      <span className="text-gray-400 text-sm">
                        {item.quantity} sold
                      </span>
                    </div>
                  )
                )}
              </div>
            </Card>
          )}

        {navItems.length === 0 && (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-gray-700 mx-auto mb-3" />

            <p className="text-gray-500">
              No sections available
            </p>

            <p className="text-gray-600 text-sm mt-1">
              Contact the Super Admin to get access
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
