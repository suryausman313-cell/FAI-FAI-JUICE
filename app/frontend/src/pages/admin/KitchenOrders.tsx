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

function OrderTimer({ order }: { order: KitchenOrder }) {
  const [now, setNow] = useState(Date.now());
  const lateSpokenRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const estimated = order.estimated_time ? new Date(order.estimated_time).getTime() : NaN;
  const hasDeadline = Number.isFinite(estimated) && order.status !== 'new';

  if (hasDeadline) {
    const diffMs = estimated - now;
    const signedMinutes = diffMs >= 0
      ? Math.max(0, Math.ceil(diffMs / 60000))
      : -Math.max(1, Math.floor(Math.abs(diffMs) / 60000));
    const late = signedMinutes < 0;

    if (late && !lateSpokenRef.current) {
      lateSpokenRef.current = true;
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const voice = new SpeechSynthesisUtterance(`Order number ${order.id} is late`);
          voice.lang = 'en-US';
          voice.rate = 0.95;
          window.speechSynthesis.speak(voice);
        }
      } catch {
        // Voice alert must never break the Kitchen screen.
      }
    }

    return (
      <div className="flex flex-col items-end">
        <div className={`h-16 w-16 rounded-full border-[3px] flex flex-col items-center justify-center ${
          late
            ? 'border-red-500 bg-red-50 text-red-600'
            : 'border-emerald-500 bg-emerald-50 text-emerald-700'
        }`}>
          <span className="text-2xl font-black leading-none">{signedMinutes}</span>
          <span className="text-[10px] font-bold uppercase">min</span>
        </div>
        {late && <span className="mt-1 text-xs font-black text-red-600">{Math.abs(signedMinutes)} min late</span>}
      </div>
    );
  }

  const created = new Date(order.created_at).getTime();
  const elapsedMinutes = Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 60000)) : 0;
  return (
    <div className="h-16 w-16 rounded-full border-[3px] border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-700">
      <span className="text-2xl font-black leading-none">{elapsedMinutes}</span>
      <span className="text-[10px] font-bold uppercase">min</span>
    </div>
  );
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

      setSelectedOrder((current) => {
        if (!current || current.id !== order.id) return current;
        return serverOrder || {
          ...current,
          status,
          updated_at: new Date().toISOString(),
          estimated_time: estimatedMinutes ? makeLocalReadyTime(estimatedMinutes) : current.estimated_time,
        };
      });

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

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-slate-900 text-4xl font-black">#{order.id}</span>
              <Badge className={delivery
                ? 'bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-emerald-100 text-emerald-700 border-emerald-200'}>
                {delivery ? 'Delivery' : 'Pickup'}
              </Badge>
            </div>
            <p className="mt-1 text-slate-500 text-sm">{formatUaeTime(order.created_at)} · {itemCount} item{itemCount === 1 ? '' : 's'}</p>
          </div>
          <OrderTimer order={order} />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-slate-400 text-xs font-bold uppercase mb-2">Customer</p>
          <p className="text-slate-900 text-2xl font-black">{order.customer_name}</p>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="mt-1 block text-blue-600 text-lg">
              {order.customer_phone}
            </a>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-slate-900 text-2xl font-black mb-4">Items</p>
          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="text-slate-400">Items details unavailable</p>
            ) : items.map((item, index) => (
              <div key={`${order.id}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-900 text-xl font-bold">{item.quantity} × {item.name}</p>
                    {item.size && <p className="text-slate-500 mt-1">{item.size}</p>}
                    {item.extras.length > 0 && <p className="text-slate-500 text-sm mt-1">+ {item.extras.join(', ')}</p>}
                  </div>
                  <p className="text-slate-900 font-bold">AED {money(item.totalPrice || (Number(item.price || 0) * item.quantity))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {order.order_notes && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-amber-700 text-xs font-bold uppercase mb-1">Order Notes</p>
            <p className="text-amber-900 text-base whitespace-pre-wrap">{order.order_notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-slate-400 text-xs uppercase font-bold">Payment</p>
            <p className="text-slate-900 text-lg font-bold mt-1">{order.payment_method || 'Cash'}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-sm">
            <p className="text-slate-400 text-xs uppercase font-bold">Total</p>
            <p className="text-emerald-600 text-2xl font-black mt-1">AED {money(order.total_amount)}</p>
          </div>
        </div>

        {delivery && (
          <div className={`rounded-3xl border p-5 ${
            activeAssignment ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'
          }`}>
            {activeAssignment ? (
              <>
                <p className="text-blue-800 text-lg font-bold">Rider: {assignment.rider_name}</p>
                {assignment.rider_phone && <p className="text-blue-700">{assignment.rider_phone}</p>}
                <p className="text-blue-600 text-sm mt-1">Status: {assignmentStatus.replaceAll('_', ' ')}</p>
              </>
            ) : (
              <>
                <p className="text-amber-800 text-lg font-bold">Waiting Rider</p>
                <p className="text-amber-700 text-sm mt-1">Waiting for a rider to be assigned.</p>
              </>
            )}
          </div>
        )}

        {order.status === 'new' && acceptingOrder !== order.id && (
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => setAcceptingOrder(order.id)} className="h-14 rounded-2xl bg-emerald-600 text-lg hover:bg-emerald-700">
              <Check className="w-5 h-5 mr-2" /> Accept
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm(`Cancel order #${order.id}?`)) void updateOrderStatus(order, 'cancelled');
              }}
              className="h-14 rounded-2xl border-red-200 text-red-600 hover:bg-red-50"
            >
              <X className="w-5 h-5 mr-2" /> Cancel
            </Button>
          </div>
        )}

        {order.status === 'new' && acceptingOrder === order.id && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-slate-900 text-xl font-black mb-3">Select ready time</p>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {TIME_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => { setSelectedTime(minutes); setCustomTime(''); }}
                  className={`rounded-2xl py-3 font-black ${selectedTime === minutes && !customTime ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >{minutes}</button>
              ))}
            </div>
            <input
              value={customTime}
              onChange={(event) => setCustomTime(event.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Custom minutes"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg mb-3 outline-none focus:border-emerald-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  const minutes = Number(customTime || selectedTime);
                  void updateOrderStatus(order, 'accepted', Number.isFinite(minutes) && minutes > 0 ? minutes : 20);
                }}
                className="h-14 rounded-2xl bg-emerald-600 text-lg hover:bg-emerald-700"
              >Accept & Print</Button>
              <Button variant="outline" onClick={() => setAcceptingOrder(null)} className="h-14 rounded-2xl">Back</Button>
            </div>
          </div>
        )}

        {order.status === 'accepted' && (
          <Button onClick={() => void updateOrderStatus(order, 'preparing')} className="h-16 w-full rounded-3xl bg-orange-500 text-xl font-black hover:bg-orange-600">
            Preparing
          </Button>
        )}

        {order.status === 'preparing' && (
          <Button onClick={() => void updateOrderStatus(order, 'ready')} className="h-16 w-full rounded-3xl bg-emerald-600 text-xl font-black hover:bg-emerald-700">
            {delivery ? 'Ready for delivery' : 'Ready for pickup'}
          </Button>
        )}

        {order.status === 'ready' && !delivery && (
          <Button onClick={() => void updateOrderStatus(order, 'completed')} className="h-16 w-full rounded-3xl bg-slate-900 text-xl font-black hover:bg-slate-800">
            Completed
          </Button>
        )}

        {order.status === 'ready' && delivery && (
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-center text-blue-800 font-bold">Waiting for Rider Pickup</div>
        )}

        <Button type="button" variant="outline" onClick={() => printReceipt(order, true)} className="h-14 w-full rounded-2xl border-slate-200 text-slate-700">
          <Printer className="w-5 h-5 mr-2" /> Reprint Order
        </Button>
      </div>
    );
  }

  function OrderCard({ order, section }: { order: KitchenOrder; section: 'new' | 'progress' | 'ready' }) {
    const delivery = isDeliveryOrder(order);
    const assignment = assignments[order.id];
    const assignmentStatus = String(assignment?.status || '').toLowerCase();
    const hasActiveRider = assignment && !['rejected', 'delivered'].includes(assignmentStatus);
    const itemCount = parseItems(order.items_json).reduce((sum, item) => sum + item.quantity, 0);

    return (
      <button type="button" onClick={() => openOrder(order)} className="block w-full text-left">
        <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="text-slate-900 font-black text-4xl">#{order.id}</span>
                <Badge className={delivery
                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'}>
                  {delivery ? 'Delivery' : 'Pickup'}
                </Badge>
              </div>
              <p className="mt-1 text-slate-500 text-base">{itemCount} item{itemCount === 1 ? '' : 's'} · {formatUaeTime(order.created_at)}</p>
              <p className="mt-3 text-slate-700 text-lg font-semibold">
                {section === 'new'
                  ? 'New order'
                  : section === 'progress'
                    ? (order.status === 'preparing' ? 'Preparing' : 'Accepted')
                    : delivery
                      ? (hasActiveRider ? `Rider: ${assignment.rider_name}` : 'Waiting Rider')
                      : 'Ready for pickup'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OrderTimer order={order} />
              <ChevronRight className="w-6 h-6 text-slate-300" />
            </div>
          </div>
        </Card>
      </button>
    );
  }

  function HistoryOrdersList({ orders: historyOrders }: { orders: KitchenOrder[] }) {
    const total = historyOrders
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-3xl bg-white border-slate-200 p-5 shadow-sm">
            <p className="text-slate-400 text-xs uppercase font-bold">Orders</p>
            <p className="text-slate-900 text-3xl font-black mt-1">{historyOrders.length}</p>
          </Card>
          <Card className="rounded-3xl bg-white border-slate-200 p-5 shadow-sm">
            <p className="text-slate-400 text-xs uppercase font-bold">Completed Sale</p>
            <p className="text-emerald-600 text-2xl font-black mt-1">AED {money(total)}</p>
          </Card>
        </div>

        {historyOrders.length === 0 ? (
          <div className="min-h-56 rounded-3xl border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-sm">
            There are no completed, pending delivery, or cancelled orders for this day.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {historyOrders.map((order) => (
              <Card key={order.id} className="rounded-3xl bg-white border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-900 text-lg font-black">#{order.id}</span>
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
                  <span className="text-emerald-600 font-black">AED {money(order.total_amount)}</span>
                </div>
                <p className="text-slate-700 text-sm font-medium mb-2">{order.customer_name}</p>
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
          <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
          <h2 className="text-slate-900 font-black text-2xl tracking-tight">{title} ({count})</h2>
        </div>
        <div className="space-y-2">{children}</div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() => selectedOrder ? setSelectedOrder(null) : setDrawerOpen(true)}
            className="p-2.5 rounded-xl bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label={selectedOrder ? 'Back to orders' : 'Open Kitchen menu'}
          >
            {selectedOrder ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
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
          selectedOrder ? (
            <OrderDetail order={selectedOrder} />
          ) : activeOrders.length === 0 ? (
            <div className="min-h-[72vh] flex flex-col items-center justify-center text-center px-6">
              <div className="w-28 h-28 rounded-[2rem] bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-7">
                <ChefHat className="w-14 h-14 text-violet-600" />
              </div>
              <h1 className="text-slate-900 text-4xl md:text-5xl font-black">No active orders</h1>
              <p className="text-slate-500 text-lg md:text-xl mt-4 max-w-lg">New orders will appear here automatically.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <Column title="New" count={newOrders.length} dotClass="bg-blue-500" emptyText="">
                {newOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="new" />
                ))}
              </Column>

              <Column title="Accepted" count={progressOrders.length} dotClass="bg-yellow-500" emptyText="">
                {progressOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="progress" />
                ))}
              </Column>

              <Column title="Upcoming" count={readyPickupOrders.length} dotClass="bg-purple-500" emptyText="">
                {readyPickupOrders.map((order) => (
                  <OrderCard key={order.id} order={order} section="ready" />
                ))}
              </Column>

              <Column title="Upcoming Delivery" count={readyDeliveryOrders.length} dotClass="bg-blue-500" emptyText="">
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
          <aside className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-white border-r border-slate-200 p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ChefHat className="w-6 h-6 text-orange-500" />
                <div>
                  <p className="text-slate-900 font-bold">Fai Fai Kitchen</p>
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
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-semibold text-sm">{item.label}</p>
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
