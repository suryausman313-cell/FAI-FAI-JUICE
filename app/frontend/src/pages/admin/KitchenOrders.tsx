import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import {
  Bell,
  Check,
  ChefHat,
  Clock,
  LogOut,
  Printer,
  RefreshCw,
  Settings,
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
    .filter((order) => order.id > 0 && ACTIVE_STATUSES.has(order.status));
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
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('kitchen_sound') !== 'off'
  );
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    printer_ip: '192.168.70.125',
    printer_port: 9100,
    paper_width: '80mm',
    auto_print_on_accept: true,
    restaurant_name: 'Vita Napoli',
  });

  const previousNewIdsRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);
  const loadInProgressRef = useRef(false);

  const kitchenPin = useCallback(
    () => localStorage.getItem('kitchen_pin') || '1234',
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

  const loadOrders = useCallback(async () => {
    if (loadInProgressRef.current) return;
    loadInProgressRef.current = true;
    setRefreshing(true);

    try {
      const response = await axios.get(
        `${getAPIBaseURL()}/api/v1/kitchen/orders`,
        {
          headers: kitchenHeaders(),
          params: { limit: 100 },
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
        toast.error('Orders load nahi huay. Refresh dobara dabayein.');
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
    return () => kitchenAlarm.stop();
  }, [loadReceiptSettings]);

  useEffect(() => {
    if (!authenticated) return;
    void loadOrders();
    const timer = setInterval(() => void loadOrders(), 8000);
    return () => clearInterval(timer);
  }, [authenticated, loadOrders]);

  function handlePinLogin(event: FormEvent) {
    event.preventDefault();
    if (pin !== '1234') {
      toast.error('Invalid Kitchen PIN');
      return;
    }

    localStorage.setItem('kitchen_auth', 'true');
    localStorage.setItem('kitchen_pin', pin);
    setAuthenticated(true);
    kitchenAlarm.unlock();
    if (soundEnabled) kitchenAlarm.playOnce();
    toast.success('Kitchen opened');
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
      toast.info('Automatic print ke liye Vita Kitchen Print Android app kholo.');
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
      toast.error('Receipt print failed. Reprint dobara dabayein.');
      return false;
    }
  }

  async function updateOrderStatus(
    order: KitchenOrder,
    status: string,
    estimatedMinutes?: number
  ) {
    try {
      await axios.put(
        `${getAPIBaseURL()}/api/v1/kitchen/orders/${order.id}/status`,
        {
          status,
          estimated_minutes: estimatedMinutes,
        },
        {
          headers: kitchenHeaders(),
          timeout: 15000,
        }
      );

      if (status === 'completed' || status === 'cancelled') {
        setOrders((current) => current.filter((item) => item.id !== order.id));
      } else {
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  status,
                  estimated_time: estimatedMinutes
                    ? `${estimatedMinutes} min`
                    : item.estimated_time,
                }
              : item
          )
        );
      }

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
              estimated_time: estimatedMinutes ? `${estimatedMinutes} min` : '',
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

  const newOrders = useMemo(
    () => orders.filter((order) => order.status === 'new'),
    [orders]
  );
  const progressOrders = useMemo(
    () => orders.filter((order) => ['accepted', 'preparing'].includes(order.status)),
    [orders]
  );
  const readyPickupOrders = useMemo(
    () => orders.filter((order) => order.status === 'ready' && !isDeliveryOrder(order)),
    [orders]
  );
  const readyDeliveryOrders = useMemo(
    () => orders.filter((order) => order.status === 'ready' && isDeliveryOrder(order)),
    [orders]
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
              maxLength={4}
              inputMode="numeric"
              className="w-full text-center text-2xl tracking-[0.5em] bg-gray-900 border border-gray-700 text-white rounded-xl py-4 px-4 focus:outline-none focus:border-orange-500"
            />
            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 py-5 text-lg">
              Enter Kitchen
            </Button>
          </form>
          <p className="text-gray-600 text-xs mt-4">Default PIN: 1234</p>
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
            <Button
              onClick={() => void updateOrderStatus(order, 'completed')}
              className="bg-gray-700 hover:bg-gray-600"
            >
              Completed
            </Button>
            <Button variant="outline" onClick={() => printReceipt(order, true)}>
              <Printer className="w-4 h-4 mr-1" /> Reprint
            </Button>
          </div>
        )}
      </Card>
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
            <ChefHat className="w-6 h-6 text-orange-500 shrink-0" />
            <h1 className="font-bold truncate">Kitchen Orders</h1>
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
            New order alert active — Accept karne par sound band hogi.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-500" /> Kitchen Settings
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Sound yahan se ON/OFF karein. Bada activation message dobara show nahi hoga.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gray-900 rounded-xl p-3">
              <div>
                <p className="font-semibold text-sm">New Order Sound</p>
                <p className="text-gray-500 text-xs">Order accept hone tak alert</p>
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
