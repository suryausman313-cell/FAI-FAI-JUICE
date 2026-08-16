// FINAL ADMIN-ASSIGNED RIDER FLOW
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import {
  Bike,
  Check,
  ChefHat,
  Clock,
  LogOut,
  Menu,
  CalendarDays,
  History,
  LayoutGrid,
  ChevronRight,
  Printer,
  RefreshCw,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAPIBaseURL } from '@/lib/config';
import { Order } from '@/lib/api';
import ReadyTimeCountdown, { makeLocalReadyTime } from '@/components/ReadyTimeCountdown';
import KitchenMenuPanel from './KitchenMenuPanel';

declare global {
  interface Window {
    VitaPrinter?: {
      printReceipt: (payload: string) => string | void;
      stopOrderAlarm?: () => void;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

type KitchenOrder = Order & {
  order_type?: string;
  service_fee?: number | string;
  small_order_fee?: number | string;
  tax_amount?: number | string;
  delivery_charge?: number | string;
  tip_amount?: number | string;
};

type ReceiptSettings = {
  printer_ip?: string;
  printer_port?: number;
  paper_width?: string;
  auto_print_on_accept?: boolean;
  restaurant_name?: string;
  logo_url?: string;
  header_text?: string;
  footer_text?: string;
  show_customer_phone?: boolean;
  show_delivery_address?: boolean;
  show_payment_method?: boolean;
  show_item_prices?: boolean;
  show_fees_total?: boolean;
  paper_cut?: boolean;
};

type AssignmentInfo = {
  id: number;
  order_id: number;
  rider_id: number;
  rider_name: string;
  rider_phone?: string;
  status: string;
};

type RestaurantStatus = 'open' | 'busy' | 'closed';

type ParsedItem = {
  name: string;
  quantity: number;
  size?: string;
  price?: number;
  totalPrice?: number;
  extras: string[];
};

const TIME_OPTIONS = [10, 15, 20, 30, 45];
const ACTIVE_STATUSES = new Set(['new', 'accepted', 'preparing', 'ready']);
const DELIVERY_PENDING_STATUSES = new Set([
  'out_for_delivery',
  'picked_up',
  'on_the_way',
]);

function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function normalizeOrder(raw: any): KitchenOrder {
  const statusRaw = String(raw?.status || 'new').toLowerCase().trim();
  const status = ['pending', 'placed', 'created', 'order_placed'].includes(statusRaw)
    ? 'new'
    : statusRaw;

  let itemsJson = raw?.items_json;
  if (typeof itemsJson !== 'string') {
    try {
      itemsJson = JSON.stringify(Array.isArray(itemsJson) ? itemsJson : []);
    } catch {
      itemsJson = '[]';
    }
  }

  return {
    ...raw,
    id: Number(raw?.id || 0),
    customer_name: String(raw?.customer_name || 'Customer'),
    customer_phone: String(raw?.customer_phone || ''),
    estimated_time: String(raw?.estimated_time || ''),
    order_notes: String(raw?.order_notes || ''),
    payment_method: String(raw?.payment_method || 'Cash'),
    status,
    total_amount: Number(raw?.total_amount || 0),
    items_json: itemsJson || '[]',
    created_at: String(raw?.created_at || new Date().toISOString()),
    updated_at: String(raw?.updated_at || raw?.created_at || new Date().toISOString()),
  } as KitchenOrder;
}

function extractOrders(payload: any): KitchenOrder[] {
  const possible = [
    payload,
    payload?.items,
    payload?.data,
    payload?.data?.items,
  ].find(Array.isArray);

  if (!Array.isArray(possible)) return [];

  return possible
    .map(normalizeOrder)
    .filter((order) => order.id > 0);
}

function parseItems(itemsJson: unknown): ParsedItem[] {
  try {
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => {
      let extras: string[] = [];
      if (Array.isArray(item?.extras)) {
        extras = item.extras.map((extra: any) =>
          typeof extra === 'string' ? extra : String(extra?.name || '')
        ).filter(Boolean);
      } else if (typeof item?.extras === 'string' && item.extras.trim()) {
        extras = item.extras.split(',').map((extra: string) => extra.trim()).filter(Boolean);
      }

      return {
        name: String(item?.name || item?.menuItem?.name || 'Item'),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        size: String(item?.size || item?.selectedSize || ''),
        price: Number(item?.price || item?.unit_price || item?.menuItem?.price_medium || 0),
        totalPrice: Number(item?.totalPrice || item?.total_price || 0),
        extras,
      };
    });
  } catch {
    return [];
  }
}

function isDeliveryOrder(order: KitchenOrder): boolean {
  const explicitType = String(order.order_type || '').toLowerCase();
  if (explicitType === 'delivery') return true;
  return String(order.order_notes || '').toLowerCase().includes('delivery');
}

function formatUaeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
  });
}

class KitchenAlarm {
  private audioContext: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  private getContext(): AudioContext | null {
    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        this.audioContext = new AudioContextClass();
      }
      void this.audioContext.resume().catch(() => undefined);
      return this.audioContext;
    } catch {
      return null;
    }
  }

  unlock() {
    const context = this.getContext();
    if (!context) return;
    void context.resume().catch(() => undefined);
  }

  playOnce() {
    if (!this.enabled) return;
    const context = this.getContext();
    if (!context) return;

    const tones = [880, 1100, 1320];
    tones.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.24;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.38, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  }

  start() {
    if (!this.enabled || this.intervalId) return;
    this.playOnce();
    this.intervalId = setInterval(() => this.playOnce(), 3000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }
}

const kitchenAlarm = new KitchenAlarm();

function OrderTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState('0:00');

  useEffect(() => {
    const update = () => {
      const created = new Date(createdAt).getTime();
      if (!Number.isFinite(created)) {
        setElapsed('0:00');
        return;
      }
      const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
      const minutes = Math.floor(seconds / 60);
      setElapsed(`${minutes}:${String(seconds % 60).padStart(2, '0')}`);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  return <span className="text-orange-400 text-xs font-mono font-bold">{elapsed}</span>;
}

export default function KitchenOrders() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [acceptingOrder, setAcceptingOrder] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState(20);
  const [customTime, setCustomTime] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [viewMode, setViewMode] = useState<'live' | 'today' | 'yesterday' | 'menu'>('live');
  const [restaurantStatus, setRestaurantStatus] = useState<RestaurantStatus>('open');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [savingRestaurantStatus, setSavingRestaurantStatus] = useState(false);
  // Browser-generated tone is intentionally disabled.
  // The Android KitchenOrderService is the single alarm source and plays only
  // the ringtone selected by Admin.
  const soundEnabled = false;
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    printer_ip: '192.168.70.125',
    printer_port: 9100,
    paper_width: '80mm',
    auto_print_on_accept: true,
    restaurant_name: 'Fai Fai Juice',
  });
  const [assignments, setAssignments] = useState<Record<number, AssignmentInfo>>({});

  const previousNewIdsRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);
  const loadInProgressRef = useRef(false);

  const kitchenPin = useCallback(
    () => localStorage.getItem('kitchen_pin') || '',
    []
  );

  const kitchenHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'X-Kitchen-Pin': kitchenPin(),
    }),
    [kitchenPin]
  );

  const loadReceiptSettings = useCallback(async () => {
    try {
      const response = await axios.get(
        `${getAPIBaseURL()}/api/v1/receipt-settings`,
        { timeout: 12000 }
      );
      if (response.data && typeof response.data === 'object') {
        setReceiptSettings((current) => ({ ...current, ...response.data }));
      }
    } catch {
      // Defaults remain available; receipt settings failure must never blank Kitchen.
    }
  }, []);

  const loadRestaurantStatus = useCallback(async () => {
    try {
      const response = await axios.get(
        `${getAPIBaseURL()}/api/v1/entities/restaurant_settings`,
        { params: { limit: 1, sort: '-id' }, timeout: 12000 },
      );
      const settings = response.data?.items?.[0];
      if (!settings) return;
      const nextStatus = String(settings.restaurant_status || 'open').toLowerCase();
      setRestaurantStatus(
        nextStatus === 'busy' || nextStatus === 'closed' ? nextStatus : 'open',
      );
    } catch (error) {
      console.error('Restaurant status loading failed:', error);
    }
  }, []);

  async function updateRestaurantStatus(nextStatus: RestaurantStatus) {
    setSavingRestaurantStatus(true);
    try {
      await axios.put(
        `${getAPIBaseURL()}/api/v1/kitchen/restaurant-status`,
        { status: nextStatus },
        { headers: kitchenHeaders(), timeout: 15000 },
      );
      setRestaurantStatus(nextStatus);
      setStatusDialogOpen(false);
      toast.success(`Shop status: ${nextStatus.toUpperCase()}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Shop status could not be saved.');
    } finally {
      setSavingRestaurantStatus(false);
    }
  }

  const loadRiderData = useCallback(async () => {
    try {
      const assignmentsResponse = await axios.get(
        `${getAPIBaseURL()}/api/v1/rider/admin/assignments`,
        { headers: kitchenHeaders(), timeout: 12000 },
      );
      const map: Record<number, AssignmentInfo> = {};
      for (const assignment of assignmentsResponse.data?.items || []) {
        const orderId = Number(assignment?.order_id || 0);
        if (orderId > 0) map[orderId] = assignment as AssignmentInfo;
      }
      setAssignments(map);
    } catch (error) {
      console.error('Rider assignment loading failed:', error);
    }
  }, [kitchenHeaders]);

  const loadOrders = useCallback(async () => {
    if (loadInProgressRef.current) return;
    loadInProgressRef.current = true;
    setRefreshing(true);

    try {
      const response = await axios.get(
        `${getAPIBaseURL()}/api/v1/admin/kitchen/orders`,
        {
          headers: kitchenHeaders(),
          params: { limit: 300 },
          timeout: 15000,
        }
      );

      const nextOrders = extractOrders(response.data);
      const currentNewIds = new Set(
        nextOrders.filter((order) => order.status === 'new').map((order) => order.id)
      );

      if (!firstLoadRef.current) {
        const newIds = [...currentNewIds].filter(
          (orderId) => !previousNewIdsRef.current.has(orderId)
        );
        if (newIds.length > 0) {
          toast.success(`${newIds.length} new order${newIds.length > 1 ? 's' : ''} received`);
        }
      }

      // Do not play any browser-generated tone here.
      // Android KitchenOrderService handles the admin-selected ringtone.

      previousNewIdsRef.current = currentNewIds;
      firstLoadRef.current = false;
      setOrders(nextOrders);
      setLastRefresh(new Date());
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('kitchen_auth');
        localStorage.removeItem('kitchen_pin');
        setAuthenticated(false);
        toast.error('Kitchen PIN expired. Please login again.');
      } else {
        console.error('Kitchen order loading failed:', error);
        toast.error('Orders could not be loaded. Please refresh again.');
      }
    } finally {
      setRefreshing(false);
      loadInProgressRef.current = false;
    }
  }, [kitchenHeaders, soundEnabled]);

  useEffect(() => {
    setAuthenticated(localStorage.getItem('kitchen_auth') === 'true');
    void loadReceiptSettings();
    void loadRestaurantStatus();
  }, [loadReceiptSettings, loadRestaurantStatus]);

  useEffect(() => {
    if (!authenticated) return;
    void loadOrders();
    void loadRiderData();
    const timer = setInterval(() => {
      void loadOrders();
      void loadRiderData();
    }, 8000);
    return () => clearInterval(timer);
  }, [authenticated, loadOrders, loadRiderData]);

  async function handlePinLogin(event: FormEvent) {
    event.preventDefault();
    const normalizedPin = pin.trim();
    if (!/^\d{4,8}$/.test(normalizedPin)) {
      toast.error('Kitchen PIN must be 4 to 8 digits.');
      return;
    }

    try {
      await axios.get(`${getAPIBaseURL()}/api/v1/admin/kitchen/orders`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Kitchen-Pin': normalizedPin,
        },
        params: { limit: 1 },
        timeout: 12000,
      });

      localStorage.setItem('kitchen_auth', 'true');
      localStorage.setItem('kitchen_pin', normalizedPin);
      setAuthenticated(true);
      toast.success('Kitchen opened');
    } catch {
      toast.error('Invalid Kitchen PIN');
    }
  }

  function logoutKitchen() {
    localStorage.removeItem('kitchen_auth');
    localStorage.removeItem('kitchen_pin');
    setOrders([]);
    setAuthenticated(false);
  }

  function nativePrinterAvailable(): boolean {
    return Boolean(window.VitaPrinter?.printReceipt);
  }

  function printReceipt(order: KitchenOrder, reprint = false): boolean {
    if (!nativePrinterAvailable()) {
      toast.info('Open the Vita Kitchen Print Android app for automatic printing.');
      return false;
    }

    try {
      const payload = JSON.stringify({
        order: {
          ...order,
          total_amount: Number(order.total_amount || 0),
          items: parseItems(order.items_json),
          order_type: isDeliveryOrder(order) ? 'delivery' : 'pickup',
        },
        settings: receiptSettings,
        reprint,
        copy_label: reprint ? 'REPRINT / COPY' : 'KITCHEN COPY',
      });
      window.VitaPrinter?.printReceipt(payload);
      toast.success(reprint ? `Order #${order.id} reprint sent` : `Order #${order.id} printed`);
      return true;
    } catch (error) {
      console.error('Receipt print failed:', error);
      toast.error('Receipt printing failed. Press Reprint again.');
      return false;
    }
  }

  async function updateOrderStatus(
    order: KitchenOrder,
    status: string,
    estimatedMinutes?: number
  ) {
    // Stop both WebView and native Android alarm immediately when Accept is pressed.
    // Do not wait for the API response or the next 8-10 second poll.
    if (status === 'accepted') {
        try { window.VitaPrinter?.stopOrderAlarm?.(); } catch {}
    }

    try {
      const response = await axios.put(
        `${getAPIBaseURL()}/api/v1/admin/kitchen/orders/${order.id}/status`,
        {
          status,
          estimated_minutes: estimatedMinutes,
        },
        {
          headers: kitchenHeaders(),
          timeout: 15000,
        }
      );

      const serverOrder = response.data?.order
        ? normalizeOrder(response.data.order)
        : null;

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? serverOrder || {
                ...item,
                status,
                updated_at: new Date().toISOString(),
                estimated_time: estimatedMinutes
                  ? makeLocalReadyTime(estimatedMinutes)
                  : item.estimated_time,
              }
            : item
        )
      );

      if (selectedOrder?.id === order.id) {
        setSelectedOrder((current) =>
          current?.id === order.id
            ? serverOrder || {
                ...current,
                status,
                updated_at: new Date().toISOString(),
                estimated_time: estimatedMinutes
                  ? makeLocalReadyTime(estimatedMinutes)
                  : current.estimated_time,
              }
            : current
        );
      }

      if (status === 'accepted') {
        previousNewIdsRef.current.delete(order.id);
        const printKey = `kitchen_original_printed_${order.id}`;
        if (
          receiptSettings.auto_print_on_accept !== false &&
          localStorage.getItem(printKey) !== 'true'
        ) {
          const printed = printReceipt(
            {
              ...order,
              status: 'accepted',
              estimated_time: estimatedMinutes ? makeLocalReadyTime(estimatedMinutes) : '',
            },
            false
          );
          if (printed) localStorage.setItem(printKey, 'true');
        }
      }

      setAcceptingOrder(null);
      setCustomTime('');
      toast.success(`Order #${order.id} → ${status}`);
      setTimeout(() => void loadOrders(), 700);
    } catch (error: any) {
      console.error('Kitchen status update failed:', error);
      const message = error?.response?.data?.detail || 'Order update failed';
      toast.error(String(message));
    }
  }

  function uaeDateKey(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '';
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = parts.find((part) => part.type === 'day')?.value || '';
    return `${year}-${month}-${day}`;
  }

  function relativeUaeDateKey(dayOffset: number): string {
    const uaeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
    uaeNow.setDate(uaeNow.getDate() + dayOffset);
    return [
      uaeNow.getFullYear(),
      String(uaeNow.getMonth() + 1).padStart(2, '0'),
      String(uaeNow.getDate()).padStart(2, '0'),
    ].join('-');
  }

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.has(order.status)),
    [orders]
  );

  const historyOrders = useMemo(
    () => orders.filter((order) => ['completed', 'cancelled', 'out_for_delivery'].includes(order.status)),
    [orders]
  );

  const todayHistory = useMemo(() => {
    const key = relativeUaeDateKey(0);
    return historyOrders.filter((order) => uaeDateKey(order.updated_at || order.created_at) === key);
  }, [historyOrders]);

  const yesterdayHistory = useMemo(() => {
    const key = relativeUaeDateKey(-1);
    return historyOrders.filter((order) => uaeDateKey(order.updated_at || order.created_at) === key);
  }, [historyOrders]);

  const newOrders = useMemo(
    () => activeOrders.filter((order) => order.status === 'new'),
    [orders]
  );
  const progressOrders = useMemo(
    () => activeOrders.filter((order) => ['accepted', 'preparing'].includes(order.status)),
    [activeOrders]
  );
  const readyPickupOrders = useMemo(
    () => activeOrders.filter((order) => order.status === 'ready' && !isDeliveryOrder(order)),
    [activeOrders]
  );
  const readyDeliveryOrders = useMemo(
    () => activeOrders.filter((order) => order.status === 'ready' && isDeliveryOrder(order)),
    [activeOrders]
  );

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-orange-600/20 flex items-center justify-center mx-auto mb-4">
            <ChefHat className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">Kitchen Display</h1>
          <p className="text-gray-400 mb-6 text-sm">Enter PIN to access Kitchen orders</p>
          <form onSubmit={handlePinLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN"
              maxLength={8}
              inputMode="numeric"
              className="w-full text-center text-2xl tracking-[0.5em] bg-gray-900 border border-gray-700 text-white rounded-xl py-4 px-4 focus:outline-none focus:border-orange-500"
            />
            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 py-5 text-lg">
              Enter Kitchen
            </Button>
          </form>
          <p className="text-gray-600 text-xs mt-4">The PIN is controlled by KITCHEN_PIN in the Render Environment.</p>
        </div>
      </div>
    );
  }

  function renderItems(order: KitchenOrder) {
    const items = parseItems(order.items_json);
    if (items.length === 0) {
      return <p className="text-gray-500 text-xs">Items details unavailable</p>;
    }

    return items.map((item, index) => (
      <div key={`${order.id}-${index}`} className="text-gray-100 text-sm font-medium">
        <span>{item.quantity}x {item.name}</span>
        {item.size && <span className="text-gray-400"> ({item.size})</span>}
        {item.extras.length > 0 && (
          <div className="text-gray-500 text-xs ml-3">+ {item.extras.join(', ')}</div>
        )}
      </div>
    ));
  }

  function openOrder(order: KitchenOrder) {
    setSelectedOrder(order);
  }

  function OrderDetail({ order }: { order: KitchenOrder }) {
    const delivery = isDeliveryOrder(order);
    const assignment = assignments[order.id];
    const assignmentStatus = String(assignment?.status || '').toLowerCase();
    const activeAssignment = assignment && !['rejected', 'delivered'].includes(assignmentStatus);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-white text-3xl font-black">#{order.id}</span>
            <Badge className={delivery
              ? 'bg-blue-600/20 text-blue-300 border-blue-600/30'
              : 'bg-green-600/20 text-green-300 border-green-600/30'}>
              {delivery ? 'Delivery' : 'Pickup'}
            </Badge>
          </div>
          <div className="text-right">
            <OrderTimer createdAt={order.created_at} />
            <p className="text-gray-500 text-xs">{formatUaeTime(order.created_at)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-gray-500 text-xs uppercase mb-1">Customer</p>
          <p className="text-white font-semibold">{order.customer_name}</p>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="text-blue-400 text-sm">
              {order.customer_phone}
            </a>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p className="text-gray-500 text-xs uppercase mb-2">Items</p>
          <div className="space-y-2">{renderItems(order)}</div>
        </div>

        {order.order_notes && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
            <p className="text-yellow-300 text-xs font-semibold mb-1">Order Notes</p>
            <p className="text-yellow-100 text-sm whitespace-pre-wrap">{order.order_notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            <p className="text-gray-500 text-xs uppercase">Payment</p>
            <p className="text-white text-sm font-semibold mt-1">{order.payment_method || 'Cash'}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-right">
            <p className="text-gray-500 text-xs uppercase">Total</p>
            <p className="text-green-400 text-lg font-black mt-1">AED {money(order.total_amount)}</p>
          </div>
        </div>

        {delivery && (
          <div className={`rounded-xl border p-3 ${
            activeAssignment
              ? 'border-blue-700/40 bg-blue-950/40'
              : 'border-amber-600/30 bg-amber-600/10'
          }`}>
            {activeAssignment ? (
              <>
                <p className="text-blue-300 font-semibold">Rider: {assignment.rider_name}</p>
                {assignment.rider_phone && (
                  <a href={`tel:${assignment.rider_phone}`} className="text-blue-200 text-sm">
                    {assignment.rider_phone}
                  </a>
                )}
                <p className="text-blue-400/80 text-xs mt-1">
                  Status: {assignmentStatus.replaceAll('_', ' ')}
                </p>
              </>
            ) : (
              <>
                <p className="text-amber-300 font-semibold">Waiting Rider</p>
                <p className="text-amber-200/70 text-xs mt-1">Waiting for a rider to be assigned.</p>
              </>
            )}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => printReceipt(order, true)}
          className="w-full border-gray-700"
        >
          <Printer className="w-4 h-4 mr-2" /> Reprint Order
        </Button>
      </div>
    );
  }

  function OrderCard({ order, section }: { order: KitchenOrder; section: 'new' | 'progress' | 'ready' }) {
    const delivery = isDeliveryOrder(order);
    const assignment = assignments[order.id];
    const assignmentStatus = String(assignment?.status || '').toLowerCase();
    const hasActiveRider = assignment && !['rejected', 'delivered'].includes(assignmentStatus);

    return (
      <Card className="bg-gray-900 border-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={() => openOrder(order)}
          className="w-full p-4 text-left hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white font-black text-2xl">#{order.id}</span>
              <Badge className={delivery
                ? 'bg-blue-600/20 text-blue-300 border-blue-600/30'
                : 'bg-green-600/20 text-green-300 border-green-600/30'}>
                {delivery ? 'Delivery' : 'Pickup'}
              </Badge>
            </div>
            <div className="text-right shrink-0">
              <OrderTimer createdAt={order.created_at} />
              <p className="text-gray-600 text-[10px]">{formatUaeTime(order.created_at)}</p>
            </div>
          </div>

          {order.estimated_time && section !== 'new' && (
            <div className="mt-3">
              <ReadyTimeCountdown
                estimatedTime={order.estimated_time}
                referenceTime={order.updated_at || order.created_at}
                status={order.status}
                compact
              />
            </div>
          )}

          {delivery && (
            <div className={`mt-3 rounded-lg border px-3 py-2 ${
              hasActiveRider
                ? 'border-blue-700/30 bg-blue-950/30'
                : 'border-amber-600/30 bg-amber-600/10'
            }`}>
              <p className={`text-sm font-semibold ${hasActiveRider ? 'text-blue-300' : 'text-amber-300'}`}>
                {hasActiveRider ? `Rider: ${assignment.rider_name}` : 'Waiting Rider'}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-500">Tap order to view details</span>
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </div>
        </button>

        <div className="border-t border-gray-800 p-3">
          {section === 'new' && acceptingOrder !== order.id && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => setAcceptingOrder(order.id)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-1" /> Accept
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm(`Cancel order #${order.id}?`)) {
                    void updateOrderStatus(order, 'cancelled');
                  }
                }}
                className="border-red-700 text-red-400 hover:bg-red-950"
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          )}

          {section === 'new' && acceptingOrder === order.id && (
            <div className="bg-gray-800 rounded-xl p-2.5">
              <p className="text-green-400 text-xs font-semibold mb-2">Select ready time</p>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {TIME_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => {
                      setSelectedTime(minutes);
                      setCustomTime('');
                    }}
                    className={`rounded-lg py-2 text-xs font-bold ${
                      selectedTime === minutes && !customTime
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {minutes}
                  </button>
                ))}
              </div>
              <input
                value={customTime}
                onChange={(event) => setCustomTime(event.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Custom minutes"
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm mb-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    const minutes = Number(customTime || selectedTime);
                    void updateOrderStatus(
                      order,
                      'accepted',
                      Number.isFinite(minutes) && minutes > 0 ? minutes : 20,
                    );
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Accept
                </Button>
                <Button variant="outline" onClick={() => setAcceptingOrder(null)}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {section === 'progress' && order.status === 'accepted' && (
            <Button
              onClick={() => void updateOrderStatus(order, 'preparing')}
              className="w-full bg-yellow-600 hover:bg-yellow-700"
            >
              Preparing
            </Button>
          )}

          {section === 'progress' && order.status === 'preparing' && (
            <Button
              onClick={() => void updateOrderStatus(order, 'ready')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              Ready
            </Button>
          )}

          {section === 'ready' && !delivery && (
            <Button
              onClick={() => void updateOrderStatus(order, 'completed')}
              className="w-full bg-gray-700 hover:bg-gray-600"
            >
              Completed
            </Button>
          )}

          {section === 'ready' && delivery && (
            <div className="rounded-lg border border-blue-700/30 bg-blue-950/30 px-3 py-2 text-center">
              <p className="text-blue-300 text-sm font-semibold">
                {hasActiveRider ? 'Waiting for Rider Pickup' : 'Waiting Rider Assignment'}
              </p>
            </div>
          )}
        </div>
      </Card>
    );
  }

  function HistoryOrdersList({ orders: historyOrders }: { orders: KitchenOrder[] }) {
    const total = historyOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-gray-900 border-gray-800 p-4">
            <p className="text-gray-500 text-xs uppercase">Orders</p>
            <p className="text-white text-2xl font-black mt-1">{historyOrders.length}</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4">
            <p className="text-gray-500 text-xs uppercase">Completed Sale</p>
            <p className="text-green-400 text-xl font-black mt-1">AED {money(total)}</p>
          </Card>
        </div>

        {historyOrders.length === 0 ? (
          <div className="min-h-56 rounded-xl border border-gray-800 bg-gray-900/50 flex items-center justify-center text-gray-600 text-sm">
            There are no completed, pending delivery, or cancelled orders for this day.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {historyOrders.map((order) => (
              <Card key={order.id} className="bg-gray-900 border-gray-800 p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-lg font-black">#{order.id}</span>
                      <Badge
                        className={
                          order.status === 'completed'
                            ? 'bg-green-600/20 text-green-300 border-green-600/30'
                            : DELIVERY_PENDING_STATUSES.has(order.status)
                              ? 'bg-blue-600/20 text-blue-300 border-blue-600/30'
                              : 'bg-red-600/20 text-red-300 border-red-600/30'
                        }
                      >
                        {order.status === 'completed'
                          ? 'Completed'
                          : DELIVERY_PENDING_STATUSES.has(order.status)
                            ? 'Delivery Pending'
                            : 'Cancelled'}
                      </Badge>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      {formatUaeTime(order.updated_at || order.created_at)}
                    </p>
                  </div>
                  <span className="text-green-400 font-black">AED {money(order.total_amount)}</span>
                </div>
                <p className="text-gray-300 text-sm font-medium mb-2">{order.customer_name}</p>
                {DELIVERY_PENDING_STATUSES.has(order.status) && assignments[order.id] && (
                  <div className="mb-2 rounded-lg border border-blue-700/30 bg-blue-950/30 px-2 py-1.5">
                    <p className="text-blue-300 text-xs font-semibold">Rider: {assignments[order.id].rider_name}</p>
                    {assignments[order.id].rider_phone && (
                      <p className="text-blue-200/80 text-xs">{assignments[order.id].rider_phone}</p>
                    )}
                    <p className="text-blue-400/70 text-[11px]">Status: {String(assignments[order.id].status).replaceAll('_', ' ')}</p>
                  </div>
                )}
                <div className="space-y-1">{renderItems(order)}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printReceipt(order, true)}
                  className="w-full mt-3 border-gray-700"
                >
                  <Printer className="w-4 h-4 mr-2" /> Reprint Copy
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Column({
    title,
    count,
    dotClass,
    children,
  }: {
    title: string;
    count: number;
    dotClass: string;
    emptyText?: string;
    children: ReactNode;
  }) {
    if (count === 0) return null;

    return (
      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className={`w-3 h-3 rounded-full ${dotClass}`} />
          <h2 className="text-gray-300 font-bold text-xs tracking-wide">{title} ({count})</h2>
        </div>
        <div className="space-y-2">{children}</div>
      </section>
    );
  }

  return (
    <div className={`min-h-screen px-3 py-3 ${viewMode === 'live' && activeOrders.length === 0 ? 'bg-white text-gray-900' : 'bg-gray-950 text-white'}`}>
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`p-2.5 rounded-lg ${viewMode === 'live' && activeOrders.length === 0 ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-900'}`}
            aria-label="Open Kitchen menu"
          >
            <Menu className="w-8 h-8" />
          </button>

          <div className="flex items-center gap-2">
            {selectedOrder && nativePrinterAvailable() && (
              <button
                type="button"
                onClick={() => printReceipt(selectedOrder, true)}
                className="p-2 rounded-lg text-orange-400 hover:bg-orange-950/30"
                title={`Reprint order #${selectedOrder.id}`}
                aria-label="Reprint selected order"
              >
                <Printer className="w-5 h-5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setStatusDialogOpen(true)}
              className={`h-11 rounded-full px-4 flex items-center gap-2 text-sm font-black ${
                restaurantStatus === 'open'
                  ? 'bg-green-600/15 text-green-400'
                  : restaurantStatus === 'busy'
                    ? 'bg-amber-600/15 text-amber-400'
                    : 'bg-red-600/15 text-red-400'
              }`}
              title="Change shop status"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${
                restaurantStatus === 'open'
                  ? 'bg-green-500'
                  : restaurantStatus === 'busy'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`} />
              {restaurantStatus.toUpperCase()}
            </button>
          </div>
        </header>

        {viewMode === 'menu' ? (
          <KitchenMenuPanel embedded />
        ) : viewMode === 'live' ? (
          activeOrders.length === 0 ? (
            <div className="relative min-h-[78vh] overflow-hidden flex flex-col items-center justify-center text-center px-6">
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute inset-[-22%] flex flex-col items-center justify-center gap-10 rotate-[-28deg] select-none">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="whitespace-nowrap text-[clamp(5rem,14vw,11rem)] leading-none font-black tracking-[0.05em] text-slate-900/[0.045]"
                    >
                      MAHI SHAH
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-28 h-28 rounded-[2rem] bg-violet-50 border border-violet-100 shadow-sm flex items-center justify-center mb-7">
                  <ChefHat className="w-14 h-14 text-violet-600" />
                </div>
                <h1 className="text-gray-900 text-4xl md:text-5xl font-black tracking-tight">
                  No active orders
                </h1>
                <p className="text-slate-500 text-lg md:text-xl mt-4 max-w-lg">
                  New orders will appear here automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <Column title="NEW" count={newOrders.length} dotClass="bg-blue-500" emptyText="">
                {newOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="new" />
                ))}
              </Column>

              <Column title="IN PROGRESS" count={progressOrders.length} dotClass="bg-yellow-500" emptyText="">
                {progressOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="progress" />
                ))}
              </Column>

              <Column title="READY - PICKUP" count={readyPickupOrders.length} dotClass="bg-purple-500" emptyText="">
                {readyPickupOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="ready" />
                ))}
              </Column>

              <Column title="READY - DELIVERY" count={readyDeliveryOrders.length} dotClass="bg-blue-500" emptyText="">
                {readyDeliveryOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="ready" />
                ))}
              </Column>
            </div>
          )
        ) : (
          <HistoryOrdersList orders={viewMode === 'today' ? todayHistory : yesterdayHistory} />
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close Kitchen menu"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-gray-950 border-r border-gray-800 p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ChefHat className="w-6 h-6 text-orange-500" />
                <div>
                  <p className="text-white font-bold">Fai Fai Kitchen</p>
                  <p className="text-gray-500 text-xs">Orders & history</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="p-2 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { key: 'live' as const, label: 'Live Kitchen', icon: LayoutGrid, count: activeOrders.length, total: null },
                { key: 'today' as const, label: 'Today Orders', icon: CalendarDays, count: todayHistory.length, total: todayHistory.filter((order) => order.status === 'completed').reduce((sum, order) => sum + Number(order.total_amount || 0), 0) },
                { key: 'yesterday' as const, label: 'Yesterday Orders', icon: History, count: yesterdayHistory.length, total: yesterdayHistory.filter((order) => order.status === 'completed').reduce((sum, order) => sum + Number(order.total_amount || 0), 0) },
                { key: 'menu' as const, label: 'Menu Availability', icon: UtensilsCrossed, count: null, total: null },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setViewMode(item.key);
                      setDrawerOpen(false);
                    }}
                    className={`w-full rounded-xl border p-3 flex items-center gap-3 text-left ${
                      viewMode === item.key
                        ? 'bg-orange-600/15 border-orange-600/40'
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{item.label}</p>
                      <p className="text-gray-500 text-xs">
                        {item.key === 'menu'
                          ? 'Available / Sold Out'
                          : `${item.count} order${item.count === 1 ? '' : 's'}${item.total !== null ? ` · AED ${money(item.total)}` : ''}`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-500" /> Shop Status
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              The shop status updates immediately in the Customer app.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {([
              { key: 'open' as const, label: 'OPEN', note: 'Orders are received normally', className: 'border-green-600/40 bg-green-600/10 text-green-400' },
              { key: 'busy' as const, label: 'BUSY', note: 'Customers will see the Busy status', className: 'border-amber-600/40 bg-amber-600/10 text-amber-400' },
              { key: 'closed' as const, label: 'CLOSED', note: 'Customers will see that the shop is closed', className: 'border-red-600/40 bg-red-600/10 text-red-400' },
            ]).map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={savingRestaurantStatus}
                onClick={() => void updateRestaurantStatus(option.key)}
                className={`rounded-xl border p-3 text-left disabled:opacity-50 ${option.className} ${restaurantStatus === option.key ? 'ring-2 ring-white/30' : ''}`}
              >
                <p className="font-black">{option.label}</p>
                <p className="text-xs opacity-75 mt-0.5">{option.note}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>


      <Dialog
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      >
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription className="text-gray-500">
              Full customer, item and payment details.
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && <OrderDetail order={selectedOrder} />}
        </DialogContent>
      </Dialog>

    </div>
  );
}
