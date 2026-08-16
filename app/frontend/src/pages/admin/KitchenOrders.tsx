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
  ChevronLeft,
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
    const items = parseItems(order.items_json);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const itemSubtotal = items.reduce(
      (sum, item) => sum + Number(item.totalPrice || (Number(item.price || 0) * item.quantity)),
      0,
    );
    const subtotal = Number(order.subtotal_amount ?? itemSubtotal ?? 0);
    const deliveryFee = Number(order.delivery_charge || 0);
    const serviceFee = Number(order.service_fee || 0);
    const smallOrderFee = Number(order.small_order_fee || 0);
    const vatIncluded = Number(order.tax_amount || 0);
    const itemDiscounts = Number(order.discount_amount || 0);
    const tip = Number(order.tip_amount || 0);

    return (
      <div className="pb-28">
        <section className="border-b border-slate-200 bg-white px-1 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400">
                {receiptSettings.restaurant_name || 'Fai Fai Juice'}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-black tracking-tight text-slate-900">#{order.id}</span>
                <Badge className={delivery
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                  {delivery ? 'Delivery' : 'Pickup'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatUaeTime(order.created_at)} · {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
            </div>
            <OrderTimer order={order} />
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <span className="text-lg">👤</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-400">Customer</p>
                <p className="text-lg font-bold text-slate-900">{order.customer_name}</p>
                {order.customer_phone && (
                  <a href={`tel:${order.customer_phone}`} className="text-sm font-medium text-blue-600">
                    {order.customer_phone}
                  </a>
                )}
              </div>
            </div>

            {delivery && (
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <Bike className="h-5 w-5 text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Rider</p>
                  {activeAssignment ? (
                    <>
                      <p className="text-lg font-bold text-slate-900">{assignment.rider_name}</p>
                      <p className="text-sm text-slate-500">{assignmentStatus.replaceAll('_', ' ')}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-slate-700">Waiting rider</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white py-5">
          <div className="space-y-5">
            {items.length === 0 ? (
              <p className="px-1 text-slate-400">Items details unavailable</p>
            ) : items.map((item, index) => {
              const lineTotal = Number(item.totalPrice || (Number(item.price || 0) * item.quantity));
              return (
                <div key={`${order.id}-${index}`} className="px-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-black text-slate-900">{item.quantity} x&nbsp; {item.name}</p>
                      {item.size && (
                        <p className="ml-10 mt-1 text-base text-slate-500">
                          {item.quantity} x&nbsp;&nbsp; {item.size}
                        </p>
                      )}
                      {item.extras.length > 0 && (
                        <p className="ml-10 mt-1 text-sm text-slate-500">{item.extras.join(', ')}</p>
                      )}
                    </div>
                    <p className="shrink-0 text-lg font-semibold text-slate-700">AED{money(lineTotal)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {order.order_notes && (
          <section className="border-y border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-black uppercase text-amber-700">Order notes</p>
            <p className="mt-1 whitespace-pre-wrap text-base text-amber-900">{order.order_notes}</p>
          </section>
        )}

        <section className="border-t border-slate-200 bg-white px-1 py-5">
          <div className="space-y-3 text-lg">
            <div className="flex items-center justify-between gap-4">
              <span className="text-2xl font-black text-slate-900">Subtotal</span>
              <span className="text-2xl font-black text-slate-900">AED{money(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">VAT (Incl.)</span>
              <span className="font-medium text-slate-700">{vatIncluded > 0 ? `AED${money(vatIncluded)}` : '--'}</span>
            </div>
            {delivery && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Delivery Fee</span>
                <span className="font-medium text-slate-700">AED{money(deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Service Fee</span>
              <span className="font-medium text-slate-700">AED{money(serviceFee)}</span>
            </div>
            {smallOrderFee > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Small Order Fee</span>
                <span className="font-medium text-slate-700">AED{money(smallOrderFee)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-600">Item Discounts</span>
              <span className={itemDiscounts > 0 ? 'font-medium text-red-600' : 'font-medium text-slate-700'}>
                {itemDiscounts > 0 ? `-AED${money(itemDiscounts)}` : '--'}
              </span>
            </div>
            {tip > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Tip</span>
                <span className="font-medium text-slate-700">AED{money(tip)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
              <span className="text-3xl font-black text-slate-900">Total</span>
              <span className="text-3xl font-black text-slate-900">AED{money(order.total_amount)}</span>
            </div>
          </div>
        </section>

        <section className="mt-4 border-t border-slate-200 bg-white px-1 pt-4">
          <div className="flex items-center justify-between text-base">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-900">{order.payment_method || 'Cash'}</span>
          </div>
        </section>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-4xl">
            {order.status === 'new' && acceptingOrder !== order.id && (
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => setAcceptingOrder(order.id)} className="h-14 rounded-xl bg-emerald-600 text-lg font-black hover:bg-emerald-700">
                  Accept
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(`Cancel order #${order.id}?`)) void updateOrderStatus(order, 'cancelled');
                  }}
                  className="h-14 rounded-xl border-red-200 text-lg font-black text-red-600 hover:bg-red-50"
                >
                  Cancel
                </Button>
              </div>
            )}

            {order.status === 'new' && acceptingOrder === order.id && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-sm font-black text-slate-900">Select ready time</p>
                <div className="grid grid-cols-5 gap-2">
                  {TIME_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        setSelectedTime(minutes);
                        setCustomTime('');
                      }}
                      className={`rounded-xl py-2 text-sm font-black ${
                        selectedTime === minutes && !customTime
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {minutes}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={customTime}
                    onChange={(event) => setCustomTime(event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder="Custom min"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <Button
                    onClick={() => {
                      const minutes = Number(customTime || selectedTime);
                      void updateOrderStatus(order, 'accepted', Number.isFinite(minutes) && minutes > 0 ? minutes : 20);
                    }}
                    className="rounded-xl bg-emerald-600 font-black hover:bg-emerald-700"
                  >
                    Accept
                  </Button>
                  <Button variant="outline" onClick={() => setAcceptingOrder(null)} className="rounded-xl">Back</Button>
                </div>
              </div>
            )}

            {order.status === 'accepted' && (
              <Button onClick={() => void updateOrderStatus(order, 'preparing')} className="h-14 w-full rounded-xl bg-amber-500 text-lg font-black hover:bg-amber-600">
                Preparing
              </Button>
            )}

            {order.status === 'preparing' && (
              <Button onClick={() => void updateOrderStatus(order, 'ready')} className="h-14 w-full rounded-xl bg-emerald-600 text-lg font-black hover:bg-emerald-700">
                {delivery ? 'Ready for delivery' : 'Ready for pickup'}
              </Button>
            )}

            {order.status === 'ready' && delivery && (
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-center font-bold text-blue-700">
                Waiting for rider pickup
              </div>
            )}

            {order.status === 'ready' && !delivery && (
              <Button onClick={() => void updateOrderStatus(order, 'completed')} className="h-14 w-full rounded-xl bg-slate-900 text-lg font-black hover:bg-slate-800">
                Completed
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-3 py-3 text-white">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg text-gray-300 hover:bg-gray-900"
            aria-label="Open Kitchen menu"
          >
            <Menu className="w-6 h-6" />
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
              className={`h-10 rounded-full px-3 flex items-center gap-2 text-xs font-black ${
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
            <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
              <div className="w-24 h-24 rounded-3xl bg-gray-900 flex items-center justify-center mb-6">
                <ChefHat className="w-12 h-12 text-gray-700" />
              </div>
              <h1 className="text-white text-3xl font-black">No active orders</h1>
              <p className="text-gray-500 text-base mt-3 max-w-sm">
                New orders will appear here automatically.
              </p>
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
