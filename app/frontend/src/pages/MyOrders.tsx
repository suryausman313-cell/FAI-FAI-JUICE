import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, XCircle, ChefHat, Package, RefreshCw, Store, MessageSquare, Bike, Navigation, AlertTriangle, X, ShoppingCart, Bell, BellOff, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CustomerLayout from '@/components/CustomerLayout';
import { client, Order, MenuItem, Extra, getItemSizes, getItemExtras } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { addToCart } from '@/lib/cart-store';
import { getGuestSessionId } from '@/lib/guest-session';
import ReadyTimeCountdown from '@/components/ReadyTimeCountdown';
import { formatUaeDate, formatUaeDateTime, parseApiDate } from '@/lib/uae-time';
import {
  enableCustomerPush,
  syncCustomerPushIfAllowed,
} from '@/lib/customer-push';

const PICKUP_STEPS = [
  { key: 'new', labelKey: 'orders.status.placed', icon: Store },
  { key: 'accepted', labelKey: 'orders.status.accepted', icon: CheckCircle },
  { key: 'preparing', labelKey: 'orders.status.preparing', icon: ChefHat },
  { key: 'ready', labelKey: 'orders.status.ready', icon: Package },
];

const DELIVERY_STEPS = [
  { key: 'new', labelKey: 'orders.status.placed', icon: Store },
  { key: 'accepted', labelKey: 'orders.status.confirmed', icon: CheckCircle },
  { key: 'preparing', labelKey: 'orders.status.preparing', icon: ChefHat },
  { key: 'ready', labelKey: 'orders.status.ready', icon: Package },
  { key: 'picked_up', labelKey: 'orders.status.picked_up', icon: Bike },
  { key: 'on_the_way', labelKey: 'orders.status.on_the_way', icon: Navigation },
  { key: 'delivered', labelKey: 'orders.status.delivered', icon: CheckCircle },
];

function getStepIndex(status: string, steps: typeof PICKUP_STEPS): number {
  const idx = steps.findIndex(s => s.key === status);
  return idx >= 0 ? idx : -1;
}

function getDeliveryStepIndex(orderStatus: string, deliveryStatus: string | null): number {
  if (deliveryStatus === 'delivered') return 6;
  if (deliveryStatus === 'on_the_way') return 5;
  if (deliveryStatus === 'picked_up') return 4;
  if (orderStatus === 'ready') return 3;
  if (orderStatus === 'preparing') return 2;
  if (orderStatus === 'accepted') return 1;
  if (orderStatus === 'new') return 0;
  return -1;
}

/** Format all customer order dates in UAE time, independent of device timezone. */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Date unavailable';
  const date = parseApiDate(dateStr);
  if (date.getUTCFullYear() < 2000 || Number.isNaN(date.getTime())) return 'Date unavailable';
  return `${formatUaeDateTime(dateStr)} UAE`;
}

/** Format date for past orders (short format) */
function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Date unavailable';
  const date = parseApiDate(dateStr);
  if (date.getUTCFullYear() < 2000 || Number.isNaN(date.getTime())) return 'Date unavailable';
  return formatUaeDate(dateStr);
}

/** Calculate elapsed minutes since order was placed */
function getElapsedMinutes(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  try {
    const date = parseApiDate(createdAt);
    if (date.getFullYear() < 2000 || isNaN(date.getTime())) return 0;
    return Math.floor((Date.now() - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function OrderProgressTracker({ status, estimatedTime, referenceTime, isDelivery, deliveryStatus, deliveryEtaSeconds, deliveryEtaCalculatedAt, deliveryDistanceKm, riderLocationIsFresh }: { status: string; estimatedTime: string; referenceTime?: string; isDelivery: boolean; deliveryStatus: string | null; deliveryEtaSeconds?: number | null; deliveryEtaCalculatedAt?: string | null; deliveryDistanceKm?: number | null; riderLocationIsFresh?: boolean }) {
  const { t, language } = useTranslation();
  const steps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentStep = isDelivery
    ? getDeliveryStepIndex(status, deliveryStatus)
    : getStepIndex(status, steps);
  const deliveryTravelStage = isDelivery && (
    status === 'ready' ||
    status === 'out_for_delivery' ||
    ['picked_up', 'on_the_way'].includes(String(deliveryStatus || ''))
  );
  
  if (status === 'completed' || status === 'cancelled') return null;
  if (isDelivery && deliveryStatus === 'delivered') return null;

  return (
    <div className="py-4">
      {/* Live countdown. Zero does not mean ready until Kitchen marks it Ready. */}
      {deliveryTravelStage ? (
        deliveryStatus === 'assigned' ? (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 mb-4 flex items-center gap-3">
            <Bike className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-blue-300 font-bold text-sm">
                {language === 'ar' ? 'تم اختيار السائق' : 'Rider selected'}
              </p>
              <p className="text-blue-300/60 text-xs">
                {language === 'ar' ? 'بانتظار قبول السائق للطلب' : 'Waiting for the rider to accept the delivery'}
              </p>
            </div>
          </div>
        ) : deliveryEtaSeconds ? (
          <LiveDeliveryEta
            seconds={deliveryEtaSeconds}
            calculatedAt={deliveryEtaCalculatedAt}
            nearby={riderLocationIsFresh === true && deliveryDistanceKm != null && Number(deliveryDistanceKm) <= 0.5 && ['picked_up', 'on_the_way'].includes(String(deliveryStatus || ''))}
          />
        ) : (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 mb-4 flex items-center gap-3">
            <Navigation className="w-5 h-5 text-blue-400 shrink-0 animate-pulse" />
            <div>
              <p className="text-blue-300 font-bold text-sm">{t('orders.rider_on_the_way')}</p>
              <p className="text-blue-300/60 text-xs">{t('orders.eta_waiting_gps')}</p>
            </div>
          </div>
        )
      ) : (
        <ReadyTimeCountdown
          estimatedTime={estimatedTime}
          referenceTime={referenceTime}
          status={status}
        />
      )}

      {/* Progress Steps */}
      <div className="relative">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx <= currentStep;
          const isCurrent = idx === currentStep;

          return (
            <div key={step.key} className="flex items-start gap-3 relative">
              {idx < steps.length - 1 && (
                <div className={`absolute left-[15px] top-[32px] w-0.5 h-8 ${
                  idx < currentStep ? 'bg-green-500' : 'bg-gray-700'
                }`} />
              )}
              
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              } ${isCurrent ? 'ring-2 ring-green-400/50 ring-offset-2 ring-offset-gray-900' : ''}`}>
                <StepIcon className="w-4 h-4" />
              </div>

              <div className={`pb-6 ${isCurrent ? 'pt-0.5' : 'pt-1'}`}>
                <p className={`text-sm font-medium ${
                  isCompleted ? 'text-white' : 'text-gray-500'
                } ${isCurrent ? 'text-green-400' : ''}`}>
                  {t(step.labelKey)}
                </p>
                {isCurrent && (
                  <p className="text-green-400/60 text-xs mt-0.5">{t('orders.current_status')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeUaeWhatsAppNumber(phone: string): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00971')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`;
  if (!digits.startsWith('971') && digits.length === 9) digits = `971${digits}`;
  return digits;
}

function RiderContactCard({ riderName, riderPhone }: { riderName: string; riderPhone: string }) {
  const { t, language } = useTranslation();
  const waPhone = normalizeUaeWhatsAppNumber(riderPhone);
  const message = encodeURIComponent(language === 'ar' ? `مرحباً ${riderName}، أتواصل معك بخصوص طلب التوصيل من Fai Fai Juice.` : `Hello ${riderName}, I am contacting you about my Fai Fai Juice delivery.`);
  const whatsappUrl = `https://wa.me/${waPhone}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      data-rider-phone={waPhone}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-blue-600/10 border border-blue-600/30 rounded-xl p-4 mb-4 hover:bg-blue-600/15 transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
          <Bike className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-blue-400 font-bold text-sm">{t('orders.your_rider')}</p>
          <p className="text-white font-semibold">{riderName}</p>
          <p className="text-blue-300/70 text-xs">{riderPhone}</p>
        </div>
      </div>
      <div className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 px-3 text-sm font-medium transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {t('orders.whatsapp_rider')}
      </div>
    </a>
  );
}

function LiveDeliveryEta({ seconds, calculatedAt, nearby }: { seconds?: number | null; calculatedAt?: string | null; nearby?: boolean }) {
  const { t, language } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const baseMs = calculatedAt ? new Date(calculatedAt).getTime() : Date.now();
  const deadlineMs = baseMs + Math.max(0, Number(seconds || 0)) * 1000;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [seconds, calculatedAt]);

  if (!seconds || !Number.isFinite(deadlineMs)) return null;
  const remaining = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const nearbyLabel = language === 'ar' ? 'السائق قريب منك' : 'Rider nearby';
  const liveLabel = language === 'ar' ? 'يتم تحديث الوقت من موقع السائق المباشر' : 'Updates from the rider’s live location';

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 mb-4 flex items-center gap-3">
      <Navigation className="w-5 h-5 text-blue-400 shrink-0" />
      <div>
        <p className="text-blue-300 font-bold text-sm">
          {nearby
            ? `${nearbyLabel} · ${minutes}:${String(secs).padStart(2, '0')}`
            : remaining > 0
              ? `${t('orders.rider_arriving_in')} ${minutes}:${String(secs).padStart(2, '0')}`
              : t('orders.rider_arriving_soon')}
        </p>
        <p className="text-blue-300/60 text-xs">{liveLabel}</p>
      </div>
    </div>
  );
}

/** Timer + WhatsApp notification for pending orders */
function OrderTimerNotification({ order, acceptTimeout, expireTimeout, onExpired }: {
  order: OrderWithDelivery;
  acceptTimeout: number;
  expireTimeout: number;
  onExpired: (orderId: number) => void;
}) {
  const { t } = useTranslation();
  const [elapsedMinutes, setElapsedMinutes] = useState(getElapsedMinutes(order.created_at));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const mins = getElapsedMinutes(order.created_at);
      setElapsedMinutes(mins);
      if (mins >= expireTimeout && !expired) {
        setExpired(true);
        onExpired(order.id);
      }
    }, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [order.created_at, expireTimeout, expired, onExpired, order.id]);

  // Only show for 'new' (pending) orders
  if (order.status !== 'new') return null;

  const restaurantPhone = '+971521091092'; // Restaurant WhatsApp number
  const whatsappMessage = encodeURIComponent(
    t('orders.whatsapp_pending_message').replace('{orderId}', String(order.id))
  );
  const whatsappUrl = `https://wa.me/${restaurantPhone.replace('+', '')}?text=${whatsappMessage}`;

  // Show warning after acceptTimeout minutes
  if (elapsedMinutes >= acceptTimeout && elapsedMinutes < expireTimeout) {
    return (
      <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-yellow-400 font-bold text-sm">
              {t('orders.restaurant_not_accepted')}
            </p>
            <p className="text-yellow-400/70 text-xs mt-1">
              {t('orders.elapsed_auto_cancel')
                .replace('{elapsed}', String(elapsedMinutes))
                .replace('{remaining}', String(expireTimeout - elapsedMinutes))}
            </p>
          </div>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 px-4 text-sm font-medium transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {t('orders.whatsapp_restaurant')}
        </a>
      </div>
    );
  }

  // Show expired notification
  if (elapsedMinutes >= expireTimeout || expired) {
    return (
      <div className="bg-red-600/10 border border-red-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-red-400 font-bold text-sm">
              {t('orders.expired_title')}
            </p>
            <p className="text-red-400/70 text-xs mt-1">
              {expireTimeout}+ {t('orders.expired_subtitle')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show waiting timer (before acceptTimeout)
  return (
    <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-3 mb-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 animate-pulse">
        <Clock className="w-5 h-5 text-blue-400" />
      </div>
      <div>
        <p className="text-blue-400 font-bold text-sm">{t('orders.waiting_restaurant')}</p>
        <p className="text-blue-300/70 text-xs">
          {elapsedMinutes} {t('orders.minute_elapsed')} • {t('orders.usually_within')} {acceptTimeout} min
        </p>
      </div>
    </div>
  );
}

function getCancellationInfo(order: OrderWithDelivery): { by: string; reason: string } | null {
  const notes = String(order.order_notes || '');
  const match = notes.match(/Cancelled by\s+(customer|admin|kitchen|rider(?:\s+[^:|]+)?)\s*:\s*([^|]+)/i);
  if (!match) return null;
  const actor = match[1].toLowerCase();
  return {
    by: actor.startsWith('rider ')
      ? `Rider ${match[1].trim().slice(6)}`
      : actor === 'customer'
        ? 'Customer'
        : actor === 'admin'
          ? 'Admin'
          : 'Kitchen',
    reason: match[2].trim(),
  };
}

/** Cancel order confirmation dialog */
function CancelOrderDialog({ orderId, orderStatus, onCancel, onClose }: {
  orderId: number;
  orderStatus: string;
  onCancel: (orderId: number, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const { language } = useTranslation();
  const ar = language === 'ar';
  const reasons = ar
    ? ['غيّرت رأيي', 'تم الطلب بالخطأ', 'الطلب يستغرق وقتاً طويلاً', 'تفاصيل الطلب غير صحيحة', 'أخرى']
    : ['Changed my mind', 'Ordered by mistake', 'Taking too long', 'Wrong order details', 'Other'];
  const otherLabel = ar ? 'أخرى' : 'Other';
  const [preset, setPreset] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const finalReason = preset === otherLabel ? otherReason.trim() : preset.trim();

  async function handleCancel() {
    if (!finalReason) return;
    setCancelling(true);
    try {
      await onCancel(orderId, finalReason);
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-sm w-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-lg">
            {ar ? `إلغاء الطلب #${orderId}` : `Cancel Order #${orderId}`}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-4">
          {ar ? 'اختر سبب الإلغاء. السبب مطلوب.' : 'Select why you are cancelling. A reason is required.'}
        </p>
        <div className="grid grid-cols-1 gap-2 mb-3">
          {reasons.map(reason => (
            <button
              type="button"
              key={reason}
              onClick={() => { setPreset(reason); if (reason !== otherLabel) setOtherReason(''); }}
              className={`rounded-xl border px-3 py-2.5 text-sm text-left ${preset === reason ? 'border-red-500 bg-red-600/15 text-red-300' : 'border-gray-700 bg-gray-800 text-gray-300'}`}
            >
              {reason}
            </button>
          ))}
        </div>
        {preset === otherLabel && (
          <textarea
            value={otherReason}
            onChange={e => setOtherReason(e.target.value)}
            maxLength={300}
            placeholder={ar ? 'اكتب سبب الإلغاء...' : 'Write the cancellation reason...'}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white text-sm resize-none mb-3"
            rows={2}
          />
        )}
        <div className="flex gap-3">
          <Button onClick={onClose} variant="outline" className="flex-1 border-gray-600 text-gray-300 cursor-pointer">
            {ar ? 'الاحتفاظ بالطلب' : 'Keep Order'}
          </Button>
          <Button onClick={() => void handleCancel()} disabled={cancelling || !finalReason} className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer disabled:opacity-50">
            {cancelling ? (ar ? 'جارٍ الإلغاء...' : 'Cancelling...') : (ar ? 'تأكيد الإلغاء' : 'Cancel Order')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface OrderWithDelivery extends Order {
  delivery_status?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_lat?: number | null;
  rider_lng?: number | null;
  delivery_eta_seconds?: number | null;
  delivery_eta_calculated_at?: string | null;
  delivery_distance_km?: number | null;
  rider_location_is_fresh?: boolean;
}

type ReorderDraftItem = {
  key: string;
  sourceName: string;
  menuItem: MenuItem | null;
  size: string;
  extras: Extra[];
  quantity: number;
  unavailableReason?: string;
};

function normalizeReorderSizeKey(value: unknown): string {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 's' || key === 'small') return 'small';
  if (key === 'm' || key === 'medium' || key === 'med') return 'medium';
  if (key === 'l' || key === 'large') return 'large';
  if (key === 'r' || key === 'regular' || key === 'one' || key === 'onesize') return 'regular';
  return key;
}

function hasCurrentOrderablePrice(item: MenuItem | null | undefined): boolean {
  if (!item) return false;
  return getItemSizes(item).some((size) => Number(size.price || 0) > 0);
}

function resolveReorderSize(item: MenuItem, requestedSize: unknown): { name: string; price: number } | null {
  const sizes = getItemSizes(item).filter((size) => Number(size.price || 0) > 0);
  if (sizes.length === 0) return null;

  const requestedKey = normalizeReorderSizeKey(requestedSize);
  if (requestedKey) {
    const match = sizes.find((size) => normalizeReorderSizeKey(size.name) === requestedKey);
    if (match) return { name: String(match.name), price: Number(match.price) };
  }

  // Old orders may store M/Medium differently. If there is only one current
  // valid size, it is safe to use that instead of creating an AED 0 cart line.
  if (sizes.length === 1) {
    return { name: String(sizes[0].name), price: Number(sizes[0].price) };
  }

  // For legacy orders with a missing/renamed size, prefer the first currently
  // saleable size rather than a stale zero-price option. The review popup shows
  // the resolved size before the customer confirms.
  return { name: String(sizes[0].name), price: Number(sizes[0].price) };
}

export default function MyOrders() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const [orders, setOrders] = useState<OrderWithDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewedOrders, setReviewedOrders] = useState<Set<number>>(new Set());
  const [cancelDialogOrder, setCancelDialogOrder] = useState<OrderWithDelivery | null>(null);
  const [reorderOrder, setReorderOrder] = useState<OrderWithDelivery | null>(null);
  const [reorderItems, setReorderItems] = useState<ReorderDraftItem[]>([]);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<
    'checking' | 'login_required' | 'available' | 'enabling' | 'enabled' | 'blocked' | 'unsupported' | 'error'
  >('checking');
  const [notificationMessage, setNotificationMessage] = useState('');

  // Admin-configured timeouts
  const [acceptTimeout, setAcceptTimeout] = useState(5); // minutes
  const [expireTimeout, setExpireTimeout] = useState(15); // minutes
  const [allowCancelPreparing, setAllowCancelPreparing] = useState(false);
  const [allowCancelReady, setAllowCancelReady] = useState(false);

  useEffect(() => {
    void loadInitialData();
    void checkReadyNotifications();
    const interval = setInterval(() => {
      void loadOrders();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  async function checkReadyNotifications() {
    if (!localStorage.getItem('vita_customer_token')) {
      setNotificationStatus('login_required');
      return;
    }
    try {
      const state = await syncCustomerPushIfAllowed();
      if (!state.supported) setNotificationStatus('unsupported');
      else if (state.permission === 'denied') setNotificationStatus('blocked');
      else if (state.permission === 'granted' && state.subscribed) setNotificationStatus('enabled');
      else setNotificationStatus('available');
    } catch (error: any) {
      // A stale browser subscription should not leave the customer trapped on
      // an error card. The Enable button will repair/recreate it on demand.
      setNotificationStatus('available');
      setNotificationMessage(error?.message || 'Could not check notifications');
    }
  }

  async function handleEnableReadyNotifications() {
    if (!localStorage.getItem('vita_customer_token')) {
      navigate('/account');
      return;
    }
    setNotificationStatus('enabling');
    setNotificationMessage('');
    try {
      await enableCustomerPush();
      setNotificationStatus('enabled');
    } catch (error: any) {
      const message = error?.message || 'Could not enable notifications';
      setNotificationMessage(message);
      setNotificationStatus(
        typeof Notification !== 'undefined' && Notification.permission === 'denied'
          ? 'blocked'
          : 'error',
      );
    }
  }

  async function loadInitialData() {
    try {
      await Promise.all([loadOrders(), loadReviewedOrders(), loadSettings()]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
      const items = res?.data?.items || [];
      if (items.length > 0) {
        const s = items[0] as any;
        if (s.order_accept_timeout_minutes) setAcceptTimeout(Number(s.order_accept_timeout_minutes) || 5);
        if (s.order_expire_timeout_minutes) setExpireTimeout(Number(s.order_expire_timeout_minutes) || 15);
        setAllowCancelPreparing(s.allow_cancel_preparing === true);
        setAllowCancelReady(s.allow_cancel_ready === true);
      }
    } catch {
      // Use defaults
    }
  }

  async function loadReviewedOrders() {
    try {
      const res = await client.entities.feedbacks.query({
        query: {},
        limit: 100,
      });
      if (res?.data?.items) {
        const reviewed = new Set<number>(res.data.items.map((f: any) => f.order_id));
        setReviewedOrders(reviewed);
      }
    } catch (e) {
      console.error('Failed to load feedbacks:', e);
    }
  }

  async function loadOrders() {
    try {
      setRefreshing(true);
      const res = await client.apiCall.invoke({
        url: `/api/v1/orders/my-orders?session_id=${encodeURIComponent(getGuestSessionId())}`,
        method: 'GET',
      });
      const baseItems = (res?.data?.items || []) as OrderWithDelivery[];
      const enrichedItems = await Promise.all(
        baseItems.map(async (order) => {
          const delivery = String(order.order_type || '').toLowerCase() === 'delivery' ||
            order.order_notes?.includes('Order Type: Delivery');
          if (!delivery || ['completed', 'cancelled'].includes(order.status)) return order;

          try {
            const etaRes = await client.apiCall.invoke({
              url: `/api/v1/rider/delivery-eta/${order.id}?session_id=${encodeURIComponent(getGuestSessionId())}`,
              method: 'GET',
            });
            const eta = etaRes?.data || {};
            return {
              ...order,
              delivery_status: eta.status === 'no_rider' ? order.delivery_status : eta.status,
              rider_name: eta.rider_name || order.rider_name,
              rider_phone: eta.rider_phone || order.rider_phone,
              rider_lat: eta.rider_lat ?? order.rider_lat,
              rider_lng: eta.rider_lng ?? order.rider_lng,
              delivery_eta_seconds: Number(eta.eta_seconds || 0) || null,
              delivery_eta_calculated_at: eta.calculated_at || null,
              delivery_distance_km: Number(eta.customer_distance_km ?? eta.distance_km) || null,
              rider_location_is_fresh: eta.rider_location_is_fresh === true,
            };
          } catch {
            return order;
          }
        }),
      );
      setOrders(enrichedItems);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setRefreshing(false);
    }
  }

  const handleOrderExpired = useCallback(async (orderId: number) => {
    // Auto-cancel the expired order
    try {
      await client.apiCall.invoke({
        url: `/api/v1/orders/${orderId}/cancel`,
        method: 'POST',
        data: {
          reason: 'Auto-expired: Restaurant did not accept in time',
          session_id: getGuestSessionId(),
        },
      });
      // Reload orders to reflect the change
      await loadOrders();
    } catch (e) {
      console.error('Failed to auto-cancel expired order:', e);
    }
  }, []);

  async function handleCancelOrder(orderId: number, reason: string) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/orders/${orderId}/cancel`,
        method: 'POST',
        data: { reason, session_id: getGuestSessionId() },
      });
      await loadOrders();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.data?.detail || 'Failed to cancel order';
      alert(msg);
      throw e;
    }
  }

  /** Determine if customer can cancel this order */
  function canCancelOrder(order: OrderWithDelivery): boolean {
    if (order.status === 'new') return true; // Always can cancel pending
    if (order.status === 'accepted') return true; // Can cancel before preparing starts
    if (order.status === 'preparing' && allowCancelPreparing) return true;
    if (order.status === 'ready' && allowCancelReady) return true;
    return false;
  }

  /** Order Again - review past items first, then choose quantities before adding to cart. */
  async function handleOrderAgain(order: OrderWithDelivery) {
    setReorderOrder(order);
    setReorderItems([]);
    setReorderLoading(true);

    try {
      let sourceItems: any[] = [];
      try {
        sourceItems = JSON.parse(order.items_json);
      } catch {
        sourceItems = [];
      }

      if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
        setReorderItems([]);
        return;
      }

      const menuResponse = await client.entities.menu_items.query({
        query: { is_active: true },
        sort: 'sort_order',
        limit: 500,
      });
      const menuItems = (menuResponse?.data?.items || []) as MenuItem[];

      const drafts: ReorderDraftItem[] = sourceItems.map((source, index) => {
        const sourceName = String(source?.name || 'Item').trim();
        const sourceId = Number(source?.menu_item_id || source?.menuItem?.id || 0);
        const isDeal = source?.is_deal === true || source?.deal_id;

        if (isDeal) {
          return {
            key: `${order.id}-${index}`,
            sourceName,
            menuItem: null,
            size: String(source?.size || 'Deal'),
            extras: [],
            quantity: 0,
            unavailableReason: language === 'ar' ? 'أعد اختيار العرض من صفحة العروض' : 'Please rebuild this deal from the Deals page',
          };
        }

        const idCandidate = menuItems.find((item) => Number(item.id) === sourceId) || null;
        const sameNameCandidates = menuItems.filter(
          (item) => String(item.name || '').trim().toLowerCase() === sourceName.toLowerCase(),
        );

        // Prefer the original ID only when it still has a real current price.
        // This fixes old duplicate menu rows where the historical ID is still
        // active but contains AED 0 while the current item with the same name
        // has the proper price.
        const menuItem = (hasCurrentOrderablePrice(idCandidate) ? idCandidate : null)
          || sameNameCandidates.find((item) => hasCurrentOrderablePrice(item))
          || idCandidate
          || sameNameCandidates[0]
          || null;

        if (!menuItem) {
          return {
            key: `${order.id}-${index}`,
            sourceName,
            menuItem: null,
            size: String(source?.size || ''),
            extras: [],
            quantity: 0,
            unavailableReason: language === 'ar' ? 'هذا الصنف غير متوفر الآن' : 'This item is not available now',
          };
        }

        const resolvedSize = resolveReorderSize(menuItem, source?.size);
        if (!resolvedSize || resolvedSize.price <= 0) {
          return {
            key: `${order.id}-${index}`,
            sourceName,
            menuItem: null,
            size: String(source?.size || ''),
            extras: [],
            quantity: 0,
            unavailableReason: language === 'ar'
              ? 'السعر الحالي لهذا الصنف غير متوفر'
              : 'Current price for this item is not available',
          };
        }
        const selectedSize = resolvedSize.name;

        const availableExtras = getItemExtras(menuItem, []);
        const oldExtraNames = Array.isArray(source?.extras)
          ? source.extras.map((extra: any) => typeof extra === 'string' ? extra : String(extra?.name || '')).filter(Boolean)
          : [];
        const selectedExtras = availableExtras.filter((extra) =>
          oldExtraNames.some((name: string) => name.trim().toLowerCase() === String(extra.name || '').trim().toLowerCase()),
        );

        return {
          key: `${order.id}-${index}`,
          sourceName,
          menuItem,
          size: selectedSize,
          extras: selectedExtras,
          quantity: Math.max(1, Number(source?.quantity || 1)),
        };
      });

      setReorderItems(drafts);
    } catch (error) {
      console.error('Failed to prepare reorder:', error);
      setReorderItems([]);
    } finally {
      setReorderLoading(false);
    }
  }

  function updateReorderQuantity(key: string, delta: number) {
    setReorderItems((items) => items.map((item) =>
      item.key === key
        ? { ...item, quantity: Math.max(0, Math.min(99, item.quantity + delta)) }
        : item,
    ));
  }

  function confirmOrderAgain() {
    const selected = reorderItems.filter((item) => item.menuItem && item.quantity > 0);
    if (selected.length === 0) return;

    for (const item of selected) {
      addToCart(item.menuItem!, item.size, item.extras, item.quantity);
    }

    window.dispatchEvent(new Event('cart-updated'));
    setReorderOrder(null);
    setReorderItems([]);
    navigate('/cart');
  }

  if (loading) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </div>
      </CustomerLayout>
    );
  }


  function isDeliveryOrder(order: OrderWithDelivery): boolean {
    if (order.delivery_status !== null && order.delivery_status !== undefined) return true;
    return order.order_notes?.includes('Order Type: Delivery') || false;
  }

  function isActiveOrder(order: OrderWithDelivery): boolean {
    if (order.status === 'completed' || order.status === 'cancelled') return false;
    if (isDeliveryOrder(order) && order.delivery_status === 'delivered') return false;
    return true;
  }

  const activeOrders = orders.filter(o => isActiveOrder(o));
  const pastOrders = orders.filter(o => !isActiveOrder(o));

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white text-2xl font-bold">{t('orders.title')}</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadOrders()}
            disabled={refreshing}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className={`rounded-xl border p-4 mb-5 ${
          notificationStatus === 'enabled'
            ? 'border-green-600/30 bg-green-600/10'
            : notificationStatus === 'blocked' || notificationStatus === 'error'
              ? 'border-red-600/30 bg-red-600/10'
              : 'border-gray-700 bg-gray-900'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 ${
              notificationStatus === 'enabled' ? 'bg-green-600/20' : 'bg-gray-800'
            }`}>
              {notificationStatus === 'blocked' || notificationStatus === 'unsupported' ? (
                <BellOff className="w-5 h-5 text-red-400" />
              ) : (
                <Bell className={`w-5 h-5 ${notificationStatus === 'enabled' ? 'text-green-400' : 'text-yellow-400'}`} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">
                {notificationStatus === 'enabled'
                  ? t('orders.notifications_ready_enabled')
                  : notificationStatus === 'blocked'
                    ? t('orders.notifications_blocked')
                    : notificationStatus === 'unsupported'
                      ? t('orders.notifications_unsupported')
                      : t('orders.notifications_get_ready')}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                {notificationStatus === 'enabled'
                  ? t('orders.notifications_enabled_desc')
                  : notificationStatus === 'blocked'
                    ? t('orders.notifications_blocked_desc')
                    : notificationMessage || t('orders.notifications_enable_desc')}
              </p>
              {!['enabled', 'blocked', 'unsupported', 'checking'].includes(notificationStatus) && (
                <Button
                  onClick={handleEnableReadyNotifications}
                  disabled={notificationStatus === 'enabling'}
                  size="sm"
                  className="mt-3 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  {notificationStatus === 'login_required'
                    ? t('orders.notifications_login')
                    : notificationStatus === 'enabling'
                      ? t('orders.notifications_enabling')
                      : t('orders.notifications_enable')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🥤</div>
            <p className="text-gray-400 text-lg font-medium">{t('orders.no_orders')}</p>
            <p className="text-gray-600 text-sm mt-2">{t('orders.no_orders_subtitle')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Orders */}
            {activeOrders.length > 0 && (
              <div>
                <h2 className="text-green-400 font-semibold text-sm uppercase tracking-wider mb-3">{t('orders.active_orders')}</h2>
                <div className="space-y-4">
                  {activeOrders.map(order => {
                    let items: any[] = [];
                    try { items = JSON.parse(order.items_json); } catch { /* */ }
                    const isDelivery = isDeliveryOrder(order);
                    const showRiderContact = isDelivery && order.rider_name && order.rider_phone &&
                      !['rejected', 'delivered'].includes(String(order.delivery_status || ''));

                    return (
                      <Card key={order.id} className="bg-gray-900 border-green-600/20 border p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-lg">{t('orders.order')} #{order.id}</span>
                            {isDelivery && (
                              <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs">
                                <Bike className="w-3 h-3 mr-1" /> {t('orders.delivery')}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col items-end">
                            {order.delivery_charge > 0 && (
                              <span className="text-[10px] text-gray-400">{t('orders.delivery_charge')}: {t('common.aed')} {order.delivery_charge?.toFixed(2)}</span>
                            )}
                            {order.tip_amount > 0 && (
                              <span className="text-[10px] text-green-400">{t('orders.tip')}: {t('common.aed')} {order.tip_amount?.toFixed(2)}</span>
                            )}
                            <span className="text-red-400 font-bold">{t('common.aed')} {order.total_amount?.toFixed(2)}</span>
                          </div>
                        </div>
                        <p className="text-gray-500 text-xs mb-3">
                          {formatDate(order.created_at)}
                        </p>

                        {/* Order Timer + WhatsApp Notification */}
                        <OrderTimerNotification
                          order={order}
                          acceptTimeout={acceptTimeout}
                          expireTimeout={expireTimeout}
                          onExpired={handleOrderExpired}
                        />

                        {/* Rider Contact Card - shown after pickup */}
                        {showRiderContact && (
                          <RiderContactCard
                            riderName={order.rider_name!}
                            riderPhone={order.rider_phone!}
                          />
                        )}

                        {/* Track Live Button for delivery orders */}
                        {isDelivery && order.delivery_status && order.delivery_status !== 'delivered' && (
                          <Button
                            onClick={() => navigate(`/track/${order.id}`)}
                            className="w-full mb-3 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                            size="sm"
                          >
                            <Navigation className="w-4 h-4 mr-2" />
                            {order.rider_lat != null && order.rider_lng != null
                              ? t('orders.track_rider_live')
                              : t('orders.open_rider_tracking')}
                          </Button>
                        )}

                        {/* Progress tracker */}
                        <OrderProgressTracker
                          status={order.status}
                          estimatedTime={order.estimated_time}
                          referenceTime={order.updated_at || order.created_at}
                          isDelivery={isDelivery}
                          deliveryStatus={order.delivery_status || null}
                          deliveryEtaSeconds={order.delivery_eta_seconds}
                          deliveryEtaCalculatedAt={order.delivery_eta_calculated_at}
                          deliveryDistanceKm={order.delivery_distance_km}
                          riderLocationIsFresh={order.rider_location_is_fresh}
                        />

                        {/* Items */}
                        <div className="border-t border-gray-800 pt-3">
                          <p className="text-gray-500 text-xs uppercase mb-2">{t('orders.items')}</p>
                          {items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-sm py-0.5">
                              <span className="text-gray-300">{item.quantity}x {item.name} ({item.size})</span>
                              <span className="text-gray-400">AED {item.price?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Cancel Button */}
                        {canCancelOrder(order) && (
                          <div className="mt-3 pt-3 border-t border-gray-800">
                            <Button
                              onClick={() => setCancelDialogOrder(order)}
                              variant="outline"
                              size="sm"
                              className="border-red-600/50 text-red-400 hover:bg-red-600/10 hover:text-red-300 cursor-pointer w-full"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              {t('orders.cancel_order')}
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Past Orders */}
            {pastOrders.length > 0 && (
              <div>
                <h2 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-3">{t('orders.past_orders')}</h2>
                <div className="space-y-3">
                  {pastOrders.map(order => {
                    let items: any[] = [];
                    try { items = JSON.parse(order.items_json); } catch { /* */ }
                    const hasReviewed = reviewedOrders.has(order.id);

                    return (
                      <Card key={order.id} className="bg-gray-900/50 border-gray-800 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-300 font-medium">#{order.id}</span>
                            <Badge className={`${order.status === 'completed' || order.delivery_status === 'delivered' ? 'bg-gray-700' : 'bg-red-600/20 text-red-400 border border-red-600/30'} text-xs`}>
                              {order.status === 'completed' || order.delivery_status === 'delivered' ? (
                                <><CheckCircle className="w-3 h-3 mr-1" /> {t('orders.status.completed')}</>
                              ) : (
                                <><XCircle className="w-3 h-3 mr-1" /> {t('orders.status.cancelled')}</>
                              )}
                            </Badge>
                          </div>
                          <div className="flex flex-col items-end">
                            {order.delivery_charge > 0 && (
                              <span className="text-[10px] text-gray-500">{t('orders.delivery_charge')}: {t('common.aed')} {order.delivery_charge?.toFixed(2)}</span>
                            )}
                            {order.tip_amount > 0 && (
                              <span className="text-[10px] text-green-500">{t('orders.tip')}: {t('common.aed')} {order.tip_amount?.toFixed(2)}</span>
                            )}
                            <span className="text-gray-400 font-medium">{t('common.aed')} {order.total_amount?.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-gray-600 text-xs">
                            {formatDateShort(order.created_at)} • {items.length} {items.length === 1 ? t('orders.item_singular') : t('orders.item_plural')}
                          </p>
                          {(order.status === 'completed' || order.delivery_status === 'delivered') && (
                            hasReviewed ? (
                              <span className="text-green-500 text-xs flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> {t('orders.reviewed')}
                              </span>
                            ) : (
                              <button
                                onClick={() => navigate(`/feedback?order=${order.id}`)}
                                className="text-yellow-400 text-xs flex items-center gap-1 hover:text-yellow-300 cursor-pointer"
                              >
                                <MessageSquare className="w-3 h-3" /> {t('orders.give_feedback')}
                              </button>
                            )
                          )}
                        </div>
                        {order.status === 'cancelled' && getCancellationInfo(order) && (
                          <div className="mt-3 rounded-xl border border-red-600/25 bg-red-600/10 px-3 py-2">
                            <p className="text-red-300 text-xs font-semibold">
                              {language === 'ar' ? 'تم الإلغاء بواسطة' : 'Cancelled by'}: {getCancellationInfo(order)!.by}
                            </p>
                            <p className="text-gray-300 text-sm mt-1">
                              {language === 'ar' ? 'السبب' : 'Reason'}: {getCancellationInfo(order)!.reason}
                            </p>
                          </div>
                        )}

                        {/* Order Again button for completed orders */}
                        {(order.status === 'completed' || order.delivery_status === 'delivered') && (
                          <div className="mt-3 pt-3 border-t border-gray-800">
                            <Button
                              onClick={() => handleOrderAgain(order)}
                              size="sm"
                              className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                            >
                              <ShoppingCart className="w-4 h-4 mr-2" /> {t('orders.order_again')}
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Again review: customer chooses which old items/quantities to add. */}
        {reorderOrder && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-gray-950 border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-white text-xl font-bold">
                    {language === 'ar' ? `إعادة الطلب #${reorderOrder.id}` : `Order Again #${reorderOrder.id}`}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {language === 'ar' ? 'اختر الأصناف والكمية قبل إضافتها إلى السلة' : 'Choose the items and quantity before adding to cart'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setReorderOrder(null); setReorderItems([]); }}
                  className="w-10 h-10 rounded-full bg-gray-900 text-gray-400 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {reorderLoading ? (
                <div className="py-10 text-center text-gray-400">
                  {language === 'ar' ? 'جارٍ تحميل الأصناف...' : 'Loading current menu items...'}
                </div>
              ) : reorderItems.length === 0 ? (
                <div className="py-10 text-center text-gray-500">
                  {language === 'ar' ? 'لا توجد أصناف متاحة لإعادة الطلب' : 'No items available to reorder'}
                </div>
              ) : (
                <div className="space-y-3">
                  {reorderItems.map((item) => (
                    <div key={item.key} className={`rounded-2xl border p-4 ${item.menuItem ? 'border-gray-800 bg-gray-900' : 'border-red-900/50 bg-red-950/20'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate">{item.sourceName}</p>
                          {item.size && <p className="text-gray-500 text-xs mt-1">{item.size}</p>}
                          {item.extras.length > 0 && (
                            <p className="text-gray-500 text-xs mt-1">
                              {language === 'ar' ? 'إضافات' : 'Extras'}: {item.extras.map((extra) => extra.name).join(', ')}
                            </p>
                          )}
                          {item.unavailableReason && <p className="text-red-400 text-xs mt-2">{item.unavailableReason}</p>}
                        </div>

                        {item.menuItem && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateReorderQuantity(item.key, -1)}
                              className="w-9 h-9 rounded-full bg-gray-800 text-white flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-7 text-center text-white font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateReorderQuantity(item.key, 1)}
                              className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={confirmOrderAgain}
                disabled={reorderLoading || !reorderItems.some((item) => item.menuItem && item.quantity > 0)}
                className="w-full mt-5 h-12 bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {language === 'ar' ? 'إضافة المحدد إلى السلة' : 'Add Selected to Cart'}
              </Button>
            </div>
          </div>
        )}

        {/* Cancel Dialog */}
        {cancelDialogOrder && (
          <CancelOrderDialog
            orderId={cancelDialogOrder.id}
            orderStatus={cancelDialogOrder.status}
            onCancel={handleCancelOrder}
            onClose={() => setCancelDialogOrder(null)}
          />
        )}
      </div>
    </CustomerLayout>
  );
}
