import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  CheckCircle,
  Clock,
  Navigation,
  Package,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface ETAData {
  status: string;
  eta_minutes: number | null;
  eta_seconds?: number | null;
  calculated_at?: string | null;
  distance_km?: number | null;
  customer_distance_km?: number | null;
  distance_to_shop_km?: number | null;
  rider_name: string | null;
  rider_phone: string | null;
  rider_lat: number | null;
  rider_lng: number | null;
  rider_is_online?: boolean;
  rider_location_is_fresh?: boolean;
  rider_location_age_seconds?: number | null;
  rider_location_updated_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
}

const COPY = {
  en: {
    loading: 'Loading tracking info...',
    loadError: 'Could not load tracking info',
    loginAgain: 'Please login again to view this order.',
    backOrders: 'Back to Orders',
    trackOrder: 'Track Order',
    liveTracking: 'Live delivery tracking',
    preparingTitle: 'Preparing Your Order',
    preparingText: 'A rider will be assigned shortly. Check back soon!',
    waitingPickupTitle: 'Live tracking starts after pickup',
    waitingPickupText: 'Kitchen is preparing your order. Rider location stays private until the rider picks it up.',
    deliveredTitle: 'Order Delivered!',
    deliveredText: 'Enjoy your order 🥤',
    cancelledTitle: 'Order Cancelled',
    cancelledBy: 'Cancelled by',
    cancellationReason: 'Reason',
    estimatedArrival: 'Estimated Arrival',
    arrivingSoon: 'Arriving soon',
    etaUpdating: 'ETA updating',
    liveRiderEta: 'Live rider ETA',
    nearby: 'Rider nearby',
    waitingGps: 'Waiting for fresh rider GPS',
    whatsapp: 'Tap to WhatsApp rider',
    gpsWaiting:
      'Rider live location is waiting for GPS. The Rider app must stay signed in with location permission enabled.',
    progress: 'Delivery Progress',
    autoRefresh: 'Auto-refreshing every 10 seconds',
    assigned: 'Order Assigned',
    assignedDesc: 'Rider is preparing to pick up',
    pickedUp: 'Picked Up',
    pickedUpDesc: 'Rider has your order',
    onWay: 'On the Way',
    onWayDesc: 'Rider is heading to you',
    delivered: 'Delivered',
    deliveredDesc: 'Order delivered!',
  },
  ar: {
    loading: 'جارٍ تحميل معلومات التتبع...',
    loadError: 'تعذر تحميل معلومات التتبع',
    loginAgain: 'يرجى تسجيل الدخول مرة أخرى لعرض هذا الطلب.',
    backOrders: 'العودة إلى الطلبات',
    trackOrder: 'تتبع الطلب',
    liveTracking: 'تتبع التوصيل المباشر',
    preparingTitle: 'جارٍ تجهيز طلبك',
    preparingText: 'سيتم تعيين سائق لطلبك قريباً. يرجى التحقق بعد قليل.',
    waitingPickupTitle: 'يبدأ التتبع المباشر بعد استلام السائق',
    waitingPickupText: 'المطبخ يجهز طلبك. لن يظهر موقع السائق للعميل قبل استلام الطلب.',
    deliveredTitle: 'تم توصيل الطلب!',
    deliveredText: 'نتمنى لك تجربة ممتعة 🥤',
    cancelledTitle: 'تم إلغاء الطلب',
    cancelledBy: 'تم الإلغاء بواسطة',
    cancellationReason: 'السبب',
    estimatedArrival: 'الوقت المتوقع للوصول',
    arrivingSoon: 'سيصل قريباً',
    etaUpdating: 'جارٍ تحديث وقت الوصول',
    liveRiderEta: 'وقت الوصول المباشر للسائق',
    nearby: 'السائق قريب منك',
    waitingGps: 'بانتظار موقع GPS الجديد للسائق',
    whatsapp: 'اضغط للتواصل مع السائق عبر واتساب',
    gpsWaiting:
      'بانتظار الموقع المباشر للسائق. يجب أن يبقى تطبيق السائق مسجلاً مع تفعيل إذن الموقع.',
    progress: 'تقدم التوصيل',
    autoRefresh: 'يتم التحديث تلقائياً كل 10 ثوانٍ',
    assigned: 'تم تعيين السائق',
    assignedDesc: 'السائق يستعد لاستلام الطلب',
    pickedUp: 'تم استلام الطلب',
    pickedUpDesc: 'الطلب الآن مع السائق',
    onWay: 'السائق في الطريق',
    onWayDesc: 'السائق متجه إليك الآن',
    delivered: 'تم التوصيل',
    deliveredDesc: 'تم توصيل الطلب بنجاح!',
  },
} as const;

export default function DeliveryTracking() {
  const { language, dir } = useTranslation();
  const c = language === 'ar' ? COPY.ar : COPY.en;
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [eta, setEta] = useState<ETAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const riderMarkerRef = useRef<L.Marker | null>(null);

  const statusSteps = [
    {
      key: 'assigned',
      label: c.assigned,
      icon: Package,
      description: c.assignedDesc,
    },
    {
      key: 'picked_up',
      label: c.pickedUp,
      icon: Bike,
      description: c.pickedUpDesc,
    },
    {
      key: 'on_the_way',
      label: c.onWay,
      icon: Navigation,
      description: c.onWayDesc,
    },
    {
      key: 'delivered',
      label: c.delivered,
      icon: CheckCircle,
      description: c.deliveredDesc,
    },
  ];

  useEffect(() => {
    if (!orderId) return;

    void loadETA();
    const interval = window.setInterval(() => {
      void loadETA();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [orderId]);

  useEffect(() => {
    const freshEnough = eta?.rider_location_is_fresh !== false;
    const hasCoords =
      eta?.rider_lat != null &&
      eta?.rider_lng != null &&
      freshEnough;

    if (hasCoords) {
      updateMap(Number(eta.rider_lat), Number(eta.rider_lng));
      return;
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      riderMarkerRef.current = null;
    }
  }, [eta]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        riderMarkerRef.current = null;
      }
    };
  }, []);

  async function loadETA() {
    try {
      /*
       * IMPORTANT:
       * Use the same authenticated API client as My Orders.
       * Direct axios here was bypassing the customer session/auth handling,
       * which can make the tracking endpoint fail after privacy protection.
       */
      const response = await client.apiCall.invoke({
        url: `/api/v1/rider/delivery-eta/${orderId}`,
        method: 'GET',
      });

      const data = response?.data as ETAData | undefined;

      if (data) {
        setEta(data);
        setError('');
      } else {
        setError(c.loadError);
      }
    } catch (error: any) {
      const status =
        error?.response?.status ||
        error?.status ||
        error?.data?.status;

      setError(status === 401 || status === 403 ? c.loginAgain : c.loadError);
    } finally {
      setLoading(false);
    }
  }

  function updateMap(lat: number, lng: number) {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([lat, lng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);

      mapInstanceRef.current = map;

      const riderIcon = L.divIcon({
        html:
          '<div style="background:#16a34a;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.35)"><span style="font-size:18px">🏍️</span></div>',
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      riderMarkerRef.current = L.marker([lat, lng], {
        icon: riderIcon,
      }).addTo(map);

      window.setTimeout(() => {
        map.invalidateSize();
      }, 100);
    } else {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setLatLng([lat, lng]);
      }

      mapInstanceRef.current.panTo([lat, lng]);
    }
  }

  function getStatusIndex(status: string): number {
    const normalized = status === 'accepted' ? 'assigned' : status;
    return statusSteps.findIndex((step) => step.key === normalized);
  }

  if (loading) {
    return (
      <div
        dir={dir}
        className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
      >
        <div className="text-gray-400">{c.loading}</div>
      </div>
    );
  }

  if (error && !eta) {
    return (
      <div
        dir={dir}
        className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
      >
        <div className="text-center">
          <p className="text-gray-400 mb-4">{error}</p>
          <Button
            onClick={() => navigate('/my-orders')}
            className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
          >
            {c.backOrders}
          </Button>
        </div>
      </div>
    );
  }

  const currentStatusIndex = eta ? getStatusIndex(eta.status) : -1;

  const etaBaseMs =
    eta?.calculated_at && !Number.isNaN(new Date(eta.calculated_at).getTime())
      ? new Date(eta.calculated_at).getTime()
      : now;

  const etaSecondsValue = Number(eta?.eta_seconds || 0);
  const etaMinutesValue = Number(eta?.eta_minutes || 0);
  const etaDurationMs =
    etaSecondsValue > 0
      ? etaSecondsValue * 1000
      : etaMinutesValue > 0
        ? etaMinutesValue * 60_000
        : 0;

  const etaDeadlineMs = etaBaseMs + etaDurationMs;
  const remainingEtaSeconds =
    etaDurationMs > 0
      ? Math.max(0, Math.floor((etaDeadlineMs - now) / 1000))
      : 0;

  const etaClock = `${Math.floor(remainingEtaSeconds / 60)}:${String(
    remainingEtaSeconds % 60,
  ).padStart(2, '0')}`;

  const trackingStarted = ['picked_up', 'on_the_way'].includes(String(eta?.status || ''));
  const hasLiveCoords =
    trackingStarted &&
    eta?.rider_lat != null &&
    eta?.rider_lng != null &&
    eta?.rider_location_is_fresh === true;
  const isRiderNearby =
    eta?.rider_location_is_fresh === true &&
    eta?.customer_distance_km != null &&
    Number(eta.customer_distance_km) <= 0.5 &&
    ['picked_up', 'on_the_way'].includes(String(eta.status || ''));

  return (
    <div dir={dir} className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/my-orders')}
            className="text-gray-400 cursor-pointer p-2"
          >
            <ArrowLeft
              className={`w-5 h-5 ${language === 'ar' ? 'rotate-180' : ''}`}
            />
          </Button>

          <div className={language === 'ar' ? 'text-right' : 'text-left'}>
            <h1 className="text-white text-xl font-bold">
              {c.trackOrder} #{orderId}
            </h1>
            <p className="text-gray-500 text-sm">{c.liveTracking}</p>
          </div>
        </div>

        {eta?.status === 'no_rider' && (
          <Card className="bg-gray-900 border-gray-800 p-6 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h2 className="text-white font-semibold mb-1">
              {c.preparingTitle}
            </h2>
            <p className="text-gray-500 text-sm">{c.preparingText}</p>
          </Card>
        )}

        {eta?.status === 'cancelled' && (
          <Card className="bg-red-600/10 border-red-600/30 p-6 text-center">
            <div className="text-red-400 text-4xl mb-3">✕</div>
            <h2 className="text-red-400 font-semibold text-lg mb-2">{c.cancelledTitle}</h2>
            {eta.cancelled_by && (
              <p className="text-red-300 text-sm">{c.cancelledBy}: {eta.cancelled_by}</p>
            )}
            {eta.cancellation_reason && (
              <p className="text-gray-300 text-sm mt-1">{c.cancellationReason}: {eta.cancellation_reason}</p>
            )}
          </Card>
        )}

        {eta?.status === 'delivered' && (
          <Card className="bg-green-600/10 border-green-600/30 p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h2 className="text-green-400 font-semibold text-lg mb-1">
              {c.deliveredTitle}
            </h2>
            <p className="text-green-400/70 text-sm">{c.deliveredText}</p>
          </Card>
        )}

        {eta && eta.status !== 'no_rider' && eta.status !== 'delivered' && eta.status !== 'cancelled' && (
          <>
            {trackingStarted ? (
              <Card className="bg-gray-900 border-gray-800 p-5 mb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className={language === 'ar' ? 'text-right' : 'text-left'}>
                    <p className="text-gray-500 text-xs uppercase tracking-wider">
                      {c.estimatedArrival}
                    </p>

                    <p className="text-white text-3xl font-bold mt-1">
                      {etaDurationMs > 0
                        ? isRiderNearby
                          ? `${c.nearby} · ${etaClock}`
                          : remainingEtaSeconds > 0
                            ? etaClock
                            : c.arrivingSoon
                        : c.etaUpdating}
                    </p>

                    <p className="text-blue-400/70 text-xs mt-1">
                      {etaDurationMs > 0 ? c.liveRiderEta : c.waitingGps}
                    </p>
                  </div>

                  <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center shrink-0">
                    <Clock className="w-8 h-8 text-green-400" />
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="bg-blue-600/10 border-blue-600/30 p-5 mb-4">
                <div className="flex items-center gap-3">
                  <Package className="w-8 h-8 text-blue-400 shrink-0" />
                  <div className={language === 'ar' ? 'text-right' : 'text-left'}>
                    <p className="text-blue-300 font-bold">{c.waitingPickupTitle}</p>
                    <p className="text-blue-300/70 text-sm mt-1">{c.waitingPickupText}</p>
                  </div>
                </div>
              </Card>
            )}

            {eta.rider_name &&
              (() => {
                let waPhone = String(eta.rider_phone || '').replace(/\D/g, '');

                if (waPhone.startsWith('0')) {
                  waPhone = `971${waPhone.slice(1)}`;
                }

                if (waPhone.length <= 10 && !waPhone.startsWith('971')) {
                  waPhone = `971${waPhone}`;
                }

                return (
                  <a
                    href={waPhone ? `https://wa.me/${waPhone}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-4"
                  >
                    <Card className="bg-gray-900 border-gray-800 p-4 hover:border-emerald-600/50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center shrink-0">
                            <Bike className="w-5 h-5 text-white" />
                          </div>

                          <div
                            className={
                              language === 'ar' ? 'text-right' : 'text-left'
                            }
                          >
                            <p className="text-white font-semibold">
                              {eta.rider_name}
                            </p>
                            <p className="text-emerald-400 text-xs">
                              {c.whatsapp}
                            </p>
                          </div>
                        </div>

                        <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                          WA
                        </div>
                      </div>
                    </Card>
                  </a>
                );
              })()}

            {hasLiveCoords && (
              <div
                ref={mapContainerRef}
                className="w-full h-[280px] rounded-xl overflow-hidden border border-gray-700 mb-4"
                style={{ zIndex: 1 }}
              />
            )}

            {trackingStarted && eta.rider_name && !hasLiveCoords && (
              <Card className="bg-amber-950/30 border-amber-700/40 p-4 mb-4 text-amber-300 text-sm">
                {c.gpsWaiting}
              </Card>
            )}

            <Card className="bg-gray-900 border-gray-800 p-4">
              <h3
                className={`text-white font-semibold mb-4 ${
                  language === 'ar' ? 'text-right' : 'text-left'
                }`}
              >
                {c.progress}
              </h3>

              <div className="space-y-4">
                {statusSteps.map((step, index) => {
                  const isCompleted = index <= currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const StepIcon = step.icon;

                  return (
                    <div
                      key={step.key}
                      className={`flex items-start gap-3 ${
                        language === 'ar' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isCompleted
                              ? 'bg-green-600'
                              : 'bg-gray-800 border border-gray-700'
                          } ${
                            isCurrent
                              ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900'
                              : ''
                          }`}
                        >
                          <StepIcon
                            className={`w-4 h-4 ${
                              isCompleted ? 'text-white' : 'text-gray-500'
                            }`}
                          />
                        </div>

                        {index < statusSteps.length - 1 && (
                          <div
                            className={`w-0.5 h-6 mt-1 ${
                              isCompleted ? 'bg-green-600' : 'bg-gray-700'
                            }`}
                          />
                        )}
                      </div>

                      <div
                        className={`pt-1 flex-1 ${
                          language === 'ar' ? 'text-right' : 'text-left'
                        }`}
                      >
                        <p
                          className={`text-sm font-medium ${
                            isCompleted ? 'text-white' : 'text-gray-500'
                          }`}
                        >
                          {step.label}
                        </p>

                        {isCurrent && (
                          <p className="text-gray-500 text-xs mt-0.5">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        <p className="text-center text-gray-600 text-xs mt-4">
          {c.autoRefresh}
        </p>
      </div>
    </div>
  );
}
