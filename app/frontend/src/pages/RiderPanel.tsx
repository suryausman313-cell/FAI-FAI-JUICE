import { useState, useEffect, useRef } from 'react';
import { Bike, MapPin, Phone, Package, CheckCircle, Navigation, LogOut, RefreshCw, BarChart3, Clock, DollarSign, CreditCard, Banknote, Wallet, Send, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { client } from '@/lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Delivery {
  id: number;
  order_id: number;
  status: string;
  customer_lat: number | null;
  customer_lng: number | null;
  customer_address: string;
  customer_name: string;
  customer_phone: string;
  order_total: number;
  order_items: string;
  order_status: string;
  delivery_charge: number;
  distance_km: number | null;
  zone_name: string | null;
  tip_amount: number;
  created_at: string;
}

interface Rider {
  id: number;
  name: string;
  phone: string;
}

interface RiderStats {
  today_deliveries: number;
  week_deliveries: number;
  month_deliveries: number;
  total_deliveries: number;
  total_earnings: number;
  delivery_charges_earned: number;
  today_delivery_earnings: number;
  week_delivery_earnings: number;
  month_delivery_earnings: number;
  tips_earned: number;
  today_tips: number;
  week_tips: number;
  month_tips: number;
  cash_collected: number;
  card_orders: number;
  pending_orders: number;
  completed_orders: number;
}


type FinancePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface FinanceTotals {
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

interface FinanceSettlementTotals {
  approved_cash: number;
  awaiting_approval: number;
  rejected_cash: number;
  submissions: number;
}

interface FinanceCurrentBalance {
  cash_due_to_shop: number;
  approved_cash: number;
  awaiting_approval: number;
  remaining_to_submit: number;
  total_pending_cash: number;
}

interface RiderFinanceSummary {
  rider: Rider;
  period: {
    key: FinancePeriod;
    label: string;
    date_from: string | null;
    date_to: string | null;
  };
  totals: FinanceTotals;
  settlements: FinanceSettlementTotals;
  current_balance: FinanceCurrentBalance;
}

interface CashSubmission {
  id: number;
  rider_id: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  rider_note: string;
  admin_note: string;
  reviewed_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export default function RiderPanel() {
  const [rider, setRider] = useState<Rider | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<RiderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [activeTab, setActiveTab] = useState<'orders' | 'stats'>('orders');
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>('today');
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [financeSummary, setFinanceSummary] = useState<RiderFinanceSummary | null>(null);
  const [cashSubmissions, setCashSubmissions] = useState<CashSubmission[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const prevDeliveryIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const savedRider = localStorage.getItem('rider_auth');
    if (savedRider) {
      try {
        const parsed = JSON.parse(savedRider);
        setRider(parsed);
        loadDeliveries(parsed.id);
        loadStats(parsed.id);
        loadFinance(parsed.id, 'today');
        loadCashSubmissions(parsed.id);
      } catch { /* ignore */ }
    }
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(Notification.permission === 'granted' && localStorage.getItem('rider_notifications') !== 'off');
    }
  }, []);

  useEffect(() => {
    if (!rider) return;
    registerServiceWorker();
  }, [rider]);

  useEffect(() => {
    if (!rider) return;
    const interval = setInterval(() => {
      loadDeliveries(rider.id);
      loadStats(rider.id);
      loadFinance(rider.id, financePeriod);
      loadCashSubmissions(rider.id);
    }, 8000);
    return () => clearInterval(interval);
  }, [rider, financePeriod]);

  useEffect(() => {
    if (!rider || financePeriod === 'custom') return;
    loadFinance(rider.id, financePeriod);
  }, [financePeriod, rider]);

  // Heartbeat to keep rider online status synced (every 15s)
  useEffect(() => {
    if (!rider) return;
    function sendHeartbeat() {
      client.apiCall.invoke({
        url: `/api/v1/rider/heartbeat/${rider.id}`,
        method: 'POST',
        data: {},
      }).catch(() => {});
    }
    sendHeartbeat(); // Send immediately on login
    const heartbeatInterval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(heartbeatInterval);
  }, [rider]);

  useEffect(() => {
    if (!rider) return;
    function sendLocation() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          client.apiCall.invoke({
            url: `/api/v1/rider/location/${rider.id}`,
            method: 'POST',
            data: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    sendLocation();
    const locationInterval = setInterval(sendLocation, 30000);
    return () => clearInterval(locationInterval);
  }, [rider]);

  useEffect(() => {
    if (rider && deliveries.length > 0 && activeTab === 'orders') {
      updateMap();
    }
  }, [deliveries, activeTab]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'DELIVERIES_UPDATE') {
        const items = event.data.data?.items || [];
        setDeliveries(items);
        setLastRefresh(new Date());
      }
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, []);

  useEffect(() => {
    if (!rider || deliveries.length === 0) return;
    const activeIds = deliveries.filter(d => d.status !== 'delivered').map(d => d.id);
    const newIds = activeIds.filter(id => !prevDeliveryIdsRef.current.includes(id));
    if (newIds.length > 0 && prevDeliveryIdsRef.current.length > 0) {
      const newDelivery = deliveries.find(d => newIds.includes(d.id));
      if (newDelivery) {
        toast.success(`🍕 New Order #${newDelivery.order_id} - ${newDelivery.customer_name}`, { duration: 10000 });
      }
    }
    prevDeliveryIdsRef.current = activeIds;
    if (swRegistrationRef.current?.active) {
      swRegistrationRef.current.active.postMessage({ type: 'UPDATE_DELIVERIES', data: { deliveryIds: activeIds } });
    }
  }, [deliveries, rider]);

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('/rider-sw.js', { scope: '/rider' });
      swRegistrationRef.current = registration;
      const sw = registration.active || registration.waiting || registration.installing;
      if (sw && sw.state !== 'activated') {
        await new Promise<void>((resolve) => {
          sw.addEventListener('statechange', function handler() {
            if (sw.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
          });
        });
      }
      if (registration.active && rider) {
        const activeIds = deliveries.filter(d => d.status !== 'delivered').map(d => d.id);
        registration.active.postMessage({ type: 'RIDER_LOGIN', data: { riderId: rider.id, currentDeliveryIds: activeIds } });
      }
    } catch (error) { console.error('SW registration failed:', error); }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) { toast.error('Notifications not supported'); return; }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('rider_notifications', 'on');
      toast.success('🔔 Notifications enabled!');
      if (swRegistrationRef.current) {
        swRegistrationRef.current.showNotification('🍕 Notifications Active!', { body: 'You will receive alerts for new orders.', icon: '/vite.svg', tag: 'test-notification' });
      }
    } else if (permission === 'denied') { toast.error('Notifications blocked.'); }
  }

  function toggleNotifications() {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('rider_notifications', 'off');
      if (swRegistrationRef.current?.active) { swRegistrationRef.current.active.postMessage({ type: 'RIDER_LOGOUT' }); }
      toast.info('Notifications off');
    } else {
      if (notificationPermission === 'granted') {
        setNotificationsEnabled(true);
        localStorage.setItem('rider_notifications', 'on');
        if (swRegistrationRef.current?.active && rider) {
          const activeIds = deliveries.filter(d => d.status !== 'delivered').map(d => d.id);
          swRegistrationRef.current.active.postMessage({ type: 'RIDER_LOGIN', data: { riderId: rider.id, currentDeliveryIds: activeIds } });
        }
        toast.success('Notifications on');
      } else { requestNotificationPermission(); }
    }
  }

  function updateMap() {
    const latestByOrder = new Map<number, Delivery>();
    deliveries.forEach((delivery) => {
      const existing = latestByOrder.get(delivery.order_id);
      if (!existing || Number(delivery.id) > Number(existing.id)) {
        latestByOrder.set(delivery.order_id, delivery);
      }
    });
    const activeStatuses = new Set(['assigned', 'accepted', 'picked_up', 'on_the_way']);
    const activeDeliveries = Array.from(latestByOrder.values()).filter(
      d => activeStatuses.has(String(d.status || '').toLowerCase()) && d.customer_lat && d.customer_lng
    );
    if (activeDeliveries.length === 0) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    if (!mapContainerRef.current) return;
    const firstDelivery = activeDeliveries[0];
    const map = L.map(mapContainerRef.current).setView([firstDelivery.customer_lat!, firstDelivery.customer_lng!], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    activeDeliveries.forEach(d => {
      if (d.customer_lat && d.customer_lng) {
        L.marker([d.customer_lat, d.customer_lng]).addTo(map).bindPopup(`📦 Order #${d.order_id}<br>${d.customer_name}<br>${d.customer_address || ''}`);
      }
    });
    if (activeDeliveries.length > 1) {
      const bounds = L.latLngBounds(activeDeliveries.map(d => [d.customer_lat!, d.customer_lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    mapInstanceRef.current = map;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !pin) { toast.error('Please enter phone and PIN'); return; }
    setLoginLoading(true);
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/rider/login', method: 'POST', data: { phone, pin } });
      if (res?.data?.success) {
        const riderData = res.data.rider;
        setRider(riderData);
        localStorage.setItem('rider_auth', JSON.stringify(riderData));
        toast.success(`Welcome, ${riderData.name}!`);
        loadDeliveries(riderData.id);
        loadStats(riderData.id);
        loadFinance(riderData.id, 'today');
        loadCashSubmissions(riderData.id);
        if ('Notification' in window && Notification.permission === 'default') {
          setTimeout(() => requestNotificationPermission(), 2000);
        }
      }
    } catch (e: any) { toast.error(e?.data?.detail || 'Invalid phone or PIN'); }
    finally { setLoginLoading(false); }
  }

  function handleLogout() {
    if (swRegistrationRef.current?.active) { swRegistrationRef.current.active.postMessage({ type: 'RIDER_LOGOUT' }); }
    setRider(null);
    setDeliveries([]);
    setStats(null);
    setFinanceSummary(null);
    setCashSubmissions([]);
    setCashAmount('');
    setCashNote('');
    localStorage.removeItem('rider_auth');
    prevDeliveryIdsRef.current = [];
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }

  async function loadDeliveries(riderId: number) {
    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/rider/deliveries/${riderId}`, method: 'GET' });
      const items = res?.data?.items || [];
      setDeliveries(items);
      setLastRefresh(new Date());
    } catch (e: any) {
      console.error('Failed to load deliveries:', e);
      if (loading) { toast.error('Could not load deliveries.'); }
    } finally { setLoading(false); }
  }

  async function loadStats(riderId: number) {
    try {
      const res = await client.apiCall.invoke({ url: `/api/v1/rider/stats/${riderId}`, method: 'GET' });
      if (res?.data) { setStats(res.data); }
    } catch (e) { console.error('Failed to load stats:', e); }
  }

  function getFinanceUrl(riderId: number, period: FinancePeriod) {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('date_from', customFrom);
      params.set('date_to', customTo);
    }
    return `/api/v1/finance/rider/${riderId}/summary?${params.toString()}`;
  }

  async function loadFinance(riderId: number, period: FinancePeriod = financePeriod) {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setFinanceLoading(true);
    try {
      const res = await client.apiCall.invoke({
        url: getFinanceUrl(riderId, period),
        method: 'GET',
        data: {},
      });
      if (res?.data) setFinanceSummary(res.data);
    } catch (e: any) {
      console.error('Failed to load rider finance:', e);
      toast.error(e?.data?.detail || 'Could not load finance report');
    } finally {
      setFinanceLoading(false);
    }
  }

  async function loadCashSubmissions(riderId: number) {
    try {
      const res = await client.apiCall.invoke({
        url: `/api/v1/finance/rider/${riderId}/cash-submissions?limit=100`,
        method: 'GET',
        data: {},
      });
      setCashSubmissions(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load cash submissions:', e);
    }
  }

  async function submitCashToShop() {
    if (!rider || !financeSummary) return;
    const amount = Number(cashAmount);
    const available = financeSummary.current_balance.remaining_to_submit || 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid cash amount');
      return;
    }
    if (amount > available + 0.01) {
      toast.error(`Maximum cash available is AED ${available.toFixed(2)}`);
      return;
    }

    setSubmittingCash(true);
    try {
      await client.apiCall.invoke({
        url: `/api/v1/finance/rider/${rider.id}/cash-submissions`,
        method: 'POST',
        data: { amount, note: cashNote.trim() },
      });
      toast.success('Cash sent to admin for approval');
      setCashAmount('');
      setCashNote('');
      await Promise.all([
        loadFinance(rider.id, financePeriod),
        loadCashSubmissions(rider.id),
      ]);
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Cash submission failed');
    } finally {
      setSubmittingCash(false);
    }
  }

  function formatDateTime(value: string | null) {
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

  async function updateStatus(assignmentId: number, newStatus: string) {
    try {
      await client.apiCall.invoke({ url: `/api/v1/rider/deliveries/${assignmentId}/status`, method: 'PUT', data: { status: newStatus } });
      toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
      if (rider) { loadDeliveries(rider.id); loadStats(rider.id); loadFinance(rider.id, financePeriod); loadCashSubmissions(rider.id); }
    } catch (e: any) { toast.error(e?.data?.detail || 'Failed to update status'); }
  }

  function openInMaps(lat: number, lng: number) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'assigned': return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'picked_up': return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30';
      case 'on_the_way': return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      case 'delivered': return 'bg-green-600/20 text-green-400 border-green-600/30';
      default: return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
    }
  }

  function getNextStatus(current: string): { label: string; value: string } | null {
    switch (current) {
      case 'assigned': return { label: '🏪 Picked Up', value: 'picked_up' };
      case 'picked_up': return { label: '🚗 On the Way', value: 'on_the_way' };
      case 'on_the_way': return { label: '✅ Delivered', value: 'delivered' };
      default: return null;
    }
  }

  // Login screen
  if (!rider) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bike className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold">Rider Panel</h1>
            <p className="text-gray-400 text-sm mt-1">Vita Napoli Delivery</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-gray-300">Phone Number</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971 XX XXX XXXX" className="bg-gray-900 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">PIN</Label>
              <Input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter your PIN" maxLength={6} className="bg-gray-900 border-gray-700 text-white mt-1" />
            </div>
            <Button type="submit" disabled={loginLoading} className="w-full bg-red-600 hover:bg-red-700 text-white py-5 cursor-pointer">
              {loginLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const latestByOrder = new Map<number, Delivery>();
  deliveries.forEach((delivery) => {
    const existing = latestByOrder.get(delivery.order_id);
    if (!existing || Number(delivery.id) > Number(existing.id)) {
      latestByOrder.set(delivery.order_id, delivery);
    }
  });
  const uniqueDeliveries = Array.from(latestByOrder.values());

  const activeStatuses = new Set(['assigned', 'accepted', 'picked_up', 'on_the_way']);
  const activeDeliveries = uniqueDeliveries.filter(
    d => activeStatuses.has(String(d.status || '').toLowerCase())
  );
  const completedDeliveries = uniqueDeliveries.filter(
    d => String(d.status || '').toLowerCase() === 'delivered'
  );

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold">{rider.name}</h1>
              <p className="text-gray-500 text-xs">Auto-refresh • {lastRefresh.toLocaleTimeString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => { if (rider) { loadDeliveries(rider.id); loadStats(rider.id); loadFinance(rider.id, financePeriod); loadCashSubmissions(rider.id); } }} variant="ghost" size="sm" className="text-gray-400 cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={handleLogout} variant="ghost" size="sm" className="text-gray-400 cursor-pointer">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'orders' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            📦 My Orders
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'stats' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            📊 Dashboard
          </button>
        </div>

        {/* FINANCE / DASHBOARD TAB */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-red-400" /> Finance Period
                  </h3>
                  <p className="text-gray-500 text-xs mt-1">View orders, delivery earning, shop cash and pending settlement</p>
                </div>
                <select
                  value={financePeriod}
                  onChange={(e) => setFinancePeriod(e.target.value as FinancePeriod)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Date</option>
                </select>
              </div>

              {financePeriod === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div>
                    <Label className="text-gray-400 text-xs">From</Label>
                    <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-gray-800 border-gray-700 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">To</Label>
                    <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-gray-800 border-gray-700 text-white mt-1" />
                  </div>
                  <Button
                    onClick={() => rider && loadFinance(rider.id, 'custom')}
                    disabled={financeLoading || !customFrom || !customTo}
                    className="self-end bg-red-600 hover:bg-red-700 text-white"
                  >
                    {financeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Apply
                  </Button>
                </div>
              )}
            </Card>

            {financeLoading && !financeSummary ? (
              <div className="py-12 text-center text-gray-400">Loading finance report...</div>
            ) : financeSummary ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">{financeSummary.period.label}</h3>
                  {financeLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <Package className="w-5 h-5 text-blue-400 mb-2" />
                    <p className="text-2xl font-bold text-white">{financeSummary.totals.delivered_orders}</p>
                    <p className="text-gray-500 text-xs">Delivered Orders</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <MapPin className="w-5 h-5 text-purple-400 mb-2" />
                    <p className="text-xl font-bold text-purple-400">AED {financeSummary.totals.delivery_charges.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">Delivery Charges</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <span className="text-xl block mb-2">💝</span>
                    <p className="text-xl font-bold text-pink-400">AED {financeSummary.totals.rider_tips.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">Rider Tips</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <DollarSign className="w-5 h-5 text-green-400 mb-2" />
                    <p className="text-xl font-bold text-green-400">AED {financeSummary.totals.rider_earnings.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">My Earning</p>
                  </Card>
                </div>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" /> Order Money Breakdown
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Customer Total</span><span className="text-white font-medium">AED {financeSummary.totals.customer_total.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Shop Food Sale</span><span className="text-green-400 font-medium">AED {financeSummary.totals.shop_food_sale.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Menu Discount</span><span className="text-red-400 font-medium">- AED {financeSummary.totals.discount_amount.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Developer Fees</span><span className="text-yellow-400 font-medium">AED {financeSummary.totals.developer_fees.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Cash Collected</span><span className="text-yellow-400 font-medium">AED {financeSummary.totals.cash_collected.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Cash Payable to Shop</span><span className="text-orange-400 font-medium">AED {financeSummary.totals.cash_payable_to_shop.toFixed(2)}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Cash Orders</span><span className="text-white font-medium">{financeSummary.totals.cash_orders}</span></div>
                    <div className="flex justify-between bg-gray-800 rounded-lg px-3 py-2"><span className="text-gray-400">Card Orders</span><span className="text-white font-medium">{financeSummary.totals.card_orders}</span></div>
                  </div>
                  <p className="text-gray-600 text-xs mt-3">Discount is calculated on menu items only. Delivery charge, service fee, small-order fee and tip are not discounted.</p>
                </Card>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-yellow-400" /> Current Cash Settlement
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-800 rounded-lg p-3">
                      <p className="text-gray-500 text-xs">Cash Due</p>
                      <p className="text-white font-bold mt-1">AED {financeSummary.current_balance.cash_due_to_shop.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3">
                      <p className="text-green-400/70 text-xs">Approved / Given</p>
                      <p className="text-green-400 font-bold mt-1">AED {financeSummary.current_balance.approved_cash.toFixed(2)}</p>
                    </div>
                    <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg p-3">
                      <p className="text-orange-400/70 text-xs">Waiting Admin</p>
                      <p className="text-orange-400 font-bold mt-1">AED {financeSummary.current_balance.awaiting_approval.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-3">
                      <p className="text-red-400/70 text-xs">Total Pending</p>
                      <p className="text-red-400 font-bold mt-1">AED {financeSummary.current_balance.total_pending_cash.toFixed(2)}</p>
                    </div>
                  </div>

                  {financeSummary.current_balance.remaining_to_submit > 0 ? (
                    <div className="border-t border-gray-800 pt-4">
                      <p className="text-gray-300 text-sm font-medium mb-3">Submit cash to shop</p>
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={financeSummary.current_balance.remaining_to_submit}
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          placeholder={`Max ${financeSummary.current_balance.remaining_to_submit.toFixed(2)}`}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                        <Input
                          value={cashNote}
                          onChange={(e) => setCashNote(e.target.value)}
                          placeholder="Optional note"
                          maxLength={500}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                        <Button onClick={submitCashToShop} disabled={submittingCash} className="bg-green-600 hover:bg-green-700 text-white">
                          {submittingCash ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                          Submit Cash
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-800 pt-4 text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> No cash waiting to submit.
                    </div>
                  )}
                </Card>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3">Cash Submission History</h3>
                  {cashSubmissions.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center">No cash submissions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {cashSubmissions.slice(0, 20).map((item) => (
                        <div key={item.id} className="bg-gray-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold">AED {item.amount.toFixed(2)}</span>
                              <Badge className={item.status === 'approved' ? 'bg-green-600/20 text-green-400 border-green-600/30' : item.status === 'rejected' ? 'bg-red-600/20 text-red-400 border-red-600/30' : 'bg-orange-600/20 text-orange-400 border-orange-600/30'}>
                                {item.status === 'pending' ? 'Waiting Admin' : item.status}
                              </Badge>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">Submitted: {formatDateTime(item.submitted_at)}</p>
                            {item.rider_note && <p className="text-gray-400 text-xs mt-1">Note: {item.rider_note}</p>}
                            {item.admin_note && <p className="text-gray-400 text-xs mt-1">Admin: {item.admin_note}</p>}
                          </div>
                          {item.reviewed_at && <p className="text-gray-500 text-xs">Reviewed: {formatDateTime(item.reviewed_at)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {stats && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> Current Order Status</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-orange-400">{stats.pending_orders}</p><p className="text-orange-400/70 text-xs mt-1">Pending</p></div>
                      <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-green-400">{stats.completed_orders}</p><p className="text-green-400/70 text-xs mt-1">All-Time Completed</p></div>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-gray-500">Finance report is not available.</div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <>
            {/* Map */}
            {activeDeliveries.some(d => d.customer_lat && d.customer_lng) && (
              <div ref={mapContainerRef} className="w-full h-[200px] rounded-xl overflow-hidden border border-gray-700 mb-4" style={{ zIndex: 1 }} />
            )}

            {loading ? (
              <div className="text-center text-gray-400 py-12">Loading deliveries...</div>
            ) : (
              <>
                {activeDeliveries.length > 0 ? (
                  <div className="space-y-4 mb-8">
                    <h2 className="text-white font-semibold">Active Deliveries ({activeDeliveries.length})</h2>
                    {activeDeliveries.map(delivery => {
                      let items: any[] = [];
                      try { items = JSON.parse(delivery.order_items); } catch { /* */ }
                      const nextStatus = getNextStatus(delivery.status);
                      return (
                        <Card key={delivery.id} className="bg-gray-900 border-gray-800 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-white font-semibold">Order #{delivery.order_id}</span>
                            <Badge className={`${getStatusColor(delivery.status)} border text-xs`}>
                              {delivery.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center gap-2 text-gray-300 text-sm">
                              <Package className="w-4 h-4 text-gray-500" />
                              <span>{delivery.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300 text-sm">
                              <Phone className="w-4 h-4 text-gray-500" />
                              <a href={`tel:${delivery.customer_phone}`} className="text-blue-400 hover:underline">{delivery.customer_phone}</a>
                            </div>
                            {delivery.customer_address && (
                              <div className="flex items-start gap-2 text-gray-300 text-sm">
                                <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
                                <span>{delivery.customer_address}</span>
                              </div>
                            )}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-3 mb-3">
                            {items.map((item, idx) => (
                              <div key={idx} className="text-gray-400 text-xs">{item.quantity}x {item.name} ({item.size})</div>
                            ))}
                            <div className="text-red-400 font-semibold text-sm mt-2">Total: AED {delivery.order_total?.toFixed(2)}</div>
                            {(delivery.delivery_charge > 0 || delivery.tip_amount > 0) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {delivery.delivery_charge > 0 && (
                                  <span className="text-purple-400 text-xs font-medium">🛵 Delivery: AED {delivery.delivery_charge.toFixed(2)}</span>
                                )}
                                {delivery.tip_amount > 0 && (
                                  <span className="text-pink-400 text-xs font-medium">💝 Tip: AED {delivery.tip_amount.toFixed(2)}</span>
                                )}
                                {delivery.zone_name && <span className="text-gray-500 text-xs">({delivery.zone_name})</span>}
                                {delivery.distance_km && <span className="text-gray-600 text-xs">• {delivery.distance_km.toFixed(1)} km</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {delivery.customer_lat && delivery.customer_lng && (
                              <Button onClick={() => openInMaps(delivery.customer_lat!, delivery.customer_lng!)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" size="sm">
                                <Navigation className="w-4 h-4 mr-1" /> Navigate
                              </Button>
                            )}
                            {nextStatus && (
                              <Button onClick={() => updateStatus(delivery.id, nextStatus.value)} className="flex-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer" size="sm">
                                {nextStatus.label}
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Bike className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No active deliveries</p>
                    <p className="text-gray-600 text-sm mt-1">New deliveries will appear here automatically</p>
                  </div>
                )}

                {completedDeliveries.length > 0 && (
                  <div>
                    <h2 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-3">Completed ({completedDeliveries.length})</h2>
                    <div className="space-y-2">
                      {completedDeliveries.slice(0, 10).map(delivery => (
                        <Card key={delivery.id} className="bg-gray-900/50 border-gray-800 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-gray-300 text-sm">Order #{delivery.order_id}</span>
                              <span className="text-gray-500 text-xs ml-2">{delivery.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-sm">AED {delivery.order_total?.toFixed(2)}</span>
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </div>
                          </div>
                          {(delivery.delivery_charge > 0 || delivery.tip_amount > 0) && (
                            <div className="flex items-center gap-2 mt-1">
                              {delivery.delivery_charge > 0 && (
                                <span className="text-purple-400 text-xs">Earned: AED {delivery.delivery_charge.toFixed(2)}</span>
                              )}
                              {delivery.tip_amount > 0 && (
                                <span className="text-pink-400 text-xs">+ Tip: AED {delivery.tip_amount.toFixed(2)}</span>
                              )}
                              {delivery.zone_name && <span className="text-gray-600 text-xs">({delivery.zone_name})</span>}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}