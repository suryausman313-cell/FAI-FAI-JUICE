import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bike,
  ChefHat,
  ClipboardList,
  CreditCard,
  DollarSign,
  LogOut,
  MessageSquare,
  Package,
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
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client, RestaurantSettings } from '@/lib/api';

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

type FinancePeriod = 'today' | 'week' | 'month' | 'all';

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
    key: string;
    label: string;
    date_from: string | null;
    date_to: string | null;
  };
  totals: FinanceTotals;
  current_balance?: {
    cash_due_to_shop: number;
    approved_cash: number;
    awaiting_approval: number;
    remaining_to_submit: number;
    total_pending_cash: number;
  };
}

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

function readAdminAuth(): {
  valid: boolean;
  superAdmin: boolean;
  permissions: AdminPermissions;
} {
  try {
    const auth = JSON.parse(localStorage.getItem('admin_auth') || '{}');
    return {
      valid: Boolean(auth.loggedIn),
      superAdmin: auth.role === 'super_admin',
      permissions: auth.permissions || {},
    };
  } catch {
    return { valid: false, superAdmin: false, permissions: {} };
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermissions>({});
  const [restaurantStatus, setRestaurantStatus] = useState<
    'open' | 'busy' | 'closed'
  >('open');
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<
    Partial<Record<FinancePeriod, FinanceSummary>>
  >({});

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.valid) {
      navigate('/admin');
      return;
    }

    setIsSuperAdmin(auth.superAdmin);
    setPermissions(auth.permissions);
    void loadDashboard();

    const interval = window.setInterval(() => {
      void loadDashboard(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  function hasPermission(key: keyof AdminPermissions): boolean {
    return isSuperAdmin || Boolean(permissions[key]);
  }

  async function loadSummary(period: FinancePeriod): Promise<FinanceSummary | null> {
    try {
      const response = await client.apiCall.invoke({
        url: `/api/v1/finance/admin/summary?period=${period}`,
        method: 'GET',
        data: {},
      });
      return response.data as FinanceSummary;
    } catch (error) {
      console.error(`Failed to load ${period} finance summary:`, error);
      return null;
    }
  }

  async function loadSettings(): Promise<void> {
    try {
      const response = await client.entities.restaurant_settings.query({
        query: {},
        limit: 1,
      });

      const settings = response?.data?.items?.[0] as RestaurantSettings | undefined;
      if (!settings) return;

      setSettingsId(Number(settings.id));
      setRestaurantStatus(
        (settings.restaurant_status || 'open') as 'open' | 'busy' | 'closed',
      );
    } catch (error) {
      console.error('Failed to load restaurant settings:', error);
    }
  }

  async function loadDashboard(silent = false): Promise<void> {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [today, week, month, all] = await Promise.all([
        loadSummary('today'),
        loadSummary('week'),
        loadSummary('month'),
        loadSummary('all'),
      ]);

      setSummaries(previous => ({
        ...previous,
        ...(today ? { today } : {}),
        ...(week ? { week } : {}),
        ...(month ? { month } : {}),
        ...(all ? { all } : {}),
      }));

      await loadSettings();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function updateStatus(
    status: 'open' | 'busy' | 'closed',
  ): Promise<void> {
    if (!settingsId) {
      toast.error('Restaurant settings not loaded');
      return;
    }

    try {
      await client.entities.restaurant_settings.update({
        id: String(settingsId),
        data: { restaurant_status: status },
      });
      setRestaurantStatus(status);
      toast.success(`Shop is now ${status.toUpperCase()}`);
    } catch {
      toast.error('Could not update shop status');
    }
  }

  function logout(): void {
    localStorage.removeItem('admin_auth');
    navigate('/admin');
  }

  const today = summaries.today?.totals || EMPTY_TOTALS;
  const week = summaries.week?.totals || EMPTY_TOTALS;
  const month = summaries.month?.totals || EMPTY_TOTALS;
  const all = summaries.all?.totals || EMPTY_TOTALS;

  const navItems = useMemo(
    () => [
      {
        path: '/admin/orders',
        icon: ShoppingBag,
        label: 'Orders',
        subtitle: 'Live and past orders',
        color: 'text-blue-400',
        perm: 'orders' as keyof AdminPermissions,
      },
      {
        path: '/admin/sales',
        icon: BarChart3,
        label: 'Sales & Reports',
        subtitle: 'Revenue, fees and payments',
        color: 'text-green-400',
        perm: 'sales' as keyof AdminPermissions,
      },
      {
        path: '/admin/finance',
        icon: Wallet,
        label: 'Finance & Rider Cash',
        subtitle: 'Cash collection and settlement',
        color: 'text-emerald-400',
        perm: 'sales' as keyof AdminPermissions,
      },
      {
        path: '/admin/menu',
        icon: UtensilsCrossed,
        label: 'Menu',
        subtitle: 'Items, prices and categories',
        color: 'text-cyan-400',
        perm: 'menu' as keyof AdminPermissions,
      },
      {
        path: '/admin/offers',
        icon: Tag,
        label: 'Offers',
        subtitle: 'Discounts and promo codes',
        color: 'text-pink-400',
        perm: 'deals' as keyof AdminPermissions,
      },
      {
        path: '/admin/deals',
        icon: Package,
        label: 'Deal Builder',
        subtitle: 'Build combination deals',
        color: 'text-orange-400',
        perm: 'deals' as keyof AdminPermissions,
      },
      {
        path: '/admin/customers',
        icon: Users,
        label: 'Customers',
        subtitle: 'Customer accounts and history',
        color: 'text-purple-400',
        perm: 'customers' as keyof AdminPermissions,
      },
      {
        path: '/admin/riders',
        icon: Bike,
        label: 'Rider Management',
        subtitle: 'Riders and assignments',
        color: 'text-fuchsia-400',
        perm: 'riders' as keyof AdminPermissions,
      },
      {
        path: '/admin/notifications',
        icon: Bell,
        label: 'Notifications',
        subtitle: 'Send customer alerts',
        color: 'text-yellow-400',
        perm: 'notifications' as keyof AdminPermissions,
      },
      {
        path: '/admin/feedback',
        icon: MessageSquare,
        label: 'Feedback',
        subtitle: 'Ratings and comments',
        color: 'text-sky-400',
        perm: 'feedback' as keyof AdminPermissions,
      },
      {
        path: '/admin/activity-logs',
        icon: ClipboardList,
        label: 'Activity Logs',
        subtitle: 'Admin action history',
        color: 'text-amber-400',
        perm: 'logs' as keyof AdminPermissions,
      },
      {
        path: '/admin/accounts',
        icon: Shield,
        label: 'Admin Accounts',
        subtitle: 'Staff access and permissions',
        color: 'text-indigo-400',
        perm: 'accounts' as keyof AdminPermissions,
      },
      {
        path: '/admin/settings',
        icon: Settings,
        label: 'Settings',
        subtitle: 'Shop and app controls',
        color: 'text-yellow-400',
        perm: 'settings' as keyof AdminPermissions,
      },
      {
        path: '/kitchen',
        icon: ChefHat,
        label: 'Kitchen Display',
        subtitle: 'Open kitchen orders screen',
        color: 'text-orange-400',
        perm: 'kitchen' as keyof AdminPermissions,
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading Fai Fai dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400">Fai Fai Juice Management</p>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="text-gray-400 hover:text-white"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="ghost"
              onClick={logout}
              className="text-gray-400 hover:text-white"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {hasPermission('settings') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-white font-semibold text-sm">Restaurant Status</h2>
                <p className="text-gray-500 text-xs mt-1">
                  Controls whether customers can place an order
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['open', 'busy', 'closed'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => void updateStatus(status)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition ${
                      restaurantStatus === status
                        ? status === 'open'
                          ? 'bg-green-600 text-white'
                          : status === 'busy'
                            ? 'bg-amber-500 text-black'
                            : 'bg-red-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {(hasPermission('sales') || hasPermission('orders')) && (
          <>
            <button
              type="button"
              onClick={() => navigate('/admin/sales')}
              className="w-full text-left"
            >
              <Card className="bg-gradient-to-br from-emerald-950/70 to-gray-900 border-emerald-800/40 p-5 mb-4 hover:border-emerald-600/70 transition">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider">
                      Today Customer Payments
                    </p>
                    <p className="text-white text-3xl font-black mt-2">
                      AED {money(today.customer_total)}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      {today.orders} orders · tap for full report
                    </p>
                  </div>

                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>
              </Card>
            </button>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <Card className="bg-gray-900 border-gray-800 p-4">
                <p className="text-gray-500 text-[11px] uppercase">Shop Food Sale</p>
                <p className="text-white font-bold text-lg mt-1">
                  AED {money(today.shop_food_sale)}
                </p>
                <p className="text-gray-600 text-[11px] mt-1">
                  After AED {money(today.discount_amount)} discount
                </p>
              </Card>

              <Card className="bg-gray-900 border-gray-800 p-4">
                <p className="text-gray-500 text-[11px] uppercase">Cash / Card Orders</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-green-400 font-bold">{today.cash_orders}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-blue-400 font-bold">{today.card_orders}</span>
                </div>
                <p className="text-gray-600 text-[11px] mt-1">
                  Cash AED {money(today.cash_collected)}
                </p>
              </Card>

              <Card className="bg-gray-900 border-gray-800 p-4">
                <p className="text-gray-500 text-[11px] uppercase">Service + Small Fee</p>
                <p className="text-white font-bold text-lg mt-1">
                  AED {money(today.service_fee + today.small_order_fee)}
                </p>
                <p className="text-gray-600 text-[11px] mt-1">
                  {money(today.service_fee)} + {money(today.small_order_fee)}
                </p>
              </Card>

              <Card className="bg-gray-900 border-gray-800 p-4">
                <p className="text-gray-500 text-[11px] uppercase">Delivery + Rider</p>
                <p className="text-white font-bold text-lg mt-1">
                  AED {money(today.delivery_charges + today.rider_tips)}
                </p>
                <p className="text-gray-600 text-[11px] mt-1">
                  Rider earnings AED {money(today.rider_earnings)}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Card className="bg-gray-900 border-gray-800 p-3">
                <p className="text-gray-500 text-[10px] uppercase">This Week</p>
                <p className="text-white font-bold mt-1">AED {money(week.customer_total)}</p>
                <p className="text-gray-600 text-[10px]">{week.orders} orders</p>
              </Card>

              <Card className="bg-gray-900 border-gray-800 p-3">
                <p className="text-gray-500 text-[10px] uppercase">This Month</p>
                <p className="text-white font-bold mt-1">AED {money(month.customer_total)}</p>
                <p className="text-gray-600 text-[10px]">{month.orders} orders</p>
              </Card>

              <Card className="bg-gray-900 border-gray-800 p-3">
                <p className="text-gray-500 text-[10px] uppercase">All Time</p>
                <p className="text-white font-bold mt-1">AED {money(all.customer_total)}</p>
                <p className="text-gray-600 text-[10px]">{all.orders} orders</p>
              </Card>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          {navItems
            .filter(item => hasPermission(item.perm))
            .map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="text-left"
                >
                  <Card className="bg-gray-900 border-gray-800 p-5 h-full hover:bg-gray-800/80 hover:border-gray-700 transition">
                    <Icon className={`w-7 h-7 ${item.color} mb-4`} />
                    <h3 className="text-white font-semibold">{item.label}</h3>
                    <p className="text-gray-500 text-[11px] mt-1 leading-4">
                      {item.subtitle}
                    </p>
                  </Card>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
