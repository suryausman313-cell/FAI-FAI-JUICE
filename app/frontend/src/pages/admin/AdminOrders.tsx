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
import { getAPIBaseURL } from '@/lib/config';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';


type AdminOrder = Order & {
  order_type?: string;
  delivery_charge?: number;
  tip_amount?: number;
  tip_type?: string;
};

function adminHeaders() {
  const adminToken =
    localStorage.getItem('fai_fai_admin_token') || '';

  return {
    'Content-Type': 'application/json',
    ...(adminToken
      ? { Authorization: `Bearer ${adminToken}` }
      : {}),
  };
}

async function adminRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await axios.request<T>({
    url: `${getAPIBaseURL().replace(/\/$/, '')}${path}`,
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
  is_online?: boolean;
  has_gps?: boolean;
  gps_fresh?: boolean;
  eligible_for_assignment?: boolean;
  can_assign?: boolean;
  availability_reason?: 'available' | 'offline' | 'gps_missing' | 'gps_outdated' | 'inactive' | string;
  current_lat?: number | null;
  current_lng?: number | null;
  last_heartbeat?: string | null;
  location_updated_at?: string | null;
  heartbeat_age_seconds?: number | null;
  location_age_seconds?: number | null;
  active_deliveries?: number;
  distance_to_shop_km?: number | null;
  shop_lat?: number | null;
  shop_lng?: number | null;
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
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [savingAutoAssign, setSavingAutoAssign] = useState(false);
  const riderMapContainerRef = useRef<HTMLDivElement>(null);
  const riderMapRef = useRef<L.Map | null>(null);
  const riderMapLayerRef = useRef<L.LayerGroup | null>(null);

  // Track recently updated order IDs to prevent poll from reverting optimistic updates
  const recentlyUpdatedRef = useRef<Map<number, number>>(new Map());

  const loadOrders = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const params: any = { sort: '-created_at', limit: 100 };
      if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
      if (search) params.search = search;

      const payload = await adminRequest<{ items?: AdminOrder[] }>(
        '/api/v1/admin/orders',
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
        toast.error('Admin session expired or Kitchen PIN was rejected. Logout and login again.');
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
    loadAutoAssignSetting();
    const interval = setInterval(() => {
      loadOrders();
      loadRiders();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    renderRiderMap();
  }, [riders, loading]);

  useEffect(() => {
    return () => {
      riderMapRef.current?.remove();
      riderMapRef.current = null;
      riderMapLayerRef.current = null;
    };
  }, []);

  async function loadRiders() {
    try {
      const payload = await adminRequest<{ items?: RiderInfo[] }>(
        '/api/v1/rider/admin/locations',
      );
      setRiders(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      console.error('Failed to load live rider locations:', error);
      // Do not fall back to a basic list because it has no reliable online/GPS status.
    }
  }

  async function loadAutoAssignSetting() {
    try {
      const payload = await adminRequest<{ enabled?: boolean }>(
        '/api/v1/rider/admin/auto-assign',
      );
      setAutoAssignEnabled(Boolean(payload?.enabled));
    } catch (error) {
      console.error('Failed to load auto assign setting:', error);
    }
  }

  async function toggleAutoAssign() {
    const nextEnabled = !autoAssignEnabled;
    setSavingAutoAssign(true);
    try {
      const payload = await adminRequest<{
        enabled?: boolean;
        assigned_count?: number;
      }>(
        '/api/v1/rider/admin/auto-assign',
        'PUT',
        { enabled: nextEnabled },
      );
      const enabled = Boolean(payload?.enabled);
      setAutoAssignEnabled(enabled);

      if (enabled) {
        const assignedCount = Number(payload?.assigned_count || 0);
        toast.success(
          assignedCount > 0
            ? `Auto Assign ON — ${assignedCount} delivery order rider ko assign ho gaya`
            : 'Auto Assign ON — new delivery order nearest available rider ko jayega',
        );
      } else {
        toast.success('Auto Assign OFF — Admin manually rider assign karega');
      }

      await Promise.all([loadRiders(), loadOrders()]);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.detail ||
        error?.data?.detail ||
        'Auto Assign setting save nahi hui',
      );
    } finally {
      setSavingAutoAssign(false);
    }
  }

  async function assignToRider(order: Order) {
    if (!selectedRider) {
      toast.error('Please select a rider');
      return;
    }
    const selected = riders.find(rider => String(rider.id) === selectedRider);
    if (!selected?.can_assign) {
      toast.error('Rider ki GPS location available nahi hai');
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
        `/api/v1/admin/orders/${orderId}/status`,
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
        `/api/v1/admin/orders/${orderId}/status`,
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
        `/api/v1/admin/orders/${orderId}/status`,
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

  function getRiderAvailability(rider: RiderInfo): string {
    if (rider.eligible_for_assignment) return 'Online • GPS live';
    if (rider.can_assign && rider.availability_reason === 'gps_outdated') return 'GPS saved • updating';
    if (rider.can_assign && rider.availability_reason === 'offline') return 'GPS saved • background offline';
    if (rider.can_assign) return 'GPS saved';
    if (rider.availability_reason === 'gps_missing') return 'GPS unavailable';
    return 'Unavailable';
  }

  function renderRiderMap() {
    if (!riderMapContainerRef.current) return;

    const ridersWithGps = riders.filter(
      rider => rider.current_lat != null && rider.current_lng != null,
    );
    const shopLat = riders.find(rider => rider.shop_lat != null)?.shop_lat ?? null;
    const shopLng = riders.find(rider => rider.shop_lng != null)?.shop_lng ?? null;
    const firstPoint =
      shopLat != null && shopLng != null
        ? ([shopLat, shopLng] as [number, number])
        : ridersWithGps.length > 0
          ? ([Number(ridersWithGps[0].current_lat), Number(ridersWithGps[0].current_lng)] as [number, number])
          : ([25.2747, 56.3450] as [number, number]);

    if (!riderMapRef.current) {
      const map = L.map(riderMapContainerRef.current).setView(firstPoint, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      riderMapRef.current = map;
      riderMapLayerRef.current = L.layerGroup().addTo(map);
    }

    const map = riderMapRef.current;
    const layer = riderMapLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: [number, number][] = [];

    if (shopLat != null && shopLng != null) {
      const shopIcon = L.divIcon({
        html: '<div style="width:34px;height:34px;border-radius:50%;background:#f97316;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45);font-size:17px">🏪</div>',
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker([shopLat, shopLng], { icon: shopIcon })
        .addTo(layer)
        .bindPopup('<strong>Fai Fai Juice</strong><br>Pickup shop');
      bounds.push([shopLat, shopLng]);
    }

    ridersWithGps.forEach(rider => {
      const lat = Number(rider.current_lat);
      const lng = Number(rider.current_lng);
      const live = rider.eligible_for_assignment === true;
      const assignable = rider.can_assign === true;
      const markerColor = live ? '#16a34a' : assignable ? '#f59e0b' : '#6b7280';
      const icon = L.divIcon({
        html: `<div style="width:32px;height:32px;border-radius:50%;background:${markerColor};border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45);font-size:15px">🏍️</div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const distance = rider.distance_to_shop_km != null
        ? `${Number(rider.distance_to_shop_km).toFixed(2)} km from shop`
        : 'Shop distance unavailable';
      const lastGps = getLocationAge(rider.location_updated_at) || 'No GPS update';
      L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(
          `<strong>${rider.name}</strong><br>${rider.phone}<br>${getRiderAvailability(rider)}<br>${distance}<br>Pending: ${rider.active_deliveries ?? 0}<br>GPS: ${lastGps}`,
        );
      bounds.push([lat, lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
    setTimeout(() => map.invalidateSize(), 0);
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
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Order Management <span className="text-xs text-green-400">SAFE LIVE RIDER</span></h1>
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
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAutoAssign}
            disabled={savingAutoAssign}
            className={autoAssignEnabled
              ? 'border-green-600 bg-green-600/15 text-green-400 hover:bg-green-600/25 cursor-pointer'
              : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-white cursor-pointer'}
          >
            {savingAutoAssign ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Bike className="w-4 h-4 mr-1" />
            )}
            Auto Assign: {autoAssignEnabled ? 'ON' : 'OFF'}
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

        {/* All rider live locations */}
        <Card className="bg-gray-900 border-gray-800 p-3 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-white font-semibold">Live Rider Map</h2>
              <p className="text-gray-500 text-xs mt-0.5">
                Green = live GPS • Amber = saved GPS / background update pending • Grey = no GPS
              </p>
            </div>
            <div className="text-xs text-gray-400">
              {riders.filter(rider => rider.eligible_for_assignment).length} live • {riders.filter(rider => rider.can_assign).length} GPS / {riders.length} active
            </div>
          </div>
          <div
            ref={riderMapContainerRef}
            className="w-full h-[280px] rounded-xl overflow-hidden border border-gray-700"
            style={{ zIndex: 1 }}
          />
          {riders.length === 0 && (
            <p className="text-amber-400 text-xs mt-2">No rider location data available.</p>
          )}
        </Card>

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
                      {/* Rider cards sorted by nearest shop distance */}
                      <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                        {riders.filter(rider => rider.is_active).map(rider => {
                          const isSelected = selectedRider === String(rider.id);
                          const eligible = rider.can_assign === true;
                          const locationAge = getLocationAge(rider.location_updated_at);
                          return (
                            <button
                              type="button"
                              key={rider.id}
                              disabled={!eligible}
                              onClick={() => setSelectedRider(String(rider.id))}
                              className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                                !eligible
                                  ? 'border-gray-800 bg-gray-900/60 opacity-60 cursor-not-allowed'
                                  : isSelected
                                    ? 'border-blue-500 bg-blue-600/10 cursor-pointer'
                                    : 'border-gray-700 bg-gray-700/50 hover:border-green-600 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Bike className={`w-4 h-4 shrink-0 ${eligible ? 'text-green-400' : 'text-gray-500'}`} />
                                  <span className="text-white text-sm font-medium truncate">{rider.name}</span>
                                  <Badge className={eligible
                                    ? 'bg-green-600/20 text-green-400 border border-green-600/30 text-[10px] px-1.5'
                                    : 'bg-gray-700 text-gray-400 border border-gray-600 text-[10px] px-1.5'}>
                                    {getRiderAvailability(rider)}
                                  </Badge>
                                </div>
                                <span className={eligible ? 'text-green-400 text-xs font-semibold' : 'text-gray-500 text-xs'}>
                                  {rider.distance_to_shop_km != null
                                    ? `${Number(rider.distance_to_shop_km).toFixed(2)} km`
                                    : 'No distance'}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-gray-500">
                                <span>{rider.phone}</span>
                                <span>Pending: {rider.active_deliveries ?? 0}</span>
                                <span className="flex items-center gap-0.5">
                                  <MapPin className={`w-3 h-3 ${rider.gps_fresh ? 'text-green-500' : 'text-gray-600'}`} />
                                  {locationAge || 'No GPS update'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => assignToRider(order)}
                          disabled={!selectedRider || !riders.find(rider => String(rider.id) === selectedRider)?.can_assign}
                          className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer flex-1 disabled:opacity-50"
                        >
                          Assign Selected Rider
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAssigningOrder(null)} className="text-gray-400 cursor-pointer">
                          ✕
                        </Button>
                      </div>
                      {riders.filter(rider => rider.can_assign).length === 0 && (
                        <p className="text-amber-400 text-xs mt-2">
                          Kisi active rider ki GPS saved nahi hai. Order Waiting Rider mein rahega.
                        </p>
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
