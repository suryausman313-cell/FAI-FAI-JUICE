import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Users, Wifi, WifiOff, Clock, ShoppingBag, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { client } from '@/lib/api';

interface Customer {
  user_id?: string;
  customer_name: string;
  customer_phone: string;
  total_orders: number;
  total_spent: number;
  last_order_date?: string | null;
  is_online: boolean;
  last_active?: string | null;
  first_seen?: string | null;
  is_guest?: boolean;
}

type FilterStatus = 'all' | 'online' | 'offline';

export default function AdminCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  useEffect(() => {
    if (!loading) loadCustomers();
  }, [search, filterStatus]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      loadCustomers(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [search, filterStatus]);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); setLoading(false); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); setLoading(false); return; }
    } catch { navigate('/admin'); setLoading(false); return; }
    await loadCustomers();
    setLoading(false);
  }

  const loadCustomers = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (search) params.search = search;
      if (filterStatus !== 'all') params.filter_status = filterStatus;
      const res = await client.apiCall.invoke({
        url: '/api/v1/admin/customers-enhanced',
        method: 'GET',
        data: params,
      });
      setCustomers(res.data?.items || []);
      setTotalCustomers(res.data?.total_customers || 0);
      setOnlineCount(res.data?.online_count || 0);
    } catch (e) {
      console.error('Failed to load customers:', e);
      // Fallback to basic endpoint
      try {
        const params: Record<string, string | number> = { limit: 100 };
        if (search) params.search = search;
        const res = await client.apiCall.invoke({
          url: '/api/v1/admin/customers',
          method: 'GET',
          data: params,
        });
        setCustomers(res.data?.items || []);
        setTotalCustomers(res.data?.items?.length || 0);
      } catch { /* ignore */ }
    } finally {
      setRefreshing(false);
    }
  }, [search, filterStatus]);

  function formatTimeAgo(dateStr: string | undefined | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-white text-2xl font-bold">Customer Management</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadCustomers()}
            className={`ml-auto text-gray-400 cursor-pointer ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{totalCustomers}</p>
            <p className="text-xs text-gray-400">Total</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <Wifi className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">{onlineCount}</p>
            <p className="text-xs text-gray-400">Online Now</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <WifiOff className="w-5 h-5 text-gray-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-400">{totalCustomers - onlineCount}</p>
            <p className="text-xs text-gray-400">Offline</p>
          </Card>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white pl-10"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'online', 'offline'] as FilterStatus[]).map(status => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className={`cursor-pointer capitalize ${
                filterStatus === status
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                  : 'border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {status === 'online' && <Wifi className="w-3 h-3 mr-1" />}
              {status === 'offline' && <WifiOff className="w-3 h-3 mr-1" />}
              {status === 'all' && <Users className="w-3 h-3 mr-1" />}
              {status}
            </Button>
          ))}
        </div>

        {/* Customer List */}
        <div className="space-y-3">
          {customers.map((customer, idx) => (
            <Card key={idx} className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Online indicator */}
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${customer.is_online ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{customer.customer_name || 'Guest'}</h3>
                      <Badge variant="outline" className={customer.is_guest ? 'text-yellow-400 border-yellow-600/40 text-[10px] px-1.5 py-0' : 'text-blue-400 border-blue-600/40 text-[10px] px-1.5 py-0'}>
                        {customer.is_guest ? '👤 Guest' : '✓ Registered'}
                      </Badge>
                    </div>
                    <p className="text-gray-400 text-sm">{customer.customer_phone || 'No phone'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={customer.is_online ? 'default' : 'secondary'} className={customer.is_online ? 'bg-green-600/20 text-green-400 border-green-600/30' : 'bg-gray-800 text-gray-500 border-gray-700'}>
                    {customer.is_online ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-blue-400" />
                    <span className="text-white font-medium text-sm">{customer.total_orders}</span>
                  </div>
                  <p className="text-xs text-gray-500">Orders</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <p className="text-white font-medium text-sm">AED {customer.total_spent?.toFixed(0)}</p>
                  <p className="text-xs text-gray-500">Spent</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-yellow-400" />
                    <span className="text-white font-medium text-sm">{formatTimeAgo(customer.last_active || customer.last_order_date)}</span>
                  </div>
                  <p className="text-xs text-gray-500">Active</p>
                </div>
              </div>

              {customer.first_seen && (
                <p className="text-gray-600 text-xs mt-2">
                  First visit: {new Date(customer.first_seen).toLocaleDateString()}
                </p>
              )}
            </Card>
          ))}

          {customers.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">
                {filterStatus === 'online' ? 'No customers online right now' : 'No customers found'}
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Visitors will appear here as they open the app
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}