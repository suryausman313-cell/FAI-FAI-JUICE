import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bike,
  ChefHat,
  ClipboardList,
  Globe2,
  LogOut,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [adminSearch, setAdminSearch] = useState('');

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


  const navItems = useMemo(
    () => [
      {
        path: '/admin/orders',
        icon: ShoppingBag,
        label: 'Orders',
        subtitle: 'Live and past orders',
        keywords: 'order customer phone tracking cancel print',
        color: 'text-blue-400',
        perm: 'orders' as keyof AdminPermissions,
      },
      {
        path: '/admin/sales',
        icon: BarChart3,
        label: 'Sales & Reports',
        subtitle: 'Revenue, fees and payments',
        keywords: 'sales report revenue payment cash card vat fee',
        color: 'text-green-400',
        perm: 'sales' as keyof AdminPermissions,
      },
      {
        path: '/admin/finance',
        icon: Wallet,
        label: 'Finance & Rider Cash',
        subtitle: 'Cash collection and settlement',
        keywords: 'finance rider cash settlement pending approved',
        color: 'text-emerald-400',
        perm: 'sales' as keyof AdminPermissions,
      },
      {
        path: '/admin/menu',
        icon: UtensilsCrossed,
        label: 'Menu',
        subtitle: 'Items, prices and categories',
        keywords: 'menu item category price extra size product',
        color: 'text-cyan-400',
        perm: 'menu' as keyof AdminPermissions,
      },
      {
        path: '/admin/offers',
        icon: Tag,
        label: 'Offers',
        subtitle: 'Discounts and promo codes',
        keywords: 'offer discount promo coupon',
        color: 'text-pink-400',
        perm: 'deals' as keyof AdminPermissions,
      },
      {
        path: '/admin/deals',
        icon: Package,
        label: 'Deal Builder',
        subtitle: 'Build combination deals',
        keywords: 'deal combo bundle offer',
        color: 'text-orange-400',
        perm: 'deals' as keyof AdminPermissions,
      },
      {
        path: '/admin/customers',
        icon: Users,
        label: 'Customers',
        subtitle: 'Customer accounts and history',
        keywords: 'customer account phone history order',
        color: 'text-purple-400',
        perm: 'customers' as keyof AdminPermissions,
      },
      {
        path: '/admin/riders',
        icon: Bike,
        label: 'Rider Management',
        subtitle: 'Riders and assignments',
        keywords: 'rider driver delivery gps location assign',
        color: 'text-fuchsia-400',
        perm: 'riders' as keyof AdminPermissions,
      },
      {
        path: '/admin/notifications',
        icon: Bell,
        label: 'Notifications',
        subtitle: 'Send customer alerts',
        keywords: 'notification push alert message',
        color: 'text-yellow-400',
        perm: 'notifications' as keyof AdminPermissions,
      },
      {
        path: '/admin/feedback',
        icon: MessageSquare,
        label: 'Feedback',
        subtitle: 'Ratings and comments',
        keywords: 'feedback rating review comment',
        color: 'text-sky-400',
        perm: 'feedback' as keyof AdminPermissions,
      },
      {
        path: '/admin/activity-logs',
        icon: ClipboardList,
        label: 'Activity Logs',
        subtitle: 'Admin action history',
        keywords: 'activity log audit admin history',
        color: 'text-amber-400',
        perm: 'logs' as keyof AdminPermissions,
      },
      {
        path: '/admin/accounts',
        icon: Shield,
        label: 'Admin Accounts',
        subtitle: 'Staff access and permissions',
        keywords: 'admin account staff permission role security',
        color: 'text-indigo-400',
        perm: 'accounts' as keyof AdminPermissions,
      },
      {
        path: '/admin/languages',
        icon: Globe2,
        label: 'Languages',
        subtitle: 'Customer app languages & translations',
        keywords: 'language translation english arabic urdu locale rtl',
        color: 'text-blue-400',
        perm: 'settings' as keyof AdminPermissions,
      },
      {
        path: '/admin/settings',
        icon: Settings,
        label: 'Settings',
        subtitle: 'Shop and app controls',
        keywords: 'settings receipt printer checkout delivery fee restaurant security',
        color: 'text-yellow-400',
        perm: 'settings' as keyof AdminPermissions,
      },
      {
        path: '/kitchen',
        icon: ChefHat,
        label: 'Kitchen Display',
        subtitle: 'Open kitchen orders screen',
        keywords: 'kitchen display order printer',
        color: 'text-orange-400',
        perm: 'kitchen' as keyof AdminPermissions,
      },
    ],
    [],
  );

  const permittedNavItems = navItems.filter(item =>
    item.path === '/admin/sales'
      ? hasPermission('sales') || hasPermission('orders')
      : hasPermission(item.perm),
  );

  const normalizedAdminSearch = adminSearch.trim().toLowerCase();
  const filteredNavItems = normalizedAdminSearch
    ? permittedNavItems.filter(item => {
        const haystack = [
          item.label,
          item.subtitle,
          item.path,
          item.keywords || '',
        ]
          .join(' ')
          .toLowerCase();

        return normalizedAdminSearch
          .split(/\s+/)
          .filter(Boolean)
          .every(word => haystack.includes(word));
      })
    : permittedNavItems;

  function submitAdminSearch(): void {
    if (!normalizedAdminSearch) return;

    if (filteredNavItems.length === 1) {
      navigate(filteredNavItems[0].path);
    }
  }

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

        <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
          <form
            onSubmit={event => {
              event.preventDefault();
              submitAdminSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={adminSearch}
                onChange={event => setAdminSearch(event.target.value)}
                placeholder="Search admin: orders, riders, languages, settings..."
                className="bg-gray-950 border-gray-700 text-white pl-9 pr-10"
              />
              {adminSearch && (
                <button
                  type="button"
                  onClick={() => setAdminSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  aria-label="Clear admin search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </form>

          {normalizedAdminSearch && (
            <p className="text-gray-500 text-xs mt-2">
              {filteredNavItems.length} admin section{filteredNavItems.length === 1 ? '' : 's'} found
              {filteredNavItems.length === 1 ? ' — press Search or Enter to open it' : ''}
            </p>
          )}
        </Card>

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

        <div className="grid grid-cols-2 gap-4">
          {filteredNavItems.map(item => {
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

          {filteredNavItems.length === 0 && (
            <Card className="col-span-2 bg-gray-900 border-gray-800 p-8 text-center">
              <Search className="w-8 h-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No admin section found</p>
              <p className="text-gray-600 text-xs mt-1">
                Try orders, riders, languages, menu, finance or settings.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
