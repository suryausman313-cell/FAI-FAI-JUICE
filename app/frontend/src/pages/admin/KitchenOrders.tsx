// FINAL ADMIN-ASSIGNED RIDER FLOW
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import {
  Bell,
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
  Settings,
  Store,
  UtensilsCrossed,
  Volume2,
  VolumeX,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'live' | 'today' | 'yesterday' | 'menu'>('live');
  const [restaurantStatus, setRestaurantStatus] = useState<RestaurantStatus>('open');
  const [restaurantSettingsId, setRestaurantSettingsId] = useState<number | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [savingRestaurantStatus, setSavingRestaurantStatus] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('kitchen_sound') !== 'off'
  );
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
      setRestaurantSettingsId(Number(settings.id));
      const nextStatus = String(settings.restaurant_status || 'open').toLowerCase();
      setRestaurantStatus(
        nextStatus === 'busy' || nextStatus === 'closed' ? nextStatus : 'open',
      );
    } catch (error) {
      console.error('Restaurant status loading failed:', error);
    }
  }, []);

  async function updateRestaurantStatus(nextStatus: RestaurantStatus) {
    if (!restaurantSettingsId) {
      toast.error('Restaurant settings could not be loaded. Please refresh.');
      return;
    }

    setSavingRestaurantStatus(true);
    try {
      await axios.put(
        `${getAPIBaseURL()}/api/v1/entities/restaurant_settings/${restaurantSettingsId}`,
        { restaurant_status: nextStatus },
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
          if (soundEnabled) kitchenAlarm.start();
        }
      }

      if (currentNewIds.size > 0 && soundEnabled) {
        kitchenAlarm.start();
      } else {
        kitchenAlarm.stop();
      }

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
    kitchenAlarm.setEnabled(soundEnabled);
    if (!soundEnabled) kitchenAlarm.stop();
  }, [soundEnabled]);

  useEffect(() => {
    setAuthenticated(localStorage.getItem('kitchen_auth') === 'true');
    void loadReceiptSettings();
    void loadRestaurantStatus();
    return () => kitchenAlarm.stop();
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
      kitchenAlarm.unlock();
      if (soundEnabled) kitchenAlarm.playOnce();
      toast.success('Kitchen opened');
    } catch {
      toast.error('Invalid Kitchen PIN');
    }
  }

  function logoutKitchen() {
    localStorage.removeItem('kitchen_auth');
    localStorage.removeItem('kitchen_pin');
    kitchenAlarm.stop();
    setOrders([]);
    setAuthenticated(false);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('kitchen_sound', next ? 'on' : 'off');
    kitchenAlarm.setEnabled(next);
    if (next) {
      kitchenAlarm.unlock();
      kitchenAlarm.playOnce();
      toast.success('Kitchen sound ON');
    } else {
      toast.info('Kitchen sound OFF');
    }
  }

  function testSound() {
    kitchenAlarm.setEnabled(true);
    kitchenAlarm.unlock();
    kitchenAlarm.playOnce();
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

      if (status === 'accepted') {
        previousNewIdsRef.current.delete(order.id);
        const remainingNew = orders.filter(
          (item) => item.id !== order.id && item.status === 'new'
        );
        if (remainingNew.length === 0) kitchenAlarm.stop();

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

  function OrderCard({ order, section }: { order: KitchenOrder; section: 'new' | 'progress' | 'ready' }) {
    return (
      <Card className="bg-gray-900 border-gray-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-white font-black text-xl">#{order.id}</span>
            <Badge className={isDeliveryOrder(order)
              ? 'bg-blue-600/20 text-blue-300 border-blue-600/30'
              : 'bg-green-600/20 text-green-300 border-green-600/30'}>
              {isDeliveryOrder(order) ? 'Delivery' : 'Pickup'}
            </Badge>
          </div>
          <div className="text-right">
            <OrderTimer createdAt={order.created_at} />
            <div className="text-gray-500 text-[10px]">{formatUaeTime(order.created_at)}</div>
          </div>
        </div>

        <div className="mb-2">
          <p className="text-gray-200 text-sm font-medium">{order.customer_name}</p>
          {order.customer_phone && <p className="text-gray-500 text-xs">{order.customer_phone}</p>}
        </div>

        <div className="space-y-1 mb-2">{renderItems(order)}</div>

        {order.order_notes && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1.5 mb-2">
            <p className="text-yellow-300 text-xs">{order.order_notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-500 text-xs">{order.payment_method || 'Cash'}</span>
          <span className="text-red-400 font-black">AED {money(order.total_amount)}</span>
        </div>

        {order.estimated_time && section !== 'new' && (
          <div className="mb-3">
            <ReadyTimeCountdown
              estimatedTime={order.estimated_time}
              referenceTime={order.updated_at || order.created_at}
              status={order.status}
              compact
            />
          </div>
        )}

        {isDeliveryOrder(order) && (() => {
          const assignment = assignments[order.id];
          const assignmentStatus = String(assignment?.status || '').toLowerCase();
          const activeAssignment = assignment && !['rejected', 'delivered'].includes(assignmentStatus);

          if (!activeAssignment) {
            return (
              <div className="mb-3 rounded-lg border border-amber-600/30 bg-amber-600/10 px-2.5 py-2">
                <p className="text-amber-300 text-sm font-semibold">Waiting Rider</p>
                <p className="text-amber-200/70 text-xs mt-0.5">Waiting for a rider to be assigned.</p>
                {assignmentStatus === 'rejected' && (
                  <p className="text-red-300 text-xs mt-1">The previous rider rejected the order. Another rider will be assigned.</p>
                )}
              </div>
            );
          }

          return (
            <div className="mb-3 rounded-lg border border-blue-700/40 bg-blue-950/50 px-2.5 py-2">
              <div className="flex items-center gap-2 text-blue-300 text-sm font-semibold">
                <Bike className="w-4 h-4" /> {assignment.rider_name}
              </div>
              {assignment.rider_phone && (
                <a href={`tel:${assignment.rider_phone}`} className="text-blue-200 text-xs mt-1 block hover:underline">
                  {assignment.rider_phone}
                </a>
              )}
              <p className="text-blue-400/80 text-xs mt-1">Rider status: {assignmentStatus.replaceAll('_', ' ')}</p>
            </div>
          );
        })()}

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
                  void updateOrderStatus(order, 'accepted', Number.isFinite(minutes) && minutes > 0 ? minutes : 20);
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Accept & Print
              </Button>
              <Button variant="outline" onClick={() => setAcceptingOrder(null)}>
                Back
              </Button>
            </div>
          </div>
        )}

        {section === 'progress' && (
          <div className="grid grid-cols-2 gap-2">
            {order.status === 'accepted' ? (
              <Button
                onClick={() => void updateOrderStatus(order, 'preparing')}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Preparing
              </Button>
            ) : (
              <Button
                onClick={() => void updateOrderStatus(order, 'ready')}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Ready
              </Button>
            )}
            <Button variant="outline" onClick={() => printReceipt(order, true)}>
              <Printer className="w-4 h-4 mr-1" /> Reprint
            </Button>
          </div>
        )}

        {section === 'ready' && (
          <div className="grid grid-cols-2 gap-2">
            {isDeliveryOrder(order) ? (
              <div className="col-span-2 rounded-lg border border-blue-700/30 bg-blue-950/30 px-2 py-2 text-center">
                <p className="text-blue-300 text-sm font-semibold">
                  {assignments[order.id] && !['rejected', 'delivered'].includes(String(assignments[order.id].status).toLowerCase())
                    ? 'Waiting for Rider Pickup'
                    : 'Waiting Rider Assignment'}
                </p>
                <p className="text-blue-200/70 text-xs mt-0.5">This delivery order can only be completed from the Rider app.</p>
              </div>
            ) : (
              <Button
                onClick={() => void updateOrderStatus(order, 'completed')}
                className="bg-gray-700 hover:bg-gray-600"
              >
                Completed
              </Button>
            )}

            <Button variant="outline" onClick={() => printReceipt(order, true)}>
              <Printer className="w-4 h-4 mr-1" /> Reprint
            </Button>

            {isDeliveryOrder(order) && (
              <p className="col-span-2 text-[11px] text-blue-300 bg-blue-600/10 border border-blue-600/20 rounded-lg px-2 py-1.5">
                After the rider marks Picked Up, the order moves from Live Kitchen to Today Orders as “Delivery Pending”. It becomes “Completed” automatically when the rider marks Delivered.
              </p>
            )}
          </div>
        )}

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
    emptyText,
    children,
  }: {
    title: string;
    count: number;
    dotClass: string;
    emptyText: string;
    children: ReactNode;
  }) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className={`w-3 h-3 rounded-full ${dotClass}`} />
          <h2 className="text-gray-200 font-semibold text-sm">{title} ({count})</h2>
        </div>
        <div className="space-y-2">
          {count === 0 ? (
            <div className="min-h-28 flex items-center justify-center text-gray-700 text-xs text-center">
              {emptyText}
            </div>
          ) : children}
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-3 py-3 text-white">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:text-white"
              aria-label="Open Kitchen menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <ChefHat className="w-6 h-6 text-orange-500 shrink-0" />
            <h1 className="font-bold truncate">
              {viewMode === 'live'
                ? 'Kitchen Orders'
                : viewMode === 'today'
                  ? 'Today Orders'
                  : viewMode === 'yesterday'
                    ? 'Yesterday Orders'
                    : 'Kitchen Menu'}
            </h1>
            <div className="relative shrink-0">
              <Bell className="w-5 h-5 text-gray-500" />
              {newOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-[9px] flex items-center justify-center">
                  {newOrders.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setStatusDialogOpen(true)}
              className={`h-10 rounded-lg border px-2.5 flex items-center gap-1.5 text-xs font-bold ${
                restaurantStatus === 'open'
                  ? 'bg-green-600/20 text-green-400 border-green-600/30'
                  : restaurantStatus === 'busy'
                    ? 'bg-amber-600/20 text-amber-400 border-amber-600/30'
                    : 'bg-red-600/20 text-red-400 border-red-600/30'
              }`}
              title="Change shop status"
            >
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">{restaurantStatus.toUpperCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`p-2 rounded-lg border ${
                soundEnabled
                  ? 'bg-green-600/20 text-green-400 border-green-600/30'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}
              title="Kitchen sound settings"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button
              type="button"
              className={`p-2 rounded-lg border ${
                nativePrinterAvailable()
                  ? 'bg-orange-600/20 text-orange-400 border-orange-600/30'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}
              title={nativePrinterAvailable() ? 'Printer app connected' : 'Printer app not connected'}
            >
              <Printer className="w-5 h-5" />
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadOrders()}
              disabled={refreshing}
              className="text-gray-400 px-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logoutKitchen}
              className="text-gray-500 px-2"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex items-center justify-between bg-gray-900/70 border border-gray-800 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            Last update: {lastRefresh.toLocaleTimeString()}
          </div>
          <div className="text-xs text-gray-500">
            {nativePrinterAvailable() ? 'Printer connected' : 'Browser mode'}
          </div>
        </div>

        {soundEnabled && newOrders.length > 0 && (
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg px-3 py-2 mb-3 text-red-300 text-xs">
            New order alert is active. The sound stops when the order is accepted.
          </div>
        )}

        {viewMode === 'menu' ? (
          <KitchenMenuPanel embedded />
        ) : viewMode === 'live' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Column title="NEW" count={newOrders.length} dotClass="bg-blue-600" emptyText="No new orders">
              {newOrders.map((order) => <OrderCard key={order.id} order={order} section="new" />)}
            </Column>

            <Column title="IN PROGRESS" count={progressOrders.length} dotClass="bg-yellow-500" emptyText="No active orders">
              {progressOrders.map((order) => <OrderCard key={order.id} order={order} section="progress" />)}
            </Column>

            <Column title="READY - PICKUP" count={readyPickupOrders.length} dotClass="bg-purple-600" emptyText="No pickup orders ready">
              {readyPickupOrders.map((order) => <OrderCard key={order.id} order={order} section="ready" />)}
            </Column>

            <Column title="READY - DELIVERY" count={readyDeliveryOrders.length} dotClass="bg-blue-600" emptyText="No delivery orders ready">
              {readyDeliveryOrders.map((order) => <OrderCard key={order.id} order={order} section="ready" />)}
            </Column>

          </div>
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-500" /> Kitchen Settings
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Turn the sound ON or OFF here. The large activation message will not appear again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gray-900 rounded-xl p-3">
              <div>
                <p className="font-semibold text-sm">New Order Sound</p>
                <p className="text-gray-500 text-xs">Alert continues until the order is accepted</p>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  soundEnabled ? 'bg-green-600' : 'bg-gray-700'
                }`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <Button
              variant="outline"
              onClick={testSound}
              className="w-full border-gray-700"
            >
              <Volume2 className="w-4 h-4 mr-2" /> Test Sound
            </Button>

            <div className="bg-gray-900 rounded-xl p-3 text-xs text-gray-400 space-y-1">
              <p>Printer IP: {receiptSettings.printer_ip || '192.168.70.125'}</p>
              <p>Port: {receiptSettings.printer_port || 9100}</p>
              <p>Paper: {receiptSettings.paper_width || '80mm'}</p>
              <p>Automatic print on Accept: {receiptSettings.auto_print_on_accept === false ? 'OFF' : 'ON'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
