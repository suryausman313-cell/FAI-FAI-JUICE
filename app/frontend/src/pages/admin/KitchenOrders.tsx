import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import axios from 'axios';
import {
  Bike,
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  LayoutGrid,
  LogOut,
  Menu,
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
import type { Order } from '@/lib/api';
import { formatUaeTime as formatUaeClockTime } from '@/lib/uae-time';
import { makeLocalReadyTime } from '@/components/ReadyTimeCountdown';
import KitchenMenuPanel from './KitchenMenuPanel';

declare global {
  interface Window {
    VitaPrinter?: {
      printReceipt: (payload: string) => string | void;
      startOrderAlarm?: (count: number) => void;
      stopOrderAlarm?: () => void;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

type KitchenOrder = Order & {
  branch_id?: number | null;
  branch_name?: string;
  order_type?: string;
  service_fee?: number | string;
  small_order_fee?: number | string;
  tax_amount?: number | string;
  delivery_charge?: number | string;
  tip_amount?: number | string;
  accepted_at?: string | null;
  promised_ready_at?: string | null;
  preparing_at?: string | null;
  ready_at?: string | null;
  rider_picked_up_at?: string | null;
  promised_delivery_at?: string | null;
  delivered_at?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
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
  rider_is_online?: boolean;
  rider_location_is_fresh?: boolean;
  rider_location_age_seconds?: number | null;
  rider_lat?: number | null;
  rider_lng?: number | null;
  distance_to_shop_km?: number | null;
};

type BranchOption = { id: number; name: string; is_active: boolean; is_default: boolean; restaurant_status?: RestaurantStatus | string };
type RestaurantStatus = 'open' | 'busy' | 'closed';
type ViewMode = 'live' | 'today' | 'yesterday' | 'menu';

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
const DELIVERY_PENDING_STATUSES = new Set(['out_for_delivery', 'picked_up', 'on_the_way']);

function getCancelInfo(order: KitchenOrder): { by: string; reason: string } | null {
  const match = String(order.order_notes || '').match(/Cancelled by\s+(customer|admin|kitchen|rider(?:\s+[^:|]+)?)\s*:\s*([^|]+)/i);
  if (!match) return null;
  const actor = match[1].toLowerCase();
  return {
    by: actor.startsWith('rider ') ? `Rider ${match[1].trim().slice(6)}` : actor === 'customer' ? 'Customer' : actor === 'admin' ? 'Admin' : 'Kitchen',
    reason: match[2].trim(),
  };
}

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
    accepted_at: raw?.accepted_at || null,
    promised_ready_at: raw?.promised_ready_at || (
      typeof raw?.pickup_time === 'string' && raw.pickup_time.includes('|')
        ? raw.pickup_time.split('|')[1]
        : null
    ),
    preparing_at: raw?.preparing_at || null,
    ready_at: raw?.ready_at || null,
    rider_picked_up_at: raw?.rider_picked_up_at || null,
    promised_delivery_at: raw?.promised_delivery_at || null,
    delivered_at: raw?.delivered_at || null,
  } as KitchenOrder;
}

function extractOrders(payload: any): KitchenOrder[] {
  const possible = [payload, payload?.items, payload?.data, payload?.data?.items].find(Array.isArray);
  if (!Array.isArray(possible)) return [];

  return possible.map(normalizeOrder).filter((order) => order.id > 0);
}

function parseItems(itemsJson: unknown): ParsedItem[] {
  try {
    const parsed = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => {
      let extras: string[] = [];
      if (Array.isArray(item?.extras)) {
        extras = item.extras
          .map((extra: any) => (typeof extra === 'string' ? extra : String(extra?.name || '')))
          .filter(Boolean);
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

function customerKitchenNotes(rawNotes: unknown): string {
  const systemPrefixes = [
    'delivery address:',
    'delivery fee:',
    'zone:',
    'gps:',
    'promo:',
    'order type:',
  ];

  return String(rawNotes || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const lower = part.toLowerCase();
      if (systemPrefixes.some((prefix) => lower.startsWith(prefix))) return false;
      if (lower.startsWith('cancelled by ')) return false;
      if (/^rider\s+.+?\s+rejected\s*:/i.test(part)) return false;
      return true;
    })
    .join(' | ');
}

function riderAcceptedAssignment(assignment?: AssignmentInfo): AssignmentInfo | null {
  if (!assignment) return null;
  const status = String(assignment.status || '').toLowerCase();
  return ['accepted', 'picked_up', 'on_the_way'].includes(status) ? assignment : null;
}

function riderKitchenLabel(assignment?: AssignmentInfo): string {
  const accepted = riderAcceptedAssignment(assignment);
  if (!accepted) return '';
  const status = String(accepted.status || '').toLowerCase();
  if (status === 'picked_up') return `${accepted.rider_name} picked up`;
  if (status === 'on_the_way') return `${accepted.rider_name} is on the way`;

  const distance = Number(accepted.distance_to_shop_km);
  if (accepted.rider_location_is_fresh && Number.isFinite(distance) && distance <= 0.5) {
    return `${accepted.rider_name} nearby`;
  }
  if (accepted.rider_location_is_fresh && Number.isFinite(distance)) {
    return `${accepted.rider_name} is on the way`;
  }
  return `${accepted.rider_name} accepted`;
}

function kitchenCardStatus(order: KitchenOrder, assignment?: AssignmentInfo): string {
  const riderText = riderKitchenLabel(assignment);
  if (order.status === 'new') return 'New order';
  if (order.status === 'accepted') return riderText ? `Accepted · ${riderText}` : 'Accepted';
  if (order.status === 'preparing') return riderText ? `Preparing · ${riderText}` : 'Preparing';
  if (order.status === 'ready') {
    if (!isDeliveryOrder(order)) return 'Ready for pickup';
    return riderText ? `Ready for delivery · ${riderText}` : 'Ready for delivery · Waiting rider';
  }
  return String(order.status || '').replaceAll('_', ' ');
}

function formatUaeTime(value: string): string {
  return formatUaeClockTime(value);
}

function formatHistoryTime(value: string): string {
  try {
    const raw = String(value || '').trim();
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
    const date = new Date(hasTimezone ? raw : `${raw}Z`);
    return date.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return formatUaeTime(value);
  }
}

function signedReadyMinutes(order: KitchenOrder): number | null {
  const explicitDeadline = order.promised_ready_at || (
    typeof (order as any).pickup_time === 'string' && String((order as any).pickup_time).includes('|')
      ? String((order as any).pickup_time).split('|')[1]
      : typeof order.estimated_time === 'string' && order.estimated_time.includes('|')
        ? order.estimated_time.split('|')[1]
        : null
  );

  let deadlineMs = explicitDeadline ? new Date(explicitDeadline).getTime() : Number.NaN;

  // Backward-compatible: if backend stored only "10 min", use accepted/update time
  // as the same countdown reference used by the customer ready-time display.
  if (!Number.isFinite(deadlineMs)) {
    const estimate = String(order.estimated_time || (order as any).pickup_time || '').trim();
    const match = estimate.match(/(\d+)\s*min/i);
    const minutes = match ? Number(match[1]) : 0;
    const baseRaw = order.accepted_at || order.updated_at || order.created_at;
    const baseMs = new Date(baseRaw).getTime();
    if (minutes > 0 && Number.isFinite(baseMs)) deadlineMs = baseMs + minutes * 60_000;
  }

  if (!Number.isFinite(deadlineMs)) return null;
  const differenceMs = deadlineMs - Date.now();
  if (differenceMs >= 0) return Math.ceil(differenceMs / 60_000);
  return -Math.max(1, Math.floor(Math.abs(differenceMs) / 60_000));
}

function getElapsedMinutes(value: string): number {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 60_000));
}

function totalItems(order: KitchenOrder): number {
  return parseItems(order.items_json).reduce((sum, item) => sum + item.quantity, 0);
}

function paymentLabel(order: KitchenOrder): string {
  const raw = String(order.payment_method || 'Cash').toLowerCase();
  if (raw.includes('cash')) return isDeliveryOrder(order) ? 'Cash on delivery' : 'Cash on pickup';
  if (raw.includes('card')) return 'Card';
  return String(order.payment_method || 'Cash');
}

function TimerCircle({
  order,
  onBecameLate,
}: {
  order: KitchenOrder;
  onBecameLate?: (order: KitchenOrder) => void;
  onReady?: (order: KitchenOrder) => void;
}) {
  const [, setTick] = useState(0);
  const lateAnnouncedRef = useRef(false);

  const timerActive = ['new', 'accepted', 'preparing'].includes(String(order.status || '').toLowerCase());

  useEffect(() => {
    if (!timerActive) return;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [timerActive]);

  const signed = timerActive ? signedReadyMinutes(order) : null;
  const elapsed = timerActive ? getElapsedMinutes(order.created_at) : 0;
  const isLate = timerActive && signed !== null && signed < 0;
  const value = signed !== null ? signed : elapsed;

  useEffect(() => {
    if (isLate && !lateAnnouncedRef.current) {
      lateAnnouncedRef.current = true;
      onBecameLate?.(order);
    }
    if (!isLate) lateAnnouncedRef.current = false;
  }, [isLate, onBecameLate, order]);

  // Talabat-style: once an order is Ready/Completed/Cancelled/with rider,
  // kitchen countdown disappears completely. Completed orders never keep ticking.
  if (!timerActive) return null;

  if (isLate) {
    const lateBy = Math.abs(value);
    return (
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="w-16 h-16 rounded-full border-[3px] border-red-500 flex flex-col items-center justify-center text-red-700 bg-red-50">
          <span className="text-2xl leading-none font-black">{value}</span>
          <span className="text-[10px] uppercase tracking-wide font-bold">min</span>
        </div>
        <span className="text-xs font-black text-red-600">{lateBy} min late</span>
      </div>
    );
  }

  return (
    <div className="w-16 h-16 rounded-full border-[3px] border-emerald-500 flex flex-col items-center justify-center text-emerald-700 bg-emerald-50 shrink-0">
      <span className="text-2xl leading-none font-black">{value}</span>
      <span className="text-[10px] uppercase tracking-wide font-bold">{signed !== null ? 'mins' : 'min'}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-900">
          <ChefHat className="h-10 w-10" />
        </div>
        <h2 className="text-4xl font-black text-slate-900">No active orders</h2>
        <p className="mt-3 text-lg text-slate-900">New orders will appear here automatically.</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RestaurantStatus }) {
  const styles =
    status === 'open'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : status === 'busy'
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';

  return <span className={`rounded-full border px-3 py-1 text-sm font-bold ${styles}`}>{status.toUpperCase()}</span>;
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[2.1rem] font-black tracking-tight text-slate-900">{title} <span className="text-orange-500">{count}</span></h2>
    </div>
  );
}

function BoardSection({ title, orders, emptyText, onOpen, onBecameLate, onAdvance, onCompletePickup, assignments }: {
  title: string;
  orders: KitchenOrder[];
  emptyText: string;
  onOpen: (orderId: number) => void;
  onBecameLate?: (order: KitchenOrder) => void;
  onAdvance?: (order: KitchenOrder) => void;
  onCompletePickup?: (order: KitchenOrder) => void;
  assignments: Record<number, AssignmentInfo>;
}) {
  return (
    <section className="mb-7">
      <SectionTitle title={title} count={orders.length} />
      {orders.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-lg text-slate-800 shadow-sm">{emptyText}</div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
              <button type="button" onClick={() => onOpen(order.id)} className="block w-full p-5 text-left">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-5xl font-black tracking-tight text-slate-900">#{order.id}</h3>
                      <Badge className={isDeliveryOrder(order)
                        ? 'rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700 border-blue-200'
                        : 'rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 border-emerald-200'}>
                        {isDeliveryOrder(order) ? 'Delivery' : 'Pickup'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-lg text-slate-900">{order.customer_phone || order.customer_name} · {totalItems(order)} item{totalItems(order) === 1 ? '' : 's'}</p>
                    <p className="mt-3 text-xl font-bold text-slate-900">
                      {kitchenCardStatus(order, assignments[order.id])}
                    </p>
                  </div>
                  <TimerCircle order={order} onBecameLate={onBecameLate} />
                </div>
              </button>
              {onAdvance && ['accepted', 'preparing'].includes(order.status) && (
                <div className="border-t border-slate-100 p-3">
                  <Button
                    type="button"
                    onClick={() => onAdvance(order)}
                    className={`h-14 w-full rounded-2xl text-xl font-black ${order.status === 'accepted' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {order.status === 'accepted'
                      ? 'Start preparing'
                      : isDeliveryOrder(order)
                        ? 'Ready for delivery'
                        : 'Ready for pickup'}
                  </Button>
                </div>
              )}
              {onCompletePickup && order.status === 'ready' && !isDeliveryOrder(order) && (
                <div className="border-t border-slate-100 p-3">
                  <Button
                    type="button"
                    onClick={() => onCompletePickup(order)}
                    className="h-14 w-full rounded-2xl bg-slate-900 text-xl font-black hover:bg-slate-800"
                  >
                    Complete pickup
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Line({ label, value, valueClassName = 'text-slate-900' }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xl">
      <span className="text-slate-900">{label}</span>
      <span className={`text-right font-bold ${valueClassName}`}>{value}</span>
    </div>
  );
}

export default function KitchenOrders() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(20);
  const [customTime, setCustomTime] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [restaurantStatus, setRestaurantStatus] = useState<RestaurantStatus>('open');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [savingRestaurantStatus, setSavingRestaurantStatus] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    printer_ip: '192.168.70.125',
    printer_port: 9100,
    paper_width: '80mm',
    auto_print_on_accept: true,
    restaurant_name: 'Fai Fai Juice',
  });
  const [assignments, setAssignments] = useState<Record<number, AssignmentInfo>>({});
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<KitchenOrder | null>(null);
  const [cancelPreset, setCancelPreset] = useState('');
  const [cancelOtherReason, setCancelOtherReason] = useState('');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [kitchenBranchId, setKitchenBranchId] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0);
    return saved > 0 ? saved : null;
  });

  const previousNewIdsRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);
  const loadInProgressRef = useRef(false);
  const lateVoiceAnnouncedRef = useRef<Set<string>>(new Set());
  const speechUnlockedRef = useRef(false);

  // Mobile Chrome/PWA may block speech until the page has received a real user
  // interaction. Prime the speech engine on the first tap/key press (PIN login,
  // Accept, Start Preparing, etc.) so the late-order announcement can speak later.
  useEffect(() => {
    const unlockSpeech = () => {
      if (speechUnlockedRef.current || !('speechSynthesis' in window)) return;
      try {
        const utterance = new SpeechSynthesisUtterance('.');
        utterance.lang = 'en-US';
        utterance.volume = 0.01;
        utterance.rate = 1;
        window.speechSynthesis.speak(utterance);
        speechUnlockedRef.current = true;
      } catch {
        // A later user interaction will try again.
      }
    };

    window.addEventListener('pointerdown', unlockSpeech, { passive: true });
    window.addEventListener('keydown', unlockSpeech);
    return () => {
      window.removeEventListener('pointerdown', unlockSpeech);
      window.removeEventListener('keydown', unlockSpeech);
    };
  }, []);

  const kitchenPin = useCallback(() => localStorage.getItem('kitchen_pin') || '', []);

  const kitchenHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'X-Kitchen-Pin': kitchenPin(),
      ...(kitchenBranchId ? { 'X-Branch-Id': String(kitchenBranchId) } : {}),
    }),
    [kitchenPin, kitchenBranchId],
  );

  const loadBranches = useCallback(async () => {
    try {
      const response = await axios.get(`${getAPIBaseURL()}/api/v1/entities/branches`, {
        params: { active_only: true },
        timeout: 12000,
      });
      const list: BranchOption[] = (response.data?.items || []).map((item: any) => ({
        id: Number(item.id),
        name: String(item.name || `Branch ${item.id}`),
        is_active: Boolean(item.is_active),
        is_default: Boolean(item.is_default),
        restaurant_status: String(item.restaurant_status || 'open'),
      }));
      setBranches(list);
      if (list.length > 0) {
        const saved = Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0);
        const selected = list.find((item) => item.id === saved) || list.find((item) => item.is_default) || list[0];
        setKitchenBranchId(selected.id);
        localStorage.setItem('fai_fai_kitchen_branch_id', String(selected.id));
        const status = String(selected.restaurant_status || 'open').toLowerCase();
        setRestaurantStatus(status === 'busy' || status === 'closed' ? status : 'open');
      }
    } catch (error) {
      console.error('Branch loading failed:', error);
      // Safe fallback: old single-shop Kitchen continues without branch filtering.
      setBranches([]);
      setKitchenBranchId(null);
    }
  }, []);

  function selectKitchenBranch(nextId: number) {
    if (!Number.isFinite(nextId) || nextId <= 0) return;
    const changingBranch = kitchenBranchId !== null && kitchenBranchId !== nextId;
    localStorage.setItem('fai_fai_kitchen_branch_id', String(nextId));
    previousNewIdsRef.current = new Set();
    firstLoadRef.current = true;
    setSelectedOrderId(null);
    setKitchenBranchId(nextId);
    const nextBranch = branches.find((branch) => branch.id === nextId);
    const status = String(nextBranch?.restaurant_status || 'open').toLowerCase();
    setRestaurantStatus(status === 'busy' || status === 'closed' ? status : 'open');
    if (authenticated && changingBranch) {
      localStorage.removeItem('kitchen_auth');
      localStorage.removeItem('kitchen_pin');
      setAuthenticated(false);
      setOrders([]);
      toast.info('Enter the Kitchen PIN for the selected branch');
    }
  }

  const loadReceiptSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${getAPIBaseURL()}/api/v1/receipt-settings`, { timeout: 12000 });
      if (response.data && typeof response.data === 'object') {
        setReceiptSettings((current) => ({ ...current, ...response.data }));
      }
    } catch {
      // keep defaults
    }
  }, []);

  const loadRestaurantStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${getAPIBaseURL()}/api/v1/entities/restaurant_settings`, {
        params: { limit: 1, sort: '-id' },
        timeout: 12000,
      });
      const settings = response.data?.items?.[0];
      if (!settings) return;
      const nextStatus = String(settings.restaurant_status || 'open').toLowerCase();
      setRestaurantStatus(nextStatus === 'busy' || nextStatus === 'closed' ? nextStatus : 'open');
    } catch (error) {
      console.error('Restaurant status loading failed:', error);
    }
  }, []);

  const loadRiderData = useCallback(async () => {
    try {
      const assignmentsResponse = await axios.get(`${getAPIBaseURL()}/api/v1/rider/admin/assignments`, {
        headers: kitchenHeaders(),
        timeout: 12000,
      });
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
      const response = await axios.get(`${getAPIBaseURL()}/api/v1/admin/kitchen/orders`, {
        headers: kitchenHeaders(),
        params: { limit: 300, ...(kitchenBranchId ? { branch_id: kitchenBranchId } : {}) },
        timeout: 15000,
      });

      const nextOrders = extractOrders(response.data);
      const currentNewIds = new Set(nextOrders.filter((order) => order.status === 'new').map((order) => order.id));
      const isFirstLoad = firstLoadRef.current;
      const newIds = isFirstLoad
        ? [...currentNewIds]
        : [...currentNewIds].filter((orderId) => !previousNewIdsRef.current.has(orderId));

      if (!isFirstLoad && newIds.length > 0) {
        toast.success(`${newIds.length} new order${newIds.length > 1 ? 's' : ''} received`);
      }

      previousNewIdsRef.current = currentNewIds;
      firstLoadRef.current = false;
      setOrders(nextOrders);
      setLastRefresh(new Date());

      // In the foreground, sound starts only AFTER React has received the order list.
      // The Android background service stays responsible when the app is not visible.
      if (newIds.length > 0 && window.VitaPrinter?.startOrderAlarm) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => window.VitaPrinter?.startOrderAlarm?.(newIds.length));
        });
      }
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
  }, [kitchenHeaders, kitchenBranchId]);

  useEffect(() => {
    setAuthenticated(localStorage.getItem('kitchen_auth') === 'true');
    void loadReceiptSettings();
    void loadBranches();
  }, [loadReceiptSettings, loadBranches]);

  useEffect(() => {
    const selectedBranch = branches.find((branch) => branch.id === kitchenBranchId);
    if (!selectedBranch) return;
    if (selectedBranch.is_default) {
      void loadRestaurantStatus();
      return;
    }
    const branchStatus = String(selectedBranch.restaurant_status || 'open').toLowerCase();
    setRestaurantStatus(branchStatus === 'busy' || branchStatus === 'closed' ? branchStatus : 'open');
  }, [branches, kitchenBranchId, loadRestaurantStatus]);

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

  useEffect(() => {
    if (selectedOrderId === null) return;
    const exists = orders.some((order) => order.id === selectedOrderId);
    if (!exists) setSelectedOrderId(null);
  }, [orders, selectedOrderId]);

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
          ...(kitchenBranchId ? { 'X-Branch-Id': String(kitchenBranchId) } : {}),
        },
        params: { limit: 1, ...(kitchenBranchId ? { branch_id: kitchenBranchId } : {}) },
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
      // Successful printing stays silent on the Kitchen device.
      // Print errors still show below so staff are warned only when action is needed.
      return true;
    } catch (error) {
      console.error('Receipt print failed:', error);
      toast.error('Receipt printing failed. Press print again.');
      return false;
    }
  }

  async function updateRestaurantStatus(nextStatus: RestaurantStatus) {
    setSavingRestaurantStatus(true);
    try {
      await axios.put(
        `${getAPIBaseURL()}/api/v1/kitchen/restaurant-status`,
        { status: nextStatus },
        { headers: kitchenHeaders(), timeout: 15000 },
      );
      setRestaurantStatus(nextStatus);
      if (kitchenBranchId) {
        setBranches((current) => current.map((branch) =>
          branch.id === kitchenBranchId ? { ...branch, restaurant_status: nextStatus } : branch
        ));
      }
      setStatusDialogOpen(false);
      toast.success(`Shop status: ${nextStatus.toUpperCase()}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Shop status could not be saved.');
    } finally {
      setSavingRestaurantStatus(false);
    }
  }

  async function updateOrderStatus(
    order: KitchenOrder,
    status: string,
    estimatedMinutes?: number,
    cancelReason?: string,
  ) {
    const shouldStopAlarm = status !== 'new';

    // Stop the native alarm immediately on the tap. Do not wait for Render/API.
    if (shouldStopAlarm) {
      try { window.VitaPrinter?.stopOrderAlarm?.(); } catch { /* optional Android bridge */ }
    }

    // Prevent the next foreground refresh from treating this same order as new
    // while the status request is still in flight.
    if (status !== 'new') previousNewIdsRef.current.delete(order.id);

    try {
      const response = await axios.put(
        `${getAPIBaseURL()}/api/v1/admin/kitchen/orders/${order.id}/status`,
        {
          status,
          estimated_minutes: estimatedMinutes,
          cancel_reason: cancelReason || undefined,
        },
        { headers: kitchenHeaders(), timeout: 15000 },
      );

      const serverOrder = response.data?.order ? normalizeOrder(response.data.order) : null;

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? serverOrder || {
                ...item,
                status,
                updated_at: new Date().toISOString(),
                estimated_time: estimatedMinutes ? makeLocalReadyTime(estimatedMinutes) : item.estimated_time,
                order_notes:
                  status === 'cancelled' && cancelReason
                    ? `${item.order_notes || ''}${item.order_notes ? ' | ' : ''}Cancelled by kitchen: ${cancelReason}`
                    : item.order_notes,
              }
            : item,
        ),
      );

      if (status === 'accepted') {
        const printKey = `kitchen_original_printed_${order.id}`;
        if (receiptSettings.auto_print_on_accept !== false && localStorage.getItem(printKey) !== 'true') {
          const printed = printReceipt(
            {
              ...order,
              status: 'accepted',
              estimated_time: estimatedMinutes ? makeLocalReadyTime(estimatedMinutes) : '',
            },
            false,
          );
          if (printed) localStorage.setItem(printKey, 'true');
        }
      }

      if (status === 'cancelled') setSelectedOrderId(null);
      setCustomTime('');
      toast.success(`Order #${order.id} → ${status}`);
      setTimeout(() => void loadOrders(), 700);
    } catch (error: any) {
      // If accepting/cancelling a still-new order failed, let the alarm resume.
      if (shouldStopAlarm && order.status === 'new') {
        previousNewIdsRef.current.add(order.id);
        try { window.VitaPrinter?.startOrderAlarm?.(1); } catch { /* optional bridge */ }
      }
      console.error('Kitchen status update failed:', error);
      toast.error(String(error?.response?.data?.detail || 'Order update failed'));
    }
  }

  function parseBackendDate(value: string | null | undefined): Date {
    const raw = String(value || '').trim();
    if (!raw) return new Date(NaN);

    // Match Admin Sales exactly: Python isoformat() timestamps without an
    // explicit timezone are UTC, then JavaScript converts them to device/UAE time.
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
    return new Date(hasTimezone ? raw : `${raw}Z`);
  }

  function uaeDateKey(value: string | null | undefined): string {
    if (!value) return '';
    const date = parseBackendDate(value);
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
    return [uaeNow.getFullYear(), String(uaeNow.getMonth() + 1).padStart(2, '0'), String(uaeNow.getDate()).padStart(2, '0')].join('-');
  }

  const activeOrders = useMemo(() => orders.filter((order) => ACTIVE_STATUSES.has(order.status)), [orders]);
  const historyOrders = useMemo(
    () => orders.filter((order) => ['completed', 'cancelled', 'out_for_delivery', 'picked_up', 'on_the_way'].includes(order.status)),
    [orders],
  );
  const todayHistory = useMemo(() => {
    const key = relativeUaeDateKey(0);
    return historyOrders.filter((order) => uaeDateKey(order.created_at) === key);
  }, [historyOrders]);
  const yesterdayHistory = useMemo(() => {
    const key = relativeUaeDateKey(-1);
    return historyOrders.filter((order) => uaeDateKey(order.created_at) === key);
  }, [historyOrders]);


  const newOrders = useMemo(() => activeOrders.filter((order) => order.status === 'new'), [activeOrders]);
  const acceptedOrders = useMemo(() => activeOrders.filter((order) => ['accepted', 'preparing'].includes(order.status)), [activeOrders]);
  const upcomingOrders = useMemo(() => activeOrders.filter((order) => order.status === 'ready'), [activeOrders]);

  const selectedOrder = useMemo(
    () => (selectedOrderId === null ? null : orders.find((order) => order.id === selectedOrderId) || null),
    [orders, selectedOrderId],
  );

  const announceLateOrder = useCallback((order: KitchenOrder) => {
    const key = `${order.id}_${order.promised_ready_at || 'deadline'}`;
    if (lateVoiceAnnouncedRef.current.has(key)) return;

    // Mark once for this live Kitchen session. Do not store it permanently in
    // localStorage: if a browser blocks one speech attempt, future sessions must
    // still be able to announce the late order.
    lateVoiceAnnouncedRef.current.add(key);
    toast.warning(`Order #${order.id} is late — please make it Ready.`, { duration: 10000 });

    // Native Kitchen bridge gives an audible fallback even if browser TTS is
    // unavailable. The voice below then says the actual order number.
    try {
      window.VitaPrinter?.startOrderAlarm?.(1);
      window.setTimeout(() => window.VitaPrinter?.stopOrderAlarm?.(), 2500);
    } catch { /* optional Android bridge */ }

    const speak = (attempt = 0) => {
      try {
        if (!('speechSynthesis' in window)) return;
        const synth = window.speechSynthesis;

        const message = new SpeechSynthesisUtterance(
          `Order number ${order.id} is late. Time is finished. Please make order number ${order.id} ready.`,
        );
        message.lang = 'en-US';
        message.rate = 0.9;
        message.pitch = 1;
        message.volume = 1;

        const voices = synth.getVoices();
        const englishVoice = voices.find((voice) => /^en(-|_)/i.test(voice.lang)) || voices[0];
        if (englishVoice) message.voice = englishVoice;

        message.onstart = () => {
          speechUnlockedRef.current = true;
        };
        message.onerror = () => {
          // Some mobile/PWA engines need a short retry after voices are loaded.
          if (attempt < 2) window.setTimeout(() => speak(attempt + 1), 500 + attempt * 500);
        };

        synth.speak(message);

        // Android Chrome occasionally queues an utterance without starting it.
        // Retry shortly if it is neither speaking nor pending.
        if (attempt < 2) {
          window.setTimeout(() => {
            if (!synth.speaking && !synth.pending) speak(attempt + 1);
          }, 800 + attempt * 500);
        }
      } catch {
        if (attempt < 2) window.setTimeout(() => speak(attempt + 1), 700);
      }
    };

    speak();
  }, []);

  function renderOrderDetail(order: KitchenOrder) {
    const items = parseItems(order.items_json);
    const subtotal = Number(order.subtotal_amount || items.reduce((sum, item) => sum + Number(item.totalPrice || item.price || 0) * Math.max(item.quantity, 1), 0));
    const deliveryFee = Number(order.delivery_charge || 0);
    const serviceFee = Number(order.service_fee || 0);
    const smallOrderFee = Number(order.small_order_fee || 0);
    const discount = Number(order.discount_amount || 0);
    const taxAmount = Number(order.tax_amount || 0);
    const assignment = assignments[order.id];
    const acceptedAssignment = riderAcceptedAssignment(assignment);
    const customerNotes = customerKitchenNotes(order.order_notes);
    const statusText = order.status.replaceAll('_', ' ');

    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-lg px-2.5 pb-6 pt-1">
          <div className="sticky top-0 z-20 -mx-3 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
            <button type="button" onClick={() => setSelectedOrderId(null)} className="rounded-full p-2 text-slate-900 hover:bg-slate-100">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 px-2 text-center">
              <h1 className="truncate text-lg font-black text-slate-900">#{order.id}</h1>
              <p className="text-[11px] text-slate-800">{formatUaeTime(order.created_at)}</p>
            </div>
            <button type="button" onClick={() => printReceipt(order, true)} className="rounded-full p-2 text-slate-900 hover:bg-slate-100" title="Print order">
              <Printer className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-slate-200 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}`}>
                    {statusText}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-900">
                    {isDeliveryOrder(order) ? 'Delivery' : 'Pickup'}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-black text-slate-900">{order.customer_name}</h2>
                {order.customer_phone && <p className="mt-0.5 text-sm text-slate-900">{order.customer_phone}</p>}
              </div>
              <div className="shrink-0"><TimerCircle order={order} onBecameLate={announceLateOrder} /></div>
            </div>

            <div className="space-y-1 text-sm">
              {order.branch_name && <Line label="Branch" value={order.branch_name} />}
              <Line label="Payment" value={paymentLabel(order)} />
              {acceptedAssignment && <Line label="Rider" value={riderKitchenLabel(acceptedAssignment)} />}
              {customerNotes && <Line label="Notes" value={customerNotes} />}
            </div>
          </div>

          <div className="border-b border-slate-200 py-3">
            <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-900">Items</h3>
            {items.length === 0 ? (
              <p className="py-4 text-sm text-slate-800">No item details available.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <div key={`${order.id}-${index}`} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900">{item.quantity} × {item.name}</p>
                      {item.size && <p className="mt-0.5 text-sm text-slate-900">{item.quantity} × {item.size}</p>}
                      {item.extras.length > 0 && <p className="mt-0.5 text-xs leading-5 text-slate-900">{item.extras.join(', ')}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-bold text-slate-900">AED {money(item.totalPrice || (Number(item.price || 0) * item.quantity))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-b border-slate-200 py-3 text-sm">
            <div className="space-y-1.5">
              <Line label="Subtotal" value={`AED ${money(subtotal)}`} />
              {serviceFee > 0 && <Line label="Service Fee" value={`AED ${money(serviceFee)}`} />}
              {deliveryFee > 0 && <Line label="Delivery Fee" value={`AED ${money(deliveryFee)}`} />}
              {smallOrderFee > 0 && <Line label="Small Order Fee" value={`AED ${money(smallOrderFee)}`} />}
              {discount > 0 && <Line label="Discount" value={`-AED ${money(discount)}`} valueClassName="text-red-600" />}
              {taxAmount > 0 && <Line label="VAT (Incl.)" value={`AED ${money(taxAmount)}`} />}
            </div>
            <div className="mt-3 flex items-end justify-between border-t border-slate-300 pt-3">
              <span className="text-base font-bold text-slate-900">Total</span>
              <span className="text-xl font-black text-slate-900">AED {money(order.total_amount)}</span>
            </div>
          </div>

          {order.status === 'cancelled' && getCancelInfo(order) && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
              <p className="font-black text-red-700">Cancelled by {getCancelInfo(order)!.by}</p>
              <p className="mt-1 text-slate-900">Reason: {getCancelInfo(order)!.reason}</p>
            </div>
          )}

          {order.status === 'new' && (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="mb-2 text-sm font-black text-slate-900">Accept order · ready in minutes</p>
              <div className="mb-3 grid grid-cols-5 gap-1.5">
                {TIME_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => { setSelectedTime(minutes); setCustomTime(''); }}
                    className={`rounded-lg px-1 py-2.5 text-sm font-black ${selectedTime === minutes && !customTime ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-900'}`}
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
                className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-none focus:border-emerald-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    const minutes = Number(customTime || selectedTime);
                    void updateOrderStatus(order, 'accepted', Number.isFinite(minutes) && minutes > 0 ? minutes : 20);
                  }}
                  className="h-12 rounded-xl bg-emerald-600 text-base font-bold hover:bg-emerald-700"
                >
                  <Check className="mr-2 h-4 w-4" /> Accept
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.VitaPrinter?.stopOrderAlarm?.();
                    setCancelPreset('');
                    setCancelOtherReason('');
                    setCancelOrderTarget(order);
                  }}
                  className="h-12 rounded-xl border-red-200 text-base font-bold text-red-600 hover:bg-red-50"
                >
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {order.status === 'accepted' && (
            <Button onClick={() => void updateOrderStatus(order, 'preparing')} className="mt-3 h-12 w-full rounded-xl bg-orange-500 text-base font-black hover:bg-orange-600">
              Start preparing
            </Button>
          )}

          {order.status === 'preparing' && (
            <Button onClick={() => void updateOrderStatus(order, 'ready')} className="mt-3 h-12 w-full rounded-xl bg-emerald-600 text-base font-black hover:bg-emerald-700">
              {isDeliveryOrder(order) ? 'Ready for delivery' : 'Ready for pickup'}
            </Button>
          )}

          {order.status === 'ready' && !isDeliveryOrder(order) && (
            <Button
              onClick={() => { setSelectedOrderId(null); void updateOrderStatus(order, 'completed'); }}
              className="mt-3 h-12 w-full rounded-xl bg-slate-900 text-base font-black hover:bg-slate-800"
            >
              Complete pickup
            </Button>
          )}

          {order.status === 'ready' && isDeliveryOrder(order) && (
            <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700">
              Waiting for rider pickup.
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderHistory(ordersForDay: KitchenOrder[]) {
    const completedTotal = ordersForDay
      .filter((order) => order.status === 'completed')
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

    return (
      <div className="mx-auto max-w-lg bg-white">
        <div className="mb-3 grid grid-cols-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('today')}
            className={`py-2.5 text-center text-xs font-bold ${viewMode === 'today' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-900'}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setViewMode('yesterday')}
            className={`py-2.5 text-center text-xs font-bold ${viewMode === 'yesterday' ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-900'}`}
          >
            Yesterday
          </button>
        </div>

        <div className="px-1 pb-2">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Recent orders</h2>
          <p className="mt-0.5 text-xs font-bold text-slate-900">All - {ordersForDay.length} (AED {money(completedTotal)})</p>
        </div>

        {ordersForDay.length === 0 ? (
          <div className="border-t border-slate-100 px-2 py-12 text-center text-sm text-slate-800">No orders found for this day.</div>
        ) : (
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {ordersForDay.map((order) => {
              const cancelInfo = order.status === 'cancelled' ? getCancelInfo(order) : null;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrderId(order.id)}
                  className="grid w-full grid-cols-[54px_minmax(0,1fr)_82px] items-center gap-2 px-1 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="text-base font-black tabular-nums text-slate-900">{formatHistoryTime(order.created_at)}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900">#{order.id}</p>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-900">{order.customer_name}</p>
                    {order.customer_phone && <p className="mt-0.5 truncate text-[10px] font-bold text-slate-900">{order.customer_phone}</p>}
                    {cancelInfo && <p className="mt-1 text-[11px] font-bold text-red-600">{cancelInfo.by}: {cancelInfo.reason}</p>}
                  </div>
                  <div className="min-w-[82px] text-right">
                    <p className={`text-[9px] font-black uppercase tracking-wide ${order.status === 'completed' ? 'text-emerald-600' : DELIVERY_PENDING_STATUSES.has(order.status) ? 'text-sky-600' : 'text-red-600'}`}>
                      {order.status.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-0.5 text-sm font-black text-slate-900">AED {money(order.total_amount)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-xs text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
            <ChefHat className="h-8 w-8 text-slate-900" />
          </div>
          <h1 className="mb-2 text-2xl font-black text-slate-900">Kitchen Display</h1>
          <p className="mb-6 text-sm text-slate-900">Enter PIN to access Kitchen orders</p>
          <form onSubmit={handlePinLogin} className="space-y-4">
            {branches.length > 0 && (
              <select
                value={kitchenBranchId || ''}
                onChange={(event) => selectKitchenBranch(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}{branch.is_default ? ' (Default)' : ''}</option>
                ))}
              </select>
            )}
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN"
              maxLength={8}
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-2xl tracking-[0.5em] text-slate-900 outline-none focus:border-slate-400"
            />
            <Button type="submit" className="h-14 w-full rounded-2xl bg-slate-900 text-lg hover:bg-slate-800">Enter Kitchen</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 font-bold">
      {cancelOrderTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">Cancel Order #{cancelOrderTarget.id}</h3>
              <button type="button" onClick={() => setCancelOrderTarget(null)} className="rounded-xl p-2 text-slate-800 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-900">Select a reason. A reason is required.</p>
            <div className="grid grid-cols-2 gap-2">
              {['Out of stock', 'Item unavailable', 'Kitchen too busy', 'Unable to prepare', 'Customer requested', 'Other'].map(reason => (
                <button key={reason} type="button" onClick={() => { setCancelPreset(reason); if (reason !== 'Other') setCancelOtherReason(''); }} className={`rounded-2xl border px-3 py-3 text-sm font-bold ${cancelPreset === reason ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-900'}`}>{reason}</button>
              ))}
            </div>
            {cancelPreset === 'Other' && (
              <textarea value={cancelOtherReason} onChange={e => setCancelOtherReason(e.target.value)} maxLength={300} placeholder="Write cancellation reason..." className="mt-3 w-full rounded-2xl border border-slate-200 p-3 text-slate-900 outline-none focus:border-red-400" rows={2} />
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setCancelOrderTarget(null); setCancelPreset(''); setCancelOtherReason(''); }} className="h-12 rounded-2xl">Back</Button>
              <Button
                disabled={!cancelPreset || (cancelPreset === 'Other' && !cancelOtherReason.trim())}
                onClick={() => {
                  const reason = cancelPreset === 'Other' ? cancelOtherReason.trim() : cancelPreset;
                  if (!reason) return;
                  const target = cancelOrderTarget;
                  setCancelOrderTarget(null);
                  setCancelPreset('');
                  setCancelOtherReason('');
                  void updateOrderStatus(target, 'cancelled', undefined, reason);
                }}
                className="h-12 rounded-2xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >Confirm Cancel</Button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-lg px-2.5 pb-6 pt-1.5">
        <header className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-0.5 py-1.5">
          <div className="flex items-center gap-3">
            {!selectedOrder && (
              <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-xl p-2 text-slate-900 hover:bg-slate-100">
                <Menu className="h-6 w-6" />
              </button>
            )}
            {selectedOrder ? (
              <button type="button" onClick={() => setSelectedOrderId(null)} className="rounded-xl p-2 text-slate-900 hover:bg-slate-100">
                <ChevronLeft className="h-6 w-6" />
              </button>
            ) : null}
            <div className="leading-tight">
              <p className="text-sm font-black text-slate-900">Fai Fai Juice</p>
              <p className="text-[9px] font-black tracking-wide text-slate-900">Mahi Shah</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!selectedOrder && (
              <button type="button" onClick={() => setStatusDialogOpen(true)}>
                <StatusPill status={restaurantStatus} />
              </button>
            )}
            {!selectedOrder && (
              <button type="button" onClick={logoutKitchen} className="rounded-xl p-2 text-slate-900 hover:bg-slate-100">
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        {!selectedOrder && branches.length > 1 && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <label className="flex items-center gap-3">
              <span className="whitespace-nowrap text-sm font-bold text-slate-900">Kitchen branch</span>
              <select
                value={kitchenBranchId || ''}
                onChange={(event) => selectKitchenBranch(Number(event.target.value))}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-900 outline-none focus:border-slate-400"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-xs text-slate-800">This device will only show orders for the selected branch.</p>
          </div>
        )}

        {selectedOrder ? (
          renderOrderDetail(selectedOrder)
        ) : viewMode === 'menu' ? (
          <KitchenMenuPanel embedded />
        ) : viewMode === 'today' ? (
          renderHistory(todayHistory)
        ) : viewMode === 'yesterday' ? (
          renderHistory(yesterdayHistory)
        ) : activeOrders.length === 0 ? (
          <EmptyState />
        ) : (
          <div>
            <BoardSection title="New" orders={newOrders} emptyText="No new orders" onOpen={setSelectedOrderId} onBecameLate={announceLateOrder} assignments={assignments} />
            <BoardSection title="Accepted" orders={acceptedOrders} emptyText="No accepted orders" onOpen={setSelectedOrderId} onBecameLate={announceLateOrder} onAdvance={(order) => void updateOrderStatus(order, order.status === 'accepted' ? 'preparing' : 'ready')} assignments={assignments} />
            <BoardSection
              title="Upcoming"
              orders={upcomingOrders}
              emptyText="No upcoming orders"
              onOpen={setSelectedOrderId}
              onBecameLate={announceLateOrder}
              onCompletePickup={(order) => void updateOrderStatus(order, 'completed')}
              assignments={assignments}
            />
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} aria-label="Close menu" />
          <aside className="absolute left-0 top-0 bottom-0 w-[78%] max-w-xs bg-white p-3 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">Fai Fai Juice</p>
                <p className="text-[10px] font-black tracking-wide text-slate-900">Mahi Shah</p>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-xl p-2 text-slate-900 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-2">
              {[
                { key: 'live' as const, label: 'Live Kitchen', icon: LayoutGrid, note: `${activeOrders.length} active orders`, target: 'live' as ViewMode },
                { key: 'recent' as const, label: 'Recent Orders', icon: History, note: 'Today / Yesterday', target: 'today' as ViewMode },
                { key: 'menu' as const, label: 'Menu Availability', icon: UtensilsCrossed, note: 'Available / Sold out', target: 'menu' as ViewMode },
              ].map((item) => {
                const Icon = item.icon;
                const selected = item.key === 'recent'
                  ? viewMode === 'today' || viewMode === 'yesterday'
                  : viewMode === item.target;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setViewMode(item.target);
                      setDrawerOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl border p-3 text-left ${selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="rounded-xl bg-slate-100 p-2.5"><Icon className="h-4 w-4 text-slate-900" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      <p className="text-xs font-bold text-slate-900">{item.note}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-800" />
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black"><Store className="h-5 w-5 text-slate-900" /> Shop Status</DialogTitle>
            <DialogDescription className="text-slate-900">The shop status updates immediately in the Customer app.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {([
              { key: 'open' as const, label: 'OPEN', note: 'Orders are received normally', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
              { key: 'busy' as const, label: 'BUSY', note: 'Customers will see the Busy status', className: 'border-amber-200 bg-amber-50 text-amber-700' },
              { key: 'closed' as const, label: 'CLOSED', note: 'Customers will see that the shop is closed', className: 'border-red-200 bg-red-50 text-red-700' },
            ]).map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={savingRestaurantStatus}
                onClick={() => void updateRestaurantStatus(option.key)}
                className={`rounded-2xl border p-4 text-left ${option.className} ${restaurantStatus === option.key ? 'ring-2 ring-slate-300' : ''}`}
              >
                <p className="font-black">{option.label}</p>
                <p className="mt-1 text-sm opacity-80">{option.note}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
