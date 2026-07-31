import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Bike,
  ChefHat,
  ClipboardList,
  Code2,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client, RestaurantSettings, SalesReport } from '@/lib/api';

interface Permissions {
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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'open' | 'busy' | 'closed'>(
    'open',
  );
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Permissions>({});

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const raw = localStorage.getItem('admin_auth');
    if (!raw) {
      navigate('/admin');
      return;
    }

    try {
      const auth = JSON.parse(raw);
      if (!auth.loggedIn) {
        navigate('/admin');
        return;
      }
      setIsSuperAdmin(auth.role === 'super_admin');
      setPermissions(auth.permissions || {});
    } catch {
      navigate('/admin');
      return;
    }

    await Promise.all([loadReport(), loadSettings()]);
    setLoading(false);
  }

  function allowed(key: keyof Permissions): boolean {
    return isSuperAdmin || Boolean(permissions[key]);
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
      console.error(error);
    }
  }

  async function loadSettings() {
    try {
      const response =
        await client.entities.restaurant_settings.query({
          query: {},
          limit: 1,
        });
      const settings = response?.data?.items?.[0] as
        | RestaurantSettings
        | undefined;
      if (settings) {
        setSettingsId(Number(settings.id));
        setStatus(
          (settings.restaurant_status || 'open') as
            | 'open'
            | 'busy'
            | 'closed',
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function changeStatus(
    next: 'open' | 'busy' | 'closed',
  ) {
    if (!settingsId) return;

    try {
      await client.entities.restaurant_settings.update({
        id: String(settingsId),
        data: { restaurant_status: next },
      });
      setStatus(next);
      toast.success(`Restaurant is now ${next}`);
    } catch {
      toast.error('Could not update restaurant status');
    }
  }

  function logout() {
    localStorage.removeItem('admin_auth');
    navigate('/admin');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading dashboard...</p>
      </div>
    );
  }

  const items = [
    {
      path: '/admin/orders',
      label: 'Orders',
      icon: ShoppingBag,
      color: 'text-blue-400',
      permission: 'orders' as const,
    },
    {
      path: '/admin/sales',
      label: 'Sales & Reports',
      icon: BarChart3,
      color: 'text-green-400',
      permission: 'sales' as const,
    },
    {
      path: '/admin/finance',
      label: 'Finance & Rider Cash',
      icon: Wallet,
      color: 'text-emerald-400',
      permission: 'sales' as const,
    },
    {
      path: '/admin/menu',
      label: 'Menu',
      icon: UtensilsCrossed,
      color: 'text-cyan-400',
      permission: 'menu' as const,
    },
    {
      path: '/admin/offers',
      label: 'Offers',
      icon: Tag,
      color: 'text-pink-400',
      permission: 'deals' as const,
    },
    {
      path: '/admin/deals',
      label: 'Deal Builder',
      icon: Package,
      color: 'text-orange-400',
      permission: 'deals' as const,
    },
    {
      path: '/admin/customers',
      label: 'Customers',
      icon: Users,
      color: 'text-purple-400',
      permission: 'customers' as const,
    },
    {
      path: '/admin/riders',
      label: 'Rider Management',
      icon: Bike,
      color: 'text-fuchsia-400',
      permission: 'riders' as const,
    },
    {
      path: '/admin/notifications',
      label: 'Notifications',
      icon: Bell,
      color: 'text-yellow-400',
      permission: 'notifications' as const,
    },
    {
      path: '/admin/feedback',
      label: 'Feedback',
      icon: MessageSquare,
      color: 'text-sky-400',
      permission: 'feedback' as const,
    },
    {
      path: '/admin/activity-logs',
      label: 'Activity Logs',
      icon: ClipboardList,
      color: 'text-amber-400',
      permission: 'logs' as const,
    },
    {
      path: '/admin/accounts',
      label: 'Admin Accounts',
      icon: Shield,
      color: 'text-indigo-400',
      permission: 'accounts' as const,
    },
    {
      path: '/admin/settings',
      label: 'Settings',
      icon: Settings,
      color: 'text-yellow-400',
      permission: 'settings' as const,
    },
    {
      path: '/kitchen',
      label: 'Kitchen Display',
      icon: ChefHat,
      color: 'text-orange-400',
      permission: 'kitchen' as const,
    },
  ].filter(item => allowed(item.permission));

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
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            className="text-gray-400"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {allowed('settings') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-white font-semibold">
                  Restaurant Status
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Controls what customers see
                </p>
              </div>

              <div className="flex gap-2">
                {(['open', 'busy', 'closed'] as const).map(value => (
                  <button
                    key={value}
                    onClick={() => void changeStatus(value)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize ${
                      status === value
                        ? value === 'open'
                          ? 'bg-green-600 text-white'
                          : value === 'busy'
                            ? 'bg-yellow-600 text-white'
                            : 'bg-red-600 text-white'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat
            title="Today Sales"
            value={`AED ${report?.daily_sales?.toFixed(0) || 0}`}
            detail={`${report?.daily_orders || 0} orders`}
            icon={TrendingUp}
            color="text-blue-400"
          />
          <Stat
            title="This Week"
            value={`AED ${report?.weekly_sales?.toFixed(0) || 0}`}
            detail={`${report?.weekly_orders || 0} orders`}
            icon={BarChart3}
            color="text-green-400"
          />
          <Stat
            title="This Month"
            value={`AED ${report?.monthly_sales?.toFixed(0) || 0}`}
            detail={`${report?.monthly_orders || 0} orders`}
            icon={BarChart3}
            color="text-purple-400"
          />
          <Stat
            title="Total Orders"
            value={String(report?.total_orders || 0)}
            detail="all time"
            icon={ShoppingBag}
            color="text-red-400"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map(({ path, label, icon: Icon, color }) => (
            <Card
              key={path}
              onClick={() => navigate(path)}
              className="bg-gray-900 border-gray-800 p-6 cursor-pointer hover:border-gray-600 transition-all"
            >
              <Icon className={`w-8 h-8 ${color} mb-3`} />
              <h2 className="text-white font-semibold">{label}</h2>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  detail,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  color: string;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800 p-4">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className="text-gray-500 text-xs">{title}</p>
      <p className="text-white font-bold mt-1">{value}</p>
      <p className="text-gray-600 text-[10px] mt-1">{detail}</p>
    </Card>
  );
}
