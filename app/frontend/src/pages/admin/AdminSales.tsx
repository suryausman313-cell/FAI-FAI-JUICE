import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, BarChart3, ShoppingBag, DollarSign, Download, Trash2, RotateCcw, Search, Calendar, Star, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { client, Order } from '@/lib/api';
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


type FilterPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface PaymentInfo {
  revenue: number;
  orders: number;
}

interface FeeReport {
  today: number;
  week: number;
  month: number;
  year: number;
  all: number;
}

interface SalesStats {
  daily_sales: number;
  weekly_sales: number;
  monthly_sales: number;
  total_orders: number;
  daily_orders: number;
  weekly_orders: number;
  monthly_orders: number;
  best_selling_items: { name: string; quantity: number }[];
  payment_breakdown: Record<string, PaymentInfo>;
  today_payment_breakdown: Record<string, PaymentInfo>;
  fee_report?: {
    service_fee: FeeReport;
    small_order_fee: FeeReport;
  };
}

function TipsReport() {
  const [tipsData, setTipsData] = useState<{
    rider_tips: { today: number; week: number; month: number; all: number };
    shop_tips: { today: number; week: number; month: number; all: number };
    total_tips: { today: number; all: number };
    rider_breakdown: { rider_id: number; rider_name: string; total_tips: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTips();
  }, []);

  async function loadTips() {
    try {
      const payload = await adminPanelApiRequest<NonNullable<typeof tipsData>>(
        '/api/v1/admin/tips-report',
        'GET'
      );
      setTipsData(payload);
    } catch (e) {
      console.error('Tips report error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;
  if (!tipsData) return null;

  const hasTips = (tipsData.total_tips.all || 0) > 0;
  if (!hasTips) return null;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💝</span>
        <h3 className="text-white font-semibold text-sm">Tips Report</h3>
        <Badge className="bg-pink-600/20 text-pink-400 text-[10px] border-0">Not included in sales</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rider Tips */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🛵</span>
            <h4 className="text-white font-semibold text-sm">Rider Tips</h4>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">Today</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.rider_tips.today.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">This Week</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.rider_tips.week.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">This Month</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.rider_tips.month.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-pink-600/20">
              <span className="text-gray-200 text-sm font-medium">All Time</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.rider_tips.all.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        {/* Shop Tips */}
        <Card className="bg-gray-900 border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🏪</span>
            <h4 className="text-white font-semibold text-sm">Shop Tips</h4>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">Today</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.shop_tips.today.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">This Week</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.shop_tips.week.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-200 text-sm">This Month</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.shop_tips.month.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-pink-600/20">
              <span className="text-gray-200 text-sm font-medium">All Time</span>
              <span className="text-pink-400 font-bold text-sm">AED {tipsData.shop_tips.all.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Per-Rider Breakdown */}
      {tipsData.rider_breakdown && tipsData.rider_breakdown.length > 0 && (
        <Card className="bg-gray-900 border-gray-800 p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">👤</span>
            <h4 className="text-white font-semibold text-sm">Tips Per Rider (All Time)</h4>
          </div>
          <div className="space-y-2">
            {tipsData.rider_breakdown.map((rider) => (
              <div key={rider.rider_id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-gray-200 text-sm">{rider.rider_name}</span>
                <span className="text-pink-400 font-bold text-sm">AED {rider.total_tips.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Total Summary */}
      <div className="mt-3 flex items-center justify-between bg-pink-600/10 border border-pink-600/20 rounded-lg px-4 py-3">
        <span className="text-gray-200 text-sm font-medium">Total Tips Collected (All Time)</span>
        <span className="text-pink-400 font-bold">AED {tipsData.total_tips.all.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function AdminSales() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<SalesStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Order | null>(null);
  const [permanentDeleteAll, setPermanentDeleteAll] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [orders, filterPeriod, searchQuery, dateFrom, dateTo]);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    await loadData();
    setLoading(false);
  }

  async function loadData() {
    setRefreshing(true);
    try {
      // Load sales report
      try {
        const reportPayload = await adminPanelApiRequest<SalesStats>(
          '/api/v1/admin/sales-report',
          'GET'
        );
        setReport(reportPayload);
      } catch (e) {
        console.error('Sales report API error:', e);
      }

      // Load all orders
      try {
        const ordersPayload = await adminPanelApiRequest<{ items?: Order[] }>(
          '/api/v1/admin/orders?limit=500',
          'GET'
        );
        setOrders(ordersPayload?.items || []);
      } catch (e) {
        console.error('Orders API error:', e);
        // Fallback: try entity query
        try {
          const res = await client.entities.orders.query({ query: {}, sort: '-created_at', limit: 500 });
          const items = (res?.data?.items || []).map((o: any) => ({
            id: o.id,
            user_id: o.user_id,
            customer_name: o.customer_name || 'Unknown',
            customer_phone: o.customer_phone || '',
            estimated_time: o.pickup_time || '',
            order_notes: o.order_notes || '',
            payment_method: o.payment_method || 'Cash',
            status: o.status || 'new',
            total_amount: o.total_amount || 0,
            items_json: o.items_json || '[]',
            created_at: o.created_at || '',
            updated_at: o.updated_at || '',
          }));
          setOrders(items);
        } catch (e2) {
          console.error('Entity query also failed:', e2);
        }
      }

      // Load deleted orders from localStorage
      const deleted = localStorage.getItem('deleted_orders');
      if (deleted) {
        try { setDeletedOrders(JSON.parse(deleted)); } catch { /* */ }
      }
    } catch (e) {
      console.error('Failed to load sales data:', e);
    } finally {
      setRefreshing(false);
    }
  }

  function applyFilters() {
    let filtered = [...orders];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Period filter
    switch (filterPeriod) {
      case 'today':
        filtered = filtered.filter(o => new Date(o.created_at) >= startOfDay);
        break;
      case 'yesterday': {
        const yesterday = new Date(startOfDay);
        yesterday.setDate(yesterday.getDate() - 1);
        filtered = filtered.filter(o => {
          const d = new Date(o.created_at);
          return d >= yesterday && d < startOfDay;
        });
        break;
      }
      case 'week': {
        const weekAgo = new Date(startOfDay);
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = filtered.filter(o => new Date(o.created_at) >= weekAgo);
        break;
      }
      case 'month': {
        const monthAgo = new Date(startOfDay);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = filtered.filter(o => new Date(o.created_at) >= monthAgo);
        break;
      }
      case 'year': {
        const yearAgo = new Date(startOfDay);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        filtered = filtered.filter(o => new Date(o.created_at) >= yearAgo);
        break;
      }
      case 'custom':
        if (dateFrom) filtered = filtered.filter(o => new Date(o.created_at) >= new Date(dateFrom));
        if (dateTo) filtered = filtered.filter(o => new Date(o.created_at) <= new Date(dateTo + 'T23:59:59'));
        break;
      case 'all':
      default:
        break;
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_phone?.includes(q) ||
        String(o.id).includes(q)
      );
    }

    setFilteredOrders(filtered);
  }

  function getFilteredStats() {
    const completedOrders = filteredOrders.filter(o => o.status !== 'cancelled');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalOrders = filteredOrders.length;
    const avgOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    return { totalRevenue, totalOrders, avgOrderValue, completedCount: completedOrders.length };
  }

  async function deleteOrder(order: Order) {
    if (!confirm(`⚠️ Delete Order #${order.id}?\n\nCustomer: ${order.customer_name}\nAmount: AED ${order.total_amount?.toFixed(2)}\n\nIt will be moved to trash and can be restored later.`)) return;
    try {
      await adminPanelApiRequest(
        `/api/v1/admin/orders/${order.id}/status`,
        'PUT',
        { status: 'cancelled', cancel_reason: 'Moved to sales trash' }
      );
    } catch {
      // If API fails, still move to trash locally
    }
    const newDeleted = [...deletedOrders, { ...order, status: 'deleted' }];
    setDeletedOrders(newDeleted);
    localStorage.setItem('deleted_orders', JSON.stringify(newDeleted));
    setOrders(prev => prev.filter(o => o.id !== order.id));
    toast.success(`Order #${order.id} moved to trash`);
  }

  function deleteDayOrders(dateStr: string) {
    const dayOrders = filteredOrders.filter(o => {
      const d = new Date(o.created_at);
      return d.toLocaleDateString() === dateStr;
    });
    if (dayOrders.length === 0) return;
    if (!confirm(`⚠️ Delete ALL ${dayOrders.length} orders from ${dateStr}?\n\nThey will be moved to trash.`)) return;

    const newDeleted = [...deletedOrders, ...dayOrders.map(o => ({ ...o, status: 'deleted' }))];
    setDeletedOrders(newDeleted);
    localStorage.setItem('deleted_orders', JSON.stringify(newDeleted));
    const deleteIds = new Set(dayOrders.map(o => o.id));
    setOrders(prev => prev.filter(o => !deleteIds.has(o.id)));
    toast.success(`${dayOrders.length} orders from ${dateStr} moved to trash`);
  }

  function restoreOrder(order: Order) {
    const newDeleted = deletedOrders.filter(o => o.id !== order.id);
    setDeletedOrders(newDeleted);
    localStorage.setItem('deleted_orders', JSON.stringify(newDeleted));
    setOrders(prev => [...prev, { ...order, status: 'completed' }].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    toast.success(`Order #${order.id} restored`);
  }

  function restoreAll() {
    if (!confirm(`Restore all ${deletedOrders.length} deleted orders?`)) return;
    setOrders(prev => [...prev, ...deletedOrders.map(o => ({ ...o, status: 'completed' }))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    setDeletedOrders([]);
    localStorage.removeItem('deleted_orders');
    toast.success('All orders restored');
  }

  function initPermanentDelete(order: Order | null, all: boolean = false) {
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    setGeneratedOtp(otp);
    setDeleteOtp('');
    setPermanentDeleteTarget(order);
    setPermanentDeleteAll(all);
  }

  async function confirmPermanentDelete() {
    if (deleteOtp !== generatedOtp) {
      toast.error('Incorrect OTP code. Please try again.');
      return;
    }
    if (permanentDeleteAll) {
      // Permanently delete all
      for (const order of deletedOrders) {
        try {
          await client.entities.orders.delete({ id: String(order.id) });
        } catch { /* continue */ }
      }
      setDeletedOrders([]);
      localStorage.removeItem('deleted_orders');
      toast.success('All orders permanently deleted');
    } else if (permanentDeleteTarget) {
      // Permanently delete single order
      try {
        await client.entities.orders.delete({ id: String(permanentDeleteTarget.id) });
      } catch { /* continue */ }
      const newDeleted = deletedOrders.filter(o => o.id !== permanentDeleteTarget.id);
      setDeletedOrders(newDeleted);
      localStorage.setItem('deleted_orders', JSON.stringify(newDeleted));
      toast.success(`Order #${permanentDeleteTarget.id} permanently deleted`);
    }
    setPermanentDeleteTarget(null);
    setPermanentDeleteAll(false);
    setDeleteOtp('');
    setGeneratedOtp('');
  }

  function cancelPermanentDelete() {
    setPermanentDeleteTarget(null);
    setPermanentDeleteAll(false);
    setDeleteOtp('');
    setGeneratedOtp('');
  }

  function exportCSV() {
    const headers = ['Order ID', 'Customer', 'Phone', 'Items', 'Total (AED)', 'Payment', 'Status', 'Date'];
    const rows = filteredOrders.map(o => {
      let items = '';
      try {
        const parsed = JSON.parse(o.items_json);
        items = parsed.map((i: any) => `${i.quantity}x ${i.name}`).join('; ');
      } catch { items = '-'; }
      return [
        o.id,
        `"${o.customer_name}"`,
        o.customer_phone,
        `"${items}"`,
        o.total_amount?.toFixed(2),
        o.payment_method,
        o.status,
        new Date(o.created_at).toLocaleString(),
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vita-napoli-sales-${filterPeriod}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('✅ CSV exported — open in Excel');
  }

  function exportReport() {
    const stats = getFilteredStats();
    const periodLabel = filterPeriod === 'custom' ? `${dateFrom} to ${dateTo}` : filterPeriod.toUpperCase();
    const content = `
╔══════════════════════════════════════════════╗
║     VITA NAPOLI PIZZA - SALES REPORT        ║
╚══════════════════════════════════════════════╝

Period: ${periodLabel}
Generated: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Revenue:        AED ${stats.totalRevenue.toFixed(2)}
Total Orders:         ${stats.totalOrders}
Completed Orders:     ${stats.completedCount}
Average Order Value:  AED ${stats.avgOrderValue.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEST SELLING ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${report?.best_selling_items?.map((item, i) => `${i + 1}. ${item.name} — ${item.quantity} sold`).join('\n') || 'No data'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${filteredOrders.map(o => {
  let items = '';
  try {
    const parsed = JSON.parse(o.items_json);
    items = parsed.map((i: any) => `    ${i.quantity}x ${i.name} (${i.size}) — AED ${i.price?.toFixed(2) || '0.00'}`).join('\n');
  } catch { items = '    -'; }
  return `Order #${o.id} | ${o.customer_name} | ${o.payment_method} | ${o.status}
  Date: ${new Date(o.created_at).toLocaleString()}
  Total: AED ${o.total_amount?.toFixed(2)}
${items}${o.order_notes ? `\n    Notes: ${o.order_notes}` : ''}`;
}).join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
End of Report
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vita-napoli-report-${filterPeriod}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('✅ Report exported');
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading sales data...</div></div>;

  const stats = getFilteredStats();
  const statusColor: Record<string, string> = {
    new: 'bg-blue-600',
    accepted: 'bg-green-600',
    preparing: 'bg-yellow-600',
    ready: 'bg-purple-600',
    completed: 'bg-gray-600',
    cancelled: 'bg-red-600',
  };

  // Group orders by date for day-delete feature
  const ordersByDate: Record<string, Order[]> = {};
  filteredOrders.forEach(o => {
    const dateKey = new Date(o.created_at).toLocaleDateString();
    if (!ordersByDate[dateKey]) ordersByDate[dateKey] = [];
    ordersByDate[dateKey].push(o);
  });

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Sales & Reports</h1>
            <p className="text-gray-500 text-xs">Complete sales analytics and order history</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => loadData()} disabled={refreshing} className="text-gray-400 hover:text-white cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Summary Stats from API */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card className="bg-gray-900 border-gray-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-gray-400 text-[10px] uppercase">Today</span>
            </div>
            <p className="text-white font-bold">AED {report?.daily_sales?.toFixed(0) || 0}</p>
            <p className="text-gray-600 text-[10px]">{report?.daily_orders || 0} orders</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-400 text-[10px] uppercase">Week</span>
            </div>
            <p className="text-white font-bold">AED {report?.weekly_sales?.toFixed(0) || 0}</p>
            <p className="text-gray-600 text-[10px]">{report?.weekly_orders || 0} orders</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-gray-400 text-[10px] uppercase">Month</span>
            </div>
            <p className="text-white font-bold">AED {report?.monthly_sales?.toFixed(0) || 0}</p>
            <p className="text-gray-600 text-[10px]">{report?.monthly_orders || 0} orders</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-3.5 h-3.5 text-red-400" />
              <span className="text-gray-400 text-[10px] uppercase">Total</span>
            </div>
            <p className="text-white font-bold">{report?.total_orders || orders.length}</p>
            <p className="text-gray-600 text-[10px]">all time orders</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-gray-400 text-[10px] uppercase">Avg Order</span>
            </div>
            <p className="text-white font-bold">AED {stats.avgOrderValue.toFixed(0)}</p>
            <p className="text-gray-600 text-[10px]">per order</p>
          </Card>
        </div>

        {/* Payment Method Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Today's Payment Breakdown */}
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-green-400" />
              <h3 className="text-white font-semibold text-sm">Today's Payment Methods</h3>
            </div>
            <div className="space-y-2">
              {report?.today_payment_breakdown && Object.keys(report.today_payment_breakdown).length > 0 ? (
                Object.entries(report.today_payment_breakdown).map(([method, info]) => (
                  <div key={method} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${method.toLowerCase().includes('cash') ? 'bg-green-500' : method.toLowerCase().includes('card') ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      <span className="text-gray-200 text-sm">{method}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 font-bold text-sm">AED {info.revenue.toFixed(0)}</span>
                      <span className="text-gray-500 text-xs ml-2">({info.orders} orders)</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-sm">No orders today</p>
              )}
            </div>
          </Card>

          {/* All-Time Payment Breakdown */}
          <Card className="bg-gray-900 border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-purple-400" />
              <h3 className="text-white font-semibold text-sm">All-Time Payment Methods</h3>
            </div>
            <div className="space-y-2">
              {report?.payment_breakdown && Object.keys(report.payment_breakdown).length > 0 ? (
                Object.entries(report.payment_breakdown).map(([method, info]) => (
                  <div key={method} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${method.toLowerCase().includes('cash') ? 'bg-green-500' : method.toLowerCase().includes('card') ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      <span className="text-gray-200 text-sm">{method}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 font-bold text-sm">AED {info.revenue.toFixed(0)}</span>
                      <span className="text-gray-500 text-xs ml-2">({info.orders} orders)</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-sm">No orders yet</p>
              )}
            </div>
          </Card>
        </div>

        {/* Fee Reports */}
        {report?.fee_report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {/* Service Fee Report */}
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-cyan-400" />
                <h3 className="text-white font-semibold text-sm">Service Fee Collected</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">Today</span>
                  <span className="text-cyan-400 font-bold text-sm">AED {report.fee_report.service_fee.today.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Week</span>
                  <span className="text-cyan-400 font-bold text-sm">AED {report.fee_report.service_fee.week.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Month</span>
                  <span className="text-cyan-400 font-bold text-sm">AED {report.fee_report.service_fee.month.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Year</span>
                  <span className="text-cyan-400 font-bold text-sm">AED {report.fee_report.service_fee.year.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-cyan-600/20">
                  <span className="text-gray-200 text-sm font-medium">All Time</span>
                  <span className="text-cyan-400 font-bold text-sm">AED {report.fee_report.service_fee.all.toFixed(2)}</span>
                </div>
              </div>
            </Card>

            {/* Small Order Fee Report */}
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-orange-400" />
                <h3 className="text-white font-semibold text-sm">Small Order Fee Collected</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">Today</span>
                  <span className="text-orange-400 font-bold text-sm">AED {report.fee_report.small_order_fee.today.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Week</span>
                  <span className="text-orange-400 font-bold text-sm">AED {report.fee_report.small_order_fee.week.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Month</span>
                  <span className="text-orange-400 font-bold text-sm">AED {report.fee_report.small_order_fee.month.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-200 text-sm">This Year</span>
                  <span className="text-orange-400 font-bold text-sm">AED {report.fee_report.small_order_fee.year.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-orange-600/20">
                  <span className="text-gray-200 text-sm font-medium">All Time</span>
                  <span className="text-orange-400 font-bold text-sm">AED {report.fee_report.small_order_fee.all.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tips Report - Separate from Sales */}
        <TipsReport />

        {/* Best Selling Items */}
        {report?.best_selling_items && report.best_selling_items.length > 0 && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-yellow-400" />
              <h3 className="text-white font-semibold text-sm">Best Selling Items</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {report.best_selling_items.slice(0, 8).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-bold text-xs w-5">{idx + 1}.</span>
                    <span className="text-gray-200 text-sm">{item.name}</span>
                  </div>
                  <Badge className="bg-gray-700 text-gray-300 text-[10px]">{item.quantity} sold</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[130px]">
              <label className="text-gray-400 text-[10px] uppercase mb-1 block">Period</label>
              <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as FilterPeriod)}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filterPeriod === 'custom' && (
              <>
                <div>
                  <label className="text-gray-400 text-[10px] uppercase mb-1 block">From</label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-gray-800 border-gray-700 text-white w-36 h-9" />
                </div>
                <div>
                  <label className="text-gray-400 text-[10px] uppercase mb-1 block">To</label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-gray-800 border-gray-700 text-white w-36 h-9" />
                </div>
              </>
            )}

            <div className="flex-1 min-w-[150px]">
              <label className="text-gray-400 text-[10px] uppercase mb-1 block">Search</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Name, phone, order #"
                  className="bg-gray-800 border-gray-700 text-white pl-8 h-9"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={exportCSV} className="bg-green-700 hover:bg-green-600 text-white h-9 cursor-pointer">
                <Download className="w-3 h-3 mr-1" /> Excel/CSV
              </Button>
              <Button size="sm" onClick={exportReport} className="bg-blue-700 hover:bg-blue-600 text-white h-9 cursor-pointer">
                <Download className="w-3 h-3 mr-1" /> PDF Report
              </Button>
            </div>
          </div>
        </Card>

        {/* Toggle: Active / Deleted */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setShowDeleted(false)}
              className={`cursor-pointer ${!showDeleted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-transparent text-gray-400 hover:text-white hover:bg-transparent'}`}
            >
              <ShoppingBag className="w-3 h-3 mr-1" /> Orders ({filteredOrders.length})
            </Button>
            <Button
              size="sm"
              onClick={() => setShowDeleted(true)}
              className={`cursor-pointer ${showDeleted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-transparent text-gray-400 hover:text-white hover:bg-transparent'}`}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Trash ({deletedOrders.length})
            </Button>
          </div>
          {!showDeleted && (
            <div className="text-right">
              <span className="text-gray-400 text-xs">Revenue: </span>
              <span className="text-green-400 font-bold text-sm">AED {stats.totalRevenue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Orders List */}
        {!showDeleted ? (
          <div className="space-y-1">
            {filteredOrders.length === 0 && (
              <div className="text-center py-16">
                <Calendar className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">No orders found for this period</p>
                <p className="text-gray-700 text-xs mt-1">Try changing the filter or date range</p>
              </div>
            )}

            {/* Group by date */}
            {Object.entries(ordersByDate).map(([dateStr, dayOrders]) => (
              <div key={dateStr} className="mb-4">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-400 text-xs font-medium">{dateStr}</span>
                    <Badge className="bg-gray-800 text-gray-400 text-[10px]">{dayOrders.length} orders</Badge>
                    <span className="text-green-500 text-xs font-medium">
                      AED {dayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total_amount || 0), 0).toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteDayOrders(dateStr)}
                    className="text-gray-700 hover:text-red-400 text-[10px] cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete Day
                  </button>
                </div>
                <div className="space-y-1.5">
                  {dayOrders.map(order => {
                    let items: any[] = [];
                    try { items = JSON.parse(order.items_json); } catch { /* */ }
                    return (
                      <Card key={order.id} className="bg-gray-900 border-gray-800 p-3 hover:border-gray-700 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setDetailOrder(order)}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold text-sm">#{order.id}</span>
                                <Badge className={`${statusColor[order.status] || 'bg-gray-600'} text-white text-[9px] px-1.5`}>
                                  {order.status}
                                </Badge>
                                <span className="text-gray-500 text-[10px]">{order.payment_method || 'Cash'}</span>
                              </div>
                              <p className="text-gray-400 text-xs mt-0.5 truncate">
                                {order.customer_name} • {items.length} item{items.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-green-400 font-bold text-sm">AED {order.total_amount?.toFixed(2)}</span>
                            <button onClick={() => setDetailOrder(order)} className="text-gray-600 hover:text-blue-400 cursor-pointer p-1">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteOrder(order)} className="text-gray-700 hover:text-red-400 cursor-pointer p-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Deleted Orders */
          <div className="space-y-2">
            {deletedOrders.length > 0 && (
              <div className="flex justify-between items-center mb-2">
                <Button size="sm" variant="ghost" onClick={() => initPermanentDelete(null, true)} className="text-red-400 hover:text-red-300 text-xs cursor-pointer">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete All Permanently
                </Button>
                <Button size="sm" variant="ghost" onClick={restoreAll} className="text-green-400 hover:text-green-300 text-xs cursor-pointer">
                  <RotateCcw className="w-3 h-3 mr-1" /> Restore All
                </Button>
              </div>
            )}
            {deletedOrders.length === 0 && (
              <div className="text-center py-16">
                <Trash2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">Trash is empty</p>
                <p className="text-gray-700 text-xs mt-1">Deleted orders will appear here</p>
              </div>
            )}
            {deletedOrders.map(order => (
              <Card key={order.id} className="bg-gray-900 border-gray-800 p-3 opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">#{order.id}</span>
                      <span className="text-gray-400 text-xs">{order.customer_name}</span>
                    </div>
                    <p className="text-gray-600 text-[10px]">AED {order.total_amount?.toFixed(2)} • {new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => restoreOrder(order)} className="text-green-400 hover:text-green-300 cursor-pointer">
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => initPermanentDelete(order, false)} className="text-red-400 hover:text-red-300 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Permanent Delete OTP Dialog */}
      <Dialog open={!!permanentDeleteTarget || permanentDeleteAll} onOpenChange={cancelPermanentDelete}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Permanent Delete
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {permanentDeleteAll
                ? `This will permanently delete ALL ${deletedOrders.length} orders from trash. This action CANNOT be undone.`
                : `This will permanently delete Order #${permanentDeleteTarget?.id}. This action CANNOT be undone.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-3">
              <p className="text-red-300 text-sm font-medium mb-1">⚠️ Security Verification Required</p>
              <p className="text-gray-400 text-xs">Enter this OTP code to confirm deletion:</p>
              <p className="text-white text-2xl font-bold tracking-widest mt-2 text-center bg-gray-800 rounded-lg py-2">
                {generatedOtp}
              </p>
            </div>
            <div>
              <Input
                value={deleteOtp}
                onChange={e => setDeleteOtp(e.target.value)}
                placeholder="Enter OTP code"
                maxLength={4}
                className="bg-gray-800 border-gray-700 text-white text-center text-lg tracking-widest"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={cancelPermanentDelete}
                variant="ghost"
                className="flex-1 text-gray-400 hover:text-white cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmPermanentDelete}
                disabled={deleteOtp.length !== 4}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Order #{detailOrder?.id}
              {detailOrder && (
                <Badge className={`${statusColor[detailOrder.status] || 'bg-gray-600'} text-white text-xs`}>
                  {detailOrder.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-[10px] uppercase">Customer</p>
                  <p className="text-white font-medium">{detailOrder.customer_name}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-[10px] uppercase">Phone</p>
                  <p className="text-white font-medium">{detailOrder.customer_phone}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-[10px] uppercase">Payment Method</p>
                  <p className="text-white font-medium">{detailOrder.payment_method || 'Cash'}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-[10px] uppercase">Date & Time</p>
                  <p className="text-white font-medium text-sm">{new Date(detailOrder.created_at).toLocaleString()}</p>
                </div>
              </div>

              {detailOrder.estimated_time && (
                <div className="bg-orange-600/10 border border-orange-600/20 rounded-lg p-3">
                  <p className="text-orange-400 text-xs">Estimated Ready Time: <span className="font-bold">{detailOrder.estimated_time}</span></p>
                </div>
              )}

              {detailOrder.order_notes && (
                <div className="bg-yellow-600/10 border border-yellow-600/20 rounded-lg p-3">
                  <p className="text-yellow-400 text-xs font-medium">📝 Customer Notes:</p>
                  <p className="text-yellow-200 text-sm mt-1">{detailOrder.order_notes}</p>
                </div>
              )}

              <div>
                <p className="text-gray-400 text-[10px] uppercase mb-2">Items Ordered</p>
                <div className="space-y-2">
                  {(() => {
                    try {
                      const items = JSON.parse(detailOrder.items_json);
                      return items.map((item: any, idx: number) => (
                        <div key={idx} className="bg-gray-800 rounded-lg p-3 flex justify-between items-start">
                          <div>
                            <p className="text-white font-medium">{item.quantity}x {item.name}</p>
                            <p className="text-gray-400 text-xs">Size: {item.size}</p>
                            {item.extras?.length > 0 && (
                              <p className="text-gray-500 text-xs mt-0.5">+ {item.extras.join(', ')}</p>
                            )}
                          </div>
                          <span className="text-green-400 font-bold">AED {item.price?.toFixed(2) || '0.00'}</span>
                        </div>
                      ));
                    } catch { return <p className="text-gray-500 text-sm">Unable to parse items</p>; }
                  })()}
                </div>
              </div>

              <div className="bg-green-600/10 border border-green-600/20 rounded-lg p-4 text-center">
                <p className="text-gray-400 text-xs">Total Amount</p>
                <p className="text-green-400 font-bold text-2xl">AED {detailOrder.total_amount?.toFixed(2)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
