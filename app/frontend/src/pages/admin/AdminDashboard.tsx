import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ShoppingBag, Users, UtensilsCrossed, Settings, LogOut, TrendingUp, ChefHat, Tag, MessageSquare, Package, Bell, ClipboardList, Shield, Bike } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { client, SalesReport, RestaurantSettings } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';


const ADMIN_PANEL_PIN_STORAGE_KEY = 'kitchen_pin';

type AdminPanelRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function adminPanelApiRequest<T>(
  url: string,
  method: AdminPanelRequestMethod,
  data?: unknown
): Promise<T> {
  const pin = localStorage.getItem(ADMIN_PANEL_PIN_STORAGE_KEY) || '1234';
  const baseURL = getAPIBaseURL().replace(/\/$/, '');

  const response = await axios.request<T>({
    url: `${baseURL}${url}`,
    method,
    data,
    headers: {
      'Content-Type': 'application/json',
      'X-Kitchen-Pin': pin,
    },
  });

  return response.data;
}

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurantStatus, setRestaurantStatus] = useState<'open' | 'busy' | 'closed'>('open');
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<AdminPermissions>({});

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  function checkAuthAndLoad() {
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
      // Check if super admin or sub-admin
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
    loadReport();
    loadSettings();
    setLoading(false);
  }

  function hasPermission(key: string): boolean {
    if (isSuperAdmin) return true;
    return !!(permissions as any)[key];
  }

  async function loadReport() {
    try {
      const data = await adminPanelApiRequest<SalesReport>(
        '/api/v1/admin/sales-report',
        'GET'
      );
      setReport(data);
    } catch (e) {
      console.error('Failed to load report:', e);
    }
  }

  async function loadSettings() {
    try {
      const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
      const settings = res?.data?.items?.[0];
      if (settings) {
        setRestaurantStatus(settings.restaurant_status || 'open');
        setSettingsId(settings.id);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  async function updateStatus(newStatus: 'open' | 'busy' | 'closed') {
    if (!settingsId) return;
    try {
      await client.entities.restaurant_settings.update({
        id: String(settingsId),
        data: { restaurant_status: newStatus },
      });
      setRestaurantStatus(newStatus);
      toast.success(`Restaurant status changed to ${newStatus.toUpperCase()}`);
    } catch (e) {
      toast.error('Failed to update status');
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_auth');
    navigate('/admin');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  // Define all nav items with their required permission key
  const allNavItems = [
    { path: '/admin/orders', icon: ShoppingBag, label: 'Orders', color: 'text-blue-400', perm: 'orders' },
    { path: '/admin/sales', icon: BarChart3, label: 'Sales & Reports', color: 'text-green-400', perm: 'sales' },
    { path: '/admin/menu', icon: UtensilsCrossed, label: 'Menu', color: 'text-emerald-400', perm: 'menu' },
    { path: '/admin/offers', icon: Tag, label: 'Offers', color: 'text-pink-400', perm: 'deals' },
    { path: '/admin/deals', icon: Package, label: 'Deal Builder', color: 'text-orange-400', perm: 'deals' },
    { path: '/admin/notifications', icon: Bell, label: 'Notifications', color: 'text-yellow-400', perm: 'notifications' },
    { path: '/admin/customers', icon: Users, label: 'Customers', color: 'text-purple-400', perm: 'customers' },
    { path: '/admin/feedback', icon: MessageSquare, label: 'Feedback', color: 'text-cyan-400', perm: 'feedback' },
    { path: '/admin/activity-logs', icon: ClipboardList, label: 'Activity Logs', color: 'text-amber-400', perm: 'logs' },
    { path: '/admin/accounts', icon: Shield, label: 'Admin Accounts', color: 'text-indigo-400', perm: 'accounts' },
    { path: '/admin/riders', icon: Bike, label: 'Rider Management', color: 'text-pink-400', perm: 'riders' },
    { path: '/admin/settings', icon: Settings, label: 'Settings', color: 'text-yellow-400', perm: 'settings' },
    { path: '/kitchen', icon: ChefHat, label: 'Kitchen Display', color: 'text-orange-400', perm: 'kitchen' },
  ];

  // Filter nav items based on permissions
  const navItems = allNavItems.filter(item => hasPermission(item.perm));

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400">
              Vita Napoli Pizza Management
              {!isSuperAdmin && <span className="text-yellow-400 text-xs ml-2">({permissions ? 'Limited Access' : 'Staff'})</span>}
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

        {/* Restaurant Status Control - only for super admin or those with settings permission */}
        {hasPermission('settings') && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-sm">Restaurant Status</h3>
                <p className="text-gray-500 text-xs mt-0.5">Controls what customers see on the home page</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus('open')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    restaurantStatus === 'open'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  🟢 Open
                </button>
                <button
                  onClick={() => updateStatus('busy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    restaurantStatus === 'busy'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  🟡 Busy
                </button>
                <button
                  onClick={() => updateStatus('closed')}
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

        {/* Stats Cards - only for those with sales or orders permission */}
        {(hasPermission('sales') || hasPermission('orders')) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Today Sales</p>
                  <p className="text-white font-bold">AED {report?.daily_sales?.toFixed(0) || 0}</p>
                  <p className="text-blue-400 text-[10px]">{report?.daily_orders || 0} orders</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">This Week</p>
                  <p className="text-white font-bold">AED {report?.weekly_sales?.toFixed(0) || 0}</p>
                  <p className="text-green-400 text-[10px]">{report?.weekly_orders || 0} orders</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">This Month</p>
                  <p className="text-white font-bold">AED {report?.monthly_sales?.toFixed(0) || 0}</p>
                  <p className="text-purple-400 text-[10px]">{report?.monthly_orders || 0} orders</p>
                </div>
              </div>
            </Card>
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Total Orders</p>
                  <p className="text-white font-bold">{report?.total_orders || 0}</p>
                  <p className="text-red-400 text-[10px]">all time</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Payment Method Breakdown - Today */}
        {hasPermission('sales') && report?.today_payment_breakdown && Object.keys(report.today_payment_breakdown).length > 0 && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
            <h3 className="text-white font-semibold text-sm mb-3">💰 Today's Payment Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(report.today_payment_breakdown).map(([method, info]: [string, any]) => (
                <div key={method} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${method.toLowerCase().includes('cash') ? 'bg-green-500' : method.toLowerCase().includes('card') ? 'bg-blue-500' : 'bg-orange-500'}`} />
                    <span className="text-gray-300 text-xs">{method}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-green-400 font-bold text-xs">AED {info.revenue?.toFixed(0)}</span>
                    <span className="text-gray-500 text-[10px] ml-1">({info.orders})</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Custom Period Check - link to Sales */}
        {hasPermission('sales') && (
          <Card className="bg-gray-900/50 border-gray-800 p-3 mb-8 cursor-pointer hover:border-gray-600 transition-all" onClick={() => navigate('/admin/sales')}>
            <div className="flex items-center justify-between">
              <p className="text-gray-400 text-sm">📊 Want to check custom date range, export reports, or see detailed order history?</p>
              <span className="text-green-400 text-sm font-medium">Sales & Reports →</span>
            </div>
          </Card>
        )}

        {/* Navigation Cards - filtered by permissions */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {navItems.map(({ path, icon: Icon, label, color }) => (
            <Card
              key={path}
              className="bg-gray-900 border-gray-800 p-6 cursor-pointer hover:border-gray-600 transition-all"
              onClick={() => navigate(path)}
            >
              <Icon className={`w-8 h-8 ${color} mb-3`} />
              <h3 className="text-white font-semibold">{label}</h3>
            </Card>
          ))}
        </div>

        {/* Kitchen Access Info - only if has kitchen permission */}
        {hasPermission('kitchen') && (
          <Card className="bg-orange-600/5 border-orange-600/20 p-4 mb-8">
            <div className="flex items-start gap-3">
              <ChefHat className="w-5 h-5 text-orange-400 mt-0.5" />
              <div>
                <p className="text-orange-400 font-medium text-sm">Kitchen Display (Separate Device)</p>
                <p className="text-gray-400 text-xs mt-1">
                  Open <span className="text-orange-300 font-mono">/kitchen</span> on your kitchen tablet/phone to accept orders.
                  PIN: <span className="text-orange-300 font-mono">1234</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Best Selling Items */}
        {hasPermission('sales') && report?.best_selling_items && report.best_selling_items.length > 0 && (
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Best Selling Items</h3>
            <div className="space-y-3">
              {report.best_selling_items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm w-6">{idx + 1}.</span>
                    <span className="text-gray-300">{item.name}</span>
                  </div>
                  <span className="text-gray-400 text-sm">{item.quantity} sold</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* No permissions message for very restricted accounts */}
        {navItems.length === 0 && (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No sections available</p>
            <p className="text-gray-600 text-sm mt-1">Contact the Super Admin to get access to sections</p>
          </div>
        )}
      </div>
    </div>
  );
}
