import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bike, Check, Clock, MapPin, Printer, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';

const ADMIN_PIN = '1122';
const CONTROL_URL = `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/admin-order-control`;

type RiderAssignment = {
  id: number;
  order_id: number;
  rider_id: number;
  rider_name: string;
  rider_phone?: string;
  status: string;
};

type AdminOrder = Order & {
  order_type?: string;
  delivery_charge?: number;
  rider_assignment?: RiderAssignment | null;
};

type Rider = {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  active_deliveries?: number;
  current_lat?: number | null;
  current_lng?: number | null;
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Orders' },
  { value: 'new', label: 'New' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const READY_TIMES = [15, 20, 25, 30, 40, 45, 60];

function isDelivery(order: AdminOrder): boolean {
  if (String(order.order_type || '').toLowerCase() === 'delivery') return true;
  const notes = String(order.order_notes || '').toLowerCase();
  const payment = String(order.payment_method || '').toLowerCase();
  return notes.includes('delivery') || payment.includes('delivery');
}

function parseItems(value: unknown): any[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function controlPost<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await axios.post<T>(
    `${CONTROL_URL}/${action}`,
    { pin: ADMIN_PIN, ...data },
    { timeout: 20000 },
  );
  return response.data;
}

function errorMessage(error: any): string {
  return (
    error?.response?.data?.detail ||
    error?.message ||
    'Request failed'
  );
}

export default function AdminOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [assigningOrder, setAssigningOrder] = useState<number | null>(null);
  const [selectedRider, setSelectedRider] = useState('');
  const [acceptingOrder, setAcceptingOrder] = useState<number | null>(null);
  const [readyTime, setReadyTime] = useState(20);

  const loadRiders = useCallback(async () => {
    try {
      const payload = await controlPost<{ items?: Rider[] }>('riders');
      setRiders(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      console.error(error);
      setRiders([]);
    }
  }, []);

  const loadOrders = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const payload = await controlPost<{ items?: AdminOrder[] }>('list', {
        status: filterStatus,
        search,
        limit: 200,
      });
      setOrders(Array.isArray(payload.items) ? payload.items : []);
      setLastRefresh(new Date());
      if (showToast) toast.success('Orders refreshed');
    } catch (error) {
      console.error(error);
      toast.error(`Orders load nahi hue: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterStatus, search]);

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) {
      navigate('/admin');
      return;
    }
    void loadOrders();
    void loadRiders();
    const timer = window.setInterval(() => void loadOrders(), 10000);
    return () => window.clearInterval(timer);
  }, [loadOrders, loadRiders, navigate]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !['completed', 'cancelled'].includes(String(order.status))),
    [orders],
  );

  async function updateStatus(order: AdminOrder, status: string, estimatedMinutes?: number) {
    try {
      await controlPost('status', {
        order_id: order.id,
        status,
        estimated_minutes: estimatedMinutes,
      });
      toast.success(`Order #${order.id} → ${status}`);
      setAcceptingOrder(null);
      await loadOrders();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function assignRider(order: AdminOrder) {
    if (!selectedRider) {
      toast.error('Rider select karein');
      return;
    }

    const gps = String(order.order_notes || '').match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/i);
    const address = String(order.order_notes || '').match(/Delivery Address:\s*([^|]+)/i);

    try {
      const result = await controlPost<{ already_assigned?: boolean }>('assign', {
        order_id: order.id,
        rider_id: Number(selectedRider),
        customer_lat: gps ? Number(gps[1]) : null,
        customer_lng: gps ? Number(gps[2]) : null,
        customer_address: address ? address[1].trim() : '',
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_charge: Number(order.delivery_charge || 0),
      });
      toast.success(result.already_assigned ? 'Order pehle se rider ko assigned hai' : `Order #${order.id} rider ko assign ho gaya`);
      setAssigningOrder(null);
      setSelectedRider('');
      await Promise.all([loadOrders(), loadRiders()]);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function printOrder(order: AdminOrder) {
    const items = parseItems(order.items_json);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><body style="font-family:monospace;max-width:320px;margin:auto;padding:20px">
      <h2>Fai Fai Juice</h2><h3>Order #${order.id}</h3>
      <p>${order.customer_name}<br>${order.customer_phone}</p>
      ${items.map((item) => `<p>${item.quantity || 1}x ${item.name || item.menuItem?.name || 'Item'} ${item.size ? `(${item.size})` : ''}</p>`).join('')}
      <hr><strong>Total AED ${Number(order.total_amount || 0).toFixed(2)}</strong>
      </body></html>
    `);
    win.document.close();
    win.print();
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading orders…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6 text-white">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Order Management <span className="text-xs text-green-400">ADMIN B1</span></h1>
            <p className="text-xs text-gray-500">Orders: {orders.length} • Active: {activeOrders.length} • Last {lastRefresh.toLocaleTimeString()}</p>
          </div>
          <Button variant="outline" onClick={() => void loadOrders(true)} disabled={refreshing} className="border-gray-700">
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-3 mb-5">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="bg-gray-900 border-gray-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone" className="bg-gray-900 border-gray-700" />
        </div>

        <div className="space-y-4">
          {orders.map((order) => {
            const delivery = isDelivery(order);
            const items = parseItems(order.items_json);
            const assignment = order.rider_assignment;
            const assignmentActive = assignment && !['rejected', 'delivered'].includes(String(assignment.status).toLowerCase());

            return (
              <Card key={order.id} className="bg-gray-900 border-gray-800 p-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xl font-black">#{order.id}</span>
                      <Badge className={delivery ? 'bg-blue-600/20 text-blue-300' : 'bg-green-600/20 text-green-300'}>{delivery ? 'Delivery' : 'Pickup'}</Badge>
                      <Badge className="bg-gray-800 text-gray-300">{String(order.status).replaceAll('_', ' ')}</Badge>
                    </div>
                    <p className="text-gray-300 mt-1">{order.customer_name} • {order.customer_phone}</p>
                  </div>
                  <Button variant="ghost" onClick={() => printOrder(order)}><Printer className="w-4 h-4" /></Button>
                </div>

                <div className="mt-3 space-y-1">
                  {items.map((item, index) => (
                    <p key={index} className="text-sm text-gray-300">
                      {item.quantity || 1}x {item.name || item.menuItem?.name || 'Item'} {item.size ? `(${item.size})` : ''}
                    </p>
                  ))}
                </div>

                {order.order_notes && <p className="mt-3 rounded-lg border border-yellow-700/30 bg-yellow-900/10 p-2 text-xs text-yellow-300">{order.order_notes}</p>}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-3">
                  <div>
                    <p className="text-xs text-gray-500">{order.payment_method}</p>
                    <p className="font-bold text-red-400">AED {Number(order.total_amount || 0).toFixed(2)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {String(order.status) === 'new' && acceptingOrder !== order.id && (
                      <Button onClick={() => setAcceptingOrder(order.id)} className="bg-green-600 hover:bg-green-700"><Check className="w-4 h-4 mr-1" />Accept</Button>
                    )}
                    {String(order.status) === 'accepted' && <Button onClick={() => void updateStatus(order, 'preparing')} className="bg-yellow-600 hover:bg-yellow-700">Preparing</Button>}
                    {String(order.status) === 'preparing' && <Button onClick={() => void updateStatus(order, 'ready')} className="bg-purple-600 hover:bg-purple-700">Ready</Button>}
                    {String(order.status) === 'ready' && !delivery && <Button onClick={() => void updateStatus(order, 'completed')} className="bg-gray-700">Completed</Button>}
                    {!['completed', 'cancelled'].includes(String(order.status)) && (
                      <Button variant="outline" onClick={() => void updateStatus(order, 'cancelled')} className="border-red-700 text-red-400"><X className="w-4 h-4 mr-1" />Cancel</Button>
                    )}
                  </div>
                </div>

                {acceptingOrder === order.id && (
                  <div className="mt-3 rounded-lg bg-gray-800 p-3">
                    <p className="mb-2 text-sm text-green-400">Ready time select karein</p>
                    <div className="flex flex-wrap gap-2">
                      {READY_TIMES.map((minutes) => (
                        <button key={minutes} onClick={() => setReadyTime(minutes)} className={`rounded px-3 py-2 text-sm ${readyTime === minutes ? 'bg-green-600' : 'bg-gray-700'}`}>{minutes} min</button>
                      ))}
                      <Button onClick={() => void updateStatus(order, 'accepted', readyTime)} className="bg-green-600">Confirm</Button>
                      <Button variant="ghost" onClick={() => setAcceptingOrder(null)}>Back</Button>
                    </div>
                  </div>
                )}

                {delivery && (
                  <div className="mt-3 rounded-lg border border-blue-700/30 bg-blue-950/30 p-3">
                    {assignmentActive ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-blue-300"><Bike className="inline w-4 h-4 mr-1" />{assignment?.rider_name}</p>
                          <p className="text-xs text-blue-400">Status: {assignment?.status?.replaceAll('_', ' ')}</p>
                        </div>
                        {assignment?.rider_phone && <a className="text-sm text-blue-300 underline" href={`tel:${assignment.rider_phone}`}>{assignment.rider_phone}</a>}
                      </div>
                    ) : assigningOrder === order.id ? (
                      <div>
                        <p className="mb-2 text-sm font-semibold text-blue-300">Rider select karein</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {riders.map((rider) => (
                            <button key={rider.id} onClick={() => setSelectedRider(String(rider.id))} className={`rounded-lg border p-3 text-left ${selectedRider === String(rider.id) ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-gray-800'}`}>
                              <p className="font-semibold">{rider.name}</p>
                              <p className="text-xs text-gray-400">{rider.phone} • {rider.active_deliveries || 0} active</p>
                              {rider.current_lat && <p className="text-xs text-green-400"><MapPin className="inline w-3 h-3" /> Live GPS</p>}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button onClick={() => void assignRider(order)} disabled={!selectedRider} className="bg-blue-600">Assign Selected</Button>
                          <Button variant="ghost" onClick={() => setAssigningOrder(null)}>Back</Button>
                        </div>
                        {riders.length === 0 && <p className="mt-2 text-xs text-red-300">No active rider found. Rider Management me rider add/activate karein.</p>}
                      </div>
                    ) : (
                      <Button onClick={() => { setAssigningOrder(order.id); setSelectedRider(''); void loadRiders(); }} className="bg-blue-600 hover:bg-blue-700"><Bike className="w-4 h-4 mr-1" />Assign Rider</Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {orders.length === 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 py-20 text-center">
              <p className="text-lg text-gray-400">No orders found</p>
              <p className="mt-1 text-sm text-gray-600">Refresh dabayein. Kitchen me jo orders hain woh yahan bhi aane chahiye.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
