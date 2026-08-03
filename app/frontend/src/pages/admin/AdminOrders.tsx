import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Printer, RefreshCw, Bell, Clock, Check, X, Bike, MapPin, Navigation, Trash2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Order } from '@/lib/api';


type AdminOrder = Order & {
  order_type?: string;
  delivery_charge?: number;
  tip_amount?: number;
  tip_type?: string;
};

const API_BASE = 'https://vita-napoli-backend-usman.onrender.com';
const KITCHEN_PIN = '1122';

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Kitchen-Pin': KITCHEN_PIN,
  };
}

async function adminRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await axios.request<T>({
    url: `${API_BASE}${path}`,
    method,
    data,
    params,
    headers: adminHeaders(),
    timeout: 20000,
  });
  return response.data;
}

function isDeliveryOrder(order: AdminOrder): boolean {
  if (String(order.order_type || '').toLowerCase() === 'delivery') return true;
  const notes = String(order.order_notes || '').toLowerCase();
  return notes.includes('order type: delivery') || notes.includes('delivery address:');
}

interface RiderInfo {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  current_lat?: number | null;
  current_lng?: number | null;
  location_updated_at?: string | null;
  active_deliveries?: number;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New Order', color: 'bg-blue-600' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-600' },
  { value: 'preparing', label: 'Preparing', color: 'bg-yellow-600' },
  { value: 'ready', label: 'Ready', color: 'bg-purple-600' },
  { value: 'out_for_delivery', label: 'Out for Delivery', color: 'bg-blue-700' },
  { value: 'completed', label: 'Completed', color: 'bg-gray-600' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-600' },
];

const TIME_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 25, label: '25 min' },
  { value: 30, label: '30 min' },
  { value: 40, label: '40 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
];

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [prevOrderCount, setPrevOrderCount] = useState(0);
  const [acceptingOrder, setAcceptingOrder] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<number>(20);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [assigningOrder, setAssigningOrder] = useState<number | null>(null);
  const [selectedRider, setSelectedRider] = useState<string>('');
  const [deletingOrder, setDeletingOrder] = useState<number | null>(null);
  const [noteOrder, setNoteOrder] = useState<number | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Track recently updated order IDs to prevent poll from reverting optimistic updates
  const recentlyUpdatedRef = useRef<Map<number, number>>(new Map());

  const loadOrders = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const params: any = { sort: '-created_at', limit: 100 };
      if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
      if (search) params.search = search;

      const payload = await adminRequest<{ items?: AdminOrder[] }>(
        '/api/v1/admin/kitchen/orders',
        'GET',
        undefined,
        params,
      );
      const newOrders = payload?.items || [];

      // Clean old entries from recently-updated map (older than 5s)
      const now = Date.now();
      const recentUpdates = recentlyUpdatedRef.current;
      for (const [id, ts] of recentUpdates.entries()) {
        if (now - ts > 5000) recentUpdates.delete(id);
      }

      // Merge: keep local state for recently-updated orders
      const mergedOrders = newOrders.map((polledOrder: Order) => {
        if (recentUpdates.has(polledOrder.id)) {
          const localOrder = orders.find(o => o.id === polledOrder.id);
          return localOrder || polledOrder;
        }
        return polledOrder;
      });

      // Remove orders that were locally deleted
      const filteredOrders = mergedOrders.filter((o: Order) => {
        if (recentUpdates.has(o.id) && !orders.find(lo => lo.id === o.id)) {
          return false;
        }
        return true;
      });
      
      // Check for new orders and notify (no sound in admin - sound only in kitchen)
      if (prevOrderCount > 0 && filteredOrders.length > prevOrderCount) {
        const diff = filteredOrders.length - prevOrderCount;
        toast.success(`🔔 ${diff} new order${diff > 1 ? 's' : ''} received!`);
      }
      
      setPrevOrderCount(filteredOrders.length);
      setOrders(filteredOrders);
      setLastRefresh(new Date());
      if (showToast) toast.success('Orders refreshed!');
    } catch (e: any) {
      console.error('Failed to load orders:', e);
      if (e?.status === 401 || e?.response?.status === 401) {
        toast.error(e?.response?.data?.detail || 'Orders API ne PIN reject kiya.');
      } else if (showToast) {
        toast.error('Failed to refresh orders. Please try again.');
      }
    } finally {
      setRefreshing(false);
    }
  }, [filterStatus, search, prevOrderCount, navigate, orders]);

  useEffect(() => {
    checkAuthAndLoad();
    loadRiders();
    const interval = setInterval(() => {
      loadOrders();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  async function loadRiders() {
    try {
      const payload = await adminRequest<{ items?: RiderInfo[] }>(
        '/api/v1/rider/admin/locations',
      );
      setRiders(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      console.error('Failed to load rider locations:', error);
      try {
        const payload = await adminRequest<{ items?: RiderInfo[] }>(
          '/api/v1/rider/admin/list',
        );
        setRiders(Array.isArray(payload?.items) ? payload.items : []);
      } catch (fallbackError) {
        console.error('Failed to load riders:', fallbackError);
        setRiders([]);
      }
    }
  }

  async function assignToRider(order: Order) {
    if (!selectedRider) {
      toast.error('Please select a rider');
      return;
    }
    // Parse GPS from order notes
    let lat: number | null = null;
    let lng: number | null = null;
    const gpsMatch = order.order_notes?.match(/GPS:\s*([-\d.]+),([-\d.]+)/);
    if (gpsMatch) {
      lat = parseFloat(gpsMatch[1]);
      lng = parseFloat(gpsMatch[2]);
    }
    // Parse address from order notes
    let address = '';
    const addrMatch = order.order_notes?.match(/Delivery Address:\s*([^|]+)/);
    if (addrMatch) address = addrMatch[1].trim();

    try {
      await adminRequest(
        '/api/v1/rider/admin/assign',
        'POST',
        {
          order_id: order.id,
          rider_id: Number(selectedRider),
          customer_lat: lat,
          customer_lng: lng,
          customer_address: address,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          delivery_charge: Number((order as AdminOrder).delivery_charge || 0),
        },
      );
      toast.success(`Order #${order.id} rider ko assign ho gaya`);
      setAssigningOrder(null);
      setSelectedRider('');
      await loadRiders();
      await loadOrders();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.detail ||
        e?.data?.detail ||
        'Failed to assign rider',
      );
    }
  }

  useEffect(() => {
    loadOrders();
  }, [filterStatus, search]);

  function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) {
      navigate('/admin');
      setLoading(false);
      return;
    }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) {
        navigate('/admin');
        setLoading(false);
        return;
      }
    } catch {
      navigate('/admin');
      setLoading(false);
      return;
    }
    loadOrders();
    setLoading(false);
  }

  async function acceptOrder(orderId: number, minutes: number) {
    try {
      recentlyUpdatedRef.current.set(orderId, Date.now());
      await adminRequest(
        `/api/v1/admin/kitchen/orders/${orderId}/status`,
        'PUT',
        { status: 'accepted', estimated_minutes: minutes },
      );
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: 'accepted', estimated_time: `${minutes} min` } : o))
      );
      setAcceptingOrder(null);
      toast.success(`Order #${orderId} accepted — ${minutes} min`);
    } catch (e) {
      console.error('Failed to accept order:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to accept order');
    }
  }

  async function updateStatus(orderId: number, newStatus: string) {
    try {
      recentlyUpdatedRef.current.set(orderId, Date.now());
      const target = orders.find((item) => item.id === orderId);
      if (target && isDeliveryOrder(target) && newStatus === 'completed') {
        toast.error('Delivery order sirf Rider Delivered karke complete karega.');
        return;
      }
      await adminRequest(
        `/api/v1/admin/kitchen/orders/${orderId}/status`,
        'PUT',
        { status: newStatus },
      );
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
      toast.success(`Order #${orderId} → ${newStatus}`);
    } catch (e) {
      console.error('Failed to update status:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to update status');
    }
  }

  async function cancelOrder(orderId: number, reason?: string) {
    try {
      recentlyUpdatedRef.current.set(orderId, Date.now());
      await adminRequest(
        `/api/v1/admin/kitchen/orders/${orderId}/status`,
        'PUT',
        { status: 'cancelled', cancel_reason: reason || '' },
      );
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: 'cancelled' } : o))
      );
      toast.success(`Order #${orderId} cancelled`);
    } catch (e) {
      console.error('Failed to cancel order:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to cancel order');
    }
  }

  async function deleteOrder(orderId: number) {
    try {
      recentlyUpdatedRef.current.set(orderId, Date.now());
      await adminRequest(
        `/api/v1/admin/orders/${orderId}`,
        'DELETE',
      );
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setDeletingOrder(null);
      toast.success(`Order #${orderId} deleted permanently`);
    } catch (e: any) {
      console.error('Failed to delete order:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error(e?.data?.detail || 'Failed to delete order');
    }
  }

  async function addStaffNoteToOrder(orderId: number) {
    if (!staffNote.trim()) {
      toast.error('Please enter a note');
      return;
    }
    setAddingNote(true);
    try {
      await adminRequest(
        `/api/v1/admin/orders/${orderId}/notes`,
        'POST',
        { note: staffNote, admin_name: 'Admin' },
      );
      toast.success('Staff note added');
      setNoteOrder(null);
      setStaffNote('');
      loadOrders();
    } catch (e: any) {
      console.error('Failed to add note:', e);
      toast.error(e?.data?.detail || 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  }

  function printReceipt(order: Order) {
    let items: any[] = [];
    try { items = JSON.parse(order.items_json); } catch { /* parse error */ }

    const receiptHtml = `
      <html><head><title>Receipt #${order.id}</title>
      <style>body{font-family:monospace;max-width:300px;margin:0 auto;padding:20px}
      h2{text-align:center;margin-bottom:5px}
      .line{border-top:1px dashed #000;margin:10px 0}
      .item{display:flex;justify-content:space-between;margin:5px 0}
      .total{font-weight:bold;font-size:1.2em}</style></head>
      <body>
      <h2>Fai Fai Juice</h2>
      <p style="text-align:center">Murbah, Fujairah, UAE<br>+971 54 294 0112</p>
      <div class="line"></div>
      <p><strong>Order #${order.id}</strong><br>
      Customer: ${order.customer_name}<br>
      Phone: ${order.customer_phone}<br>
      ${order.estimated_time ? `Ready in: ${order.estimated_time}<br>` : ''}
      Payment: ${order.payment_method}</p>
      <div class="line"></div>
      ${items.map(i => `<div class="item"><span>${i.quantity}x ${i.name} (${i.size})</span><span>AED ${i.price?.toFixed(2)}</span></div>${i.extras?.length ? `<div style="font-size:0.8em;color:#666;margin-left:10px">+ ${i.extras.join(', ')}</div>` : ''}`).join('')}
      <div class="line"></div>
      ${order.delivery_charge ? `<div class="item"><span>Delivery Fee</span><span>AED ${order.delivery_charge?.toFixed(2)}</span></div>` : ''}
      ${order.tip_amount ? `<div class="item"><span>Tip${order.tip_type ? ` (${order.tip_type})` : ''}</span><span>AED ${order.tip_amount?.toFixed(2)}</span></div>` : ''}
      <div class="item total"><span>TOTAL</span><span>AED ${order.total_amount?.toFixed(2)}</span></div>
      ${order.order_notes ? `<div class="line"></div><p>Notes: ${order.order_notes}</p>` : ''}
      <div class="line"></div>
      <p style="text-align:center;font-size:0.8em">Thank you for your order!</p>
      </body></html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.print();
    }
  }

  // Calculate distance between rider and customer (Haversine formula)
  function getRiderDistance(rider: RiderInfo, order: Order): string | null {
    if (!rider.current_lat || !rider.current_lng) return null;
    // Parse customer GPS from order notes
    const gpsMatch = order.order_notes?.match(/GPS:\s*([-\d.]+),([-\d.]+)/);
    if (!gpsMatch) return null;
    const custLat = parseFloat(gpsMatch[1]);
    const custLng = parseFloat(gpsMatch[2]);
    
    const R = 6371; // Earth radius in km
    const dLat = (custLat - rider.current_lat) * Math.PI / 180;
    const dLng = (custLng - rider.current_lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rider.current_lat * Math.PI / 180) * Math.cos(custLat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d.toFixed(1);
  }

  // Get human-readable time since last location update
  function getLocationAge(updatedAt: string | null | undefined): string {
    if (!updatedAt) return '';
    const diff = Date.now() - new Date(updatedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Order Management <span className="text-xs text-green-400">NEW CODE A1</span></h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Auto-refreshes every 15s • Last: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOrders(true)}
            disabled={refreshing}
            className="border-gray-700 text-gray-300 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="relative">
            <Bell className="w-5 h-5 text-gray-400" />
            {orders.filter(o => o.status === 'new').length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {orders.filter(o => o.status === 'new').length}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">All Orders</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-900 border-gray-700 text-white max-w-[250px]"
          />
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {orders.map(order => {
            const statusConfig = STATUS_OPTIONS.find(s => s.value === order.status) || STATUS_OPTIONS[0];
            let items: any[] = [];
            try { items = JSON.parse(order.items_json); } catch { /* parse error */ }

            return (
              <Card key={order.id} className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">#{order.id}</span>
                      <Badge className={`${statusConfig.color} text-white`}>{statusConfig.label}</Badge>
                      {order.estimated_time && order.status !== 'completed' && order.status !== 'cancelled' && (
                        <Badge className="bg-orange-600/20 text-orange-400 border border-orange-600/30">
                          <Clock className="w-3 h-3 mr-1" />
                          {order.estimated_time}
                        </Badge>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      {order.customer_name} • {order.customer_phone}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => printReceipt(order)}
                    className="text-gray-400 hover:text-white cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-1 mb-3">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="text-gray-300 text-sm">
                      {item.quantity}x {item.name} ({item.size}) — AED {item.price?.toFixed(2)}
                      {item.extras?.length > 0 && (
                        <span className="text-gray-500 ml-2">+ {item.extras.join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>

                {order.order_notes && (
                  <p className="text-yellow-400/80 text-xs mb-3 italic">📝 {order.order_notes}</p>
                )}

                {order.status === 'out_for_delivery' && (
                  <div className="mb-3 rounded-lg border border-blue-600/30 bg-blue-600/10 px-3 py-2 text-sm text-blue-300">
                    Rider ne order pick kar liya hai. Customer ko deliver hone tak order pending rahega.
                  </div>
                )}

                {/* Assign to Rider (for delivery orders) */}
                {isDeliveryOrder(order) && order.status !== 'completed' && order.status !== 'cancelled' && (
                  assigningOrder === order.id ? (
                    <div className="bg-gray-800 rounded-lg p-3 mb-3 border border-blue-600/30">
                      <p className="text-blue-400 text-sm font-medium mb-2">Assign to Rider:</p>
                      {/* Rider cards with location info */}
                      <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                        {riders.filter(r => r.is_active).map(r => {
                          const distance = getRiderDistance(r, order);
                          const locationAge = getLocationAge(r.location_updated_at);
                          const isSelected = selectedRider === String(r.id);
                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedRider(String(r.id))}
                              className={`p-2 rounded-lg cursor-pointer border transition-colors ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-600/10'
                                  : 'border-gray-700 bg-gray-700/50 hover:border-gray-600'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Bike className="w-4 h-4 text-blue-400" />
                                  <span className="text-white text-sm font-medium">{r.name}</span>
                                  {(r.active_deliveries ?? 0) > 0 && (
                                    <Badge className="bg-orange-600/20 text-orange-400 border border-orange-600/30 text-[10px] px-1.5">
                                      {r.active_deliveries} active
                                    </Badge>
                                  )}
                                </div>
                                {distance !== null && (
                                  <span className="text-green-400 text-xs font-medium">
                                    <Navigation className="w-3 h-3 inline mr-0.5" />
                                    {distance} km
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                                <span>{r.phone}</span>
                                {r.current_lat && r.current_lng ? (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="w-3 h-3 text-green-500" />
                                    {locationAge || 'Live'}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">No GPS</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => assignToRider(order)} disabled={!selectedRider} className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer flex-1">
                          Assign Selected
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAssigningOrder(null)} className="text-gray-400 cursor-pointer">
                          ✕
                        </Button>
                      </div>
                      {riders.filter(r => r.is_active).length === 0 && (
                        <p className="text-gray-500 text-xs mt-2">No riders added. Go to Settings → Delivery Riders to add.</p>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setAssigningOrder(order.id); setSelectedRider(''); loadRiders(); }}
                      className="mb-3 border-blue-600/30 text-blue-400 hover:bg-blue-600/10 cursor-pointer"
                    >
                      <Bike className="w-3 h-3 mr-1" /> Assign Rider
                    </Button>
                  )
                )}

                {/* Accept Order with Time Selection */}
                {order.status === 'new' && acceptingOrder === order.id && (
                  <div className="bg-gray-800 rounded-lg p-3 mb-3 border border-green-600/30">
                    <p className="text-green-400 text-sm font-medium mb-2">Set estimated ready time:</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {TIME_OPTIONS.map(t => (
                        <button
                          key={t.value}
                          onClick={() => setSelectedTime(t.value)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                            selectedTime === t.value
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => acceptOrder(order.id, selectedTime)}
                        className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Accept — {selectedTime} min
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAcceptingOrder(null)}
                        className="text-gray-400 cursor-pointer"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Staff Notes UI */}
                {noteOrder === order.id && (
                  <div className="bg-gray-800 rounded-lg p-3 mb-3 border border-yellow-600/30">
                    <p className="text-yellow-400 text-sm font-medium mb-2">📝 Add Staff Note:</p>
                    <Textarea
                      value={staffNote}
                      onChange={e => setStaffNote(e.target.value)}
                      placeholder="Internal note (not visible to customer)..."
                      className="bg-gray-700 border-gray-600 text-white text-sm mb-2"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => addStaffNoteToOrder(order.id)}
                        disabled={addingNote}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
                      >
                        <Send className="w-3 h-3 mr-1" /> {addingNote ? 'Adding...' : 'Add Note'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setNoteOrder(null); setStaffNote(''); }} className="text-gray-400 cursor-pointer">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cancel with Reason */}
                {cancellingOrder === order.id && (
                  <div className="bg-orange-950/50 rounded-lg p-3 mb-3 border border-orange-600/30">
                    <p className="text-orange-400 text-sm font-medium mb-2">Cancel Order #{order.id} — Select Reason:</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {['Customer requested', 'Out of stock', 'Kitchen too busy', 'Wrong order', 'Duplicate order', 'Other'].map(reason => (
                        <button
                          key={reason}
                          onClick={() => setCancelReason(reason)}
                          className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                            cancelReason === reason ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    {cancelReason === 'Other' && (
                      <Input
                        value={cancelReason === 'Other' ? '' : cancelReason}
                        onChange={e => setCancelReason(e.target.value || 'Other')}
                        placeholder="Enter custom reason..."
                        className="bg-gray-800 border-gray-700 text-white text-sm mb-2"
                      />
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => { cancelOrder(order.id, cancelReason); setCancellingOrder(null); setCancelReason(''); }}
                        disabled={!cancelReason}
                        className="bg-orange-600 hover:bg-orange-700 text-white cursor-pointer"
                      >
                        <X className="w-3 h-3 mr-1" /> Confirm Cancel
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setCancellingOrder(null); setCancelReason(''); }} className="text-gray-400 cursor-pointer">
                        Back
                      </Button>
                    </div>
                  </div>
                )}

                {/* Delete Confirmation */}
                {deletingOrder === order.id && (
                  <div className="bg-red-950/50 rounded-lg p-3 mb-3 border border-red-600/30">
                    <p className="text-red-400 text-sm font-medium mb-2">⚠️ Are you sure? This will permanently delete Order #{order.id}.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => deleteOrder(order.id)}
                        className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Yes, Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeletingOrder(null)} className="text-gray-400 cursor-pointer">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                  <div className="text-sm text-gray-500">
                    {order.payment_method}
                    <br />
                    {new Date(order.created_at).toLocaleString()}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {order.delivery_charge > 0 && (
                      <span className="text-xs text-gray-400">Delivery: AED {order.delivery_charge?.toFixed(2)}</span>
                    )}
                    {order.tip_amount > 0 && (
                      <span className="text-xs text-green-400">Tip{order.tip_type ? ` (${order.tip_type})` : ''}: AED {order.tip_amount?.toFixed(2)}</span>
                    )}
                    <span className="text-red-400 font-bold">Total: AED {order.total_amount?.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Staff note button */}
                    {noteOrder !== order.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setNoteOrder(order.id); setStaffNote(''); }}
                        className="text-yellow-400 hover:text-yellow-300 cursor-pointer p-1 h-auto"
                        title="Add staff note"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* Delete button */}
                    {deletingOrder !== order.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingOrder(order.id)}
                        className="text-red-400 hover:text-red-300 cursor-pointer p-1 h-auto"
                        title="Delete order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {/* Action buttons based on status */}
                    {order.status === 'new' && acceptingOrder !== order.id && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => { setAcceptingOrder(order.id); setSelectedTime(20); }}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs cursor-pointer"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setCancellingOrder(order.id); setCancelReason(''); }}
                          className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {/* Cancel button for active orders (not new, not completed/cancelled) */}
                    {order.status !== 'new' && order.status !== 'completed' && order.status !== 'cancelled' && cancellingOrder !== order.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setCancellingOrder(order.id); setCancelReason(''); }}
                        className="text-orange-400 hover:text-orange-300 text-xs cursor-pointer p-1 h-auto"
                        title="Cancel order"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {order.status !== 'new' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'out_for_delivery' && (
                      <Select
                        value={order.status}
                        onValueChange={(val) => updateStatus(order.id, val)}
                      >
                        <SelectTrigger className="w-[140px] bg-gray-800 border-gray-700 text-white text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          {STATUS_OPTIONS.filter((status) => {
                            if (status.value === 'new' || status.value === 'out_for_delivery') return false;
                            if (isDeliveryOrder(order) && status.value === 'completed') return false;
                            return true;
                          }).map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {orders.length === 0 && (
            <div className="text-center py-16">
              <div className="text-gray-500 text-4xl mb-4">📋</div>
              <p className="text-gray-400 font-medium text-lg mb-2">No orders yet</p>
              <p className="text-gray-600 text-sm max-w-sm mx-auto">
                When customers place orders through the app, they will appear here automatically.
                The page refreshes every 15 seconds.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadOrders(true)}
                className="mt-4 border-gray-700 text-gray-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Check Now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
