import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bike, MapPin, Phone, Package, CheckCircle, Navigation, LogOut, RefreshCw, Bell, BellOff, Clock, DollarSign, CreditCard, Banknote, Wallet, Send, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getAPIBaseURL } from '@/lib/config';
import { formatUaeDateTime, formatUaeTime } from '@/lib/uae-time';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';



type RiderApiOptions = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
};

function riderApi(options: RiderApiOptions) {
  const token = localStorage.getItem('rider_access_token') || '';
  return axios.request({
    url: `${getAPIBaseURL().replace(/\/$/, '')}${options.url}`,
    method: options.method,
    data: options.data,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    timeout: 25000,
  });
}

// Fix leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Delivery {
  id: number;
  order_id: number;
  status: string;
  customer_lat: number | null;
  customer_lng: number | null;
  customer_address: string;
  customer_name: string;
  customer_phone: string;
  order_total: number;
  order_items: string;
  order_status: string;
  delivery_charge: number;
  distance_km: number | null;
  zone_name: string | null;
  tip_amount: number;
  created_at: string;
}

interface Rider {
  id: number;
  name: string;
  phone: string;
}

interface RiderStats {
  today_deliveries: number;
  week_deliveries: number;
  month_deliveries: number;
  total_deliveries: number;
  total_earnings: number;
  delivery_charges_earned: number;
  today_delivery_earnings: number;
  week_delivery_earnings: number;
  month_delivery_earnings: number;
  tips_earned: number;
  today_tips: number;
  week_tips: number;
  month_tips: number;
  cash_collected: number;
  card_orders: number;
  pending_orders: number;
  completed_orders: number;
}


type FinancePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all' | 'custom';

interface FinanceTotals {
  delivered_orders: number;
  customer_total: number;
  food_subtotal: number;
  discount_amount: number;
  shop_food_sale: number;
  service_fee: number;
  small_order_fee: number;
  developer_fees: number;
  delivery_charges: number;
  rider_tips: number;
  shop_tips: number;
  rider_earnings: number;
  cash_collected: number;
  cash_payable_to_shop: number;
  cash_orders: number;
  card_orders: number;
}

interface FinanceSettlementTotals {
  approved_cash: number;
  awaiting_approval: number;
  rejected_cash: number;
  submissions: number;
}

interface FinanceCurrentBalance {
  cash_due_to_shop: number;
  approved_cash: number;
  awaiting_approval: number;
  remaining_to_submit: number;
  total_pending_cash: number;
  rider_earnings_total: number;
  rider_paid_total: number;
  rider_remaining_to_receive: number;
}

interface FinancePayoutTotals {
  paid_to_rider: number;
  payments: number;
}

interface RiderFinanceSummary {
  rider: Rider;
  period: {
    key: FinancePeriod;
    label: string;
    date_from: string | null;
    date_to: string | null;
  };
  totals: FinanceTotals;
  settlements: FinanceSettlementTotals;
  payouts: FinancePayoutTotals;
  current_balance: FinanceCurrentBalance;
}

interface CashSubmission {
  id: number;
  rider_id: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  rider_note: string;
  admin_note: string;
  reviewed_by: string;
  submitted_at: string | null;
  reviewed_at: string | null;
}

const RIDER_FINANCE_PERIODS: Array<{ key: FinancePeriod; label: string; short: string }> = [
  { key: 'today', label: 'Today', short: 'Today' },
  { key: 'yesterday', label: 'Yesterday', short: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days', short: '7 Days' },
  { key: 'month', label: 'Last 30 Days', short: '30 Days' },
  { key: 'year', label: 'This Year', short: 'Year' },
  { key: 'all', label: 'All Time', short: 'All Time' },
  { key: 'custom', label: 'Custom Date', short: 'Custom' },
];

function formatFinanceDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dubai',
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

export default function RiderPanel() {
  const browserNotificationsSupported =
    typeof window !== 'undefined' && 'Notification' in window;
  const [rider, setRider] = useState<Rider | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<RiderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [activeTab, setActiveTab] = useState<'orders' | 'stats'>('orders');
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>('today');
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [financeSummary, setFinanceSummary] = useState<RiderFinanceSummary | null>(null);
  const [cashSubmissions, setCashSubmissions] = useState<CashSubmission[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const prevDeliveryIdsRef = useRef<number[]>([]);
  const ringTimerRef = useRef<number | null>(null);
  const ringSuppressedRef = useRef<Set<number>>(new Set());
  const [rejectDelivery, setRejectDelivery] = useState<Delivery | null>(null);
  const [rejectPreset, setRejectPreset] = useState('');
  const [rejectOtherReason, setRejectOtherReason] = useState('');
  const [gpsState, setGpsState] = useState<'checking' | 'live' | 'denied' | 'error' | 'unsupported'>('checking');
  const [gpsUpdatedAt, setGpsUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const savedRider = localStorage.getItem('rider_auth');
    const savedToken = localStorage.getItem('rider_access_token');
    if (savedRider && savedToken) {
      try {
        const parsed = JSON.parse(savedRider);
        setRider(parsed);
        loadDeliveries(parsed.id);
        loadStats(parsed.id);
        loadFinance(parsed.id, 'today');
        loadCashSubmissions(parsed.id);
      } catch { /* ignore */ }
    } else if (savedRider && !savedToken) {
      // One-time re-login after secure rider sessions are introduced.
      localStorage.removeItem('rider_auth');
      localStorage.removeItem('rider_access_token');
    }
    if (browserNotificationsSupported) {
      setNotificationPermission(Notification.permission);
      setNotificationsEnabled(
        Notification.permission === 'granted' &&
        localStorage.getItem('rider_notifications') !== 'off'
      );
    } else {
      // Android WebView / browsers without Notification API:
      // keep reliable in-app rider alerts instead of showing an error.
      setNotificationsEnabled(localStorage.getItem('rider_notifications') !== 'off');
    }
  }, []);

  useEffect(() => {
    if (!rider) return;
    registerServiceWorker();
  }, [rider]);

  useEffect(() => {
    if (!rider) return;
    const interval = setInterval(() => {
      loadDeliveries(rider.id);
      loadStats(rider.id);
      loadFinance(rider.id, financePeriod);
      loadCashSubmissions(rider.id);
    }, 8000);
    return () => clearInterval(interval);
  }, [rider, financePeriod]);

  useEffect(() => {
    if (!rider || financePeriod === 'custom') return;
    loadFinance(rider.id, financePeriod);
  }, [financePeriod, rider]);

  // Keep Admin presence fresh while the Rider app is open, and refresh
  // immediately whenever the app returns from background. watchPosition is
  // more reliable than repeatedly asking for one-shot GPS while foregrounded.
  useEffect(() => {
    if (!rider) return;

    let watchId: number | null = null;
    let lastLocationSentAt = 0;

    const handleAuthError = (error: any) => {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        handleRiderAuthFailure('Rider login required. Please login once again.');
      }
    };

    const sendHeartbeat = () => {
      riderApi({
        url: `/api/v1/rider/heartbeat/${rider.id}`,
        method: 'POST',
        data: {},
      }).catch(handleAuthError);
    };

    const sendCoords = (lat: number, lng: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastLocationSentAt < 10000) return;
      lastLocationSentAt = now;
      riderApi({
        url: `/api/v1/rider/location/${rider.id}`,
        method: 'POST',
        data: { lat, lng },
      }).then(() => {
        setGpsState('live');
        setGpsUpdatedAt(new Date());
      }).catch((error) => {
        setGpsState('error');
        handleAuthError(error);
      });
    };

    const requestFreshLocation = () => {
      if (!navigator.geolocation) {
        setGpsState('unsupported');
        return;
      }
      setGpsState(current => current === 'live' ? current : 'checking');
      navigator.geolocation.getCurrentPosition(
        (pos) => sendCoords(pos.coords.latitude, pos.coords.longitude, true),
        (error) => {
          setGpsState(error.code === 1 ? 'denied' : 'error');
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
      );
    };

    const syncPresenceNow = () => {
      sendHeartbeat();
      requestFreshLocation();
    };

    syncPresenceNow();
    const heartbeatInterval = window.setInterval(sendHeartbeat, 15000);
    // watchPosition may stay silent while a rider is stationary. Force a fresh
    // one-shot GPS update every 30 seconds so Admin/customer tracking does not
    // incorrectly age an open Rider app into "GPS outdated".
    const gpsRefreshInterval = window.setInterval(requestFreshLocation, 30000);

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => sendCoords(pos.coords.latitude, pos.coords.longitude),
        (error) => setGpsState(error.code === 1 ? 'denied' : 'error'),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
      );
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncPresenceNow();
    };
    const onResume = () => syncPresenceNow();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);

    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearInterval(gpsRefreshInterval);
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
    };
  }, [rider]);

  useEffect(() => {
    if (rider && deliveries.length > 0 && activeTab === 'orders') {
      updateMap();
    }
  }, [deliveries, activeTab]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'DELIVERIES_UPDATE') {
        const items = event.data.data?.items || [];
        setDeliveries(items);
        setLastRefresh(new Date());
      }
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, []);

  useEffect(() => {
    if (!rider || deliveries.length === 0) return;
    const activeIds = deliveries.filter(d => !['delivered', 'rejected'].includes(String(d.status || '').toLowerCase())).map(d => d.id);
    const newIds = activeIds.filter(id => !prevDeliveryIdsRef.current.includes(id));
    if (newIds.length > 0 && prevDeliveryIdsRef.current.length > 0) {
      const newDelivery = deliveries.find(d => newIds.includes(d.id));
      if (newDelivery) {
        toast.success(`🍕 New Order #${newDelivery.order_id} - ${newDelivery.customer_name}`, { duration: 10000 });
        playNotificationSound();
      }
    }
    prevDeliveryIdsRef.current = activeIds;
    if (swRegistrationRef.current?.active) {
      swRegistrationRef.current.active.postMessage({ type: 'UPDATE_DELIVERIES', data: { deliveryIds: activeIds } });
    }
  }, [deliveries, rider]);

  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => { oscillator.frequency.value = 1000; setTimeout(() => { oscillator.frequency.value = 1200; setTimeout(() => { oscillator.stop(); audioContext.close(); }, 150); }, 150); }, 150);
    } catch { /* ignore */ }
  }

  function stopRiderRingNow(assignmentId?: number) {
    if (assignmentId != null) ringSuppressedRef.current.add(assignmentId);
    if (ringTimerRef.current !== null) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }

  // Ring only after the assigned order is already present in RiderPanel state.
  useEffect(() => {
    const waiting = deliveries.filter(
      delivery =>
        String(delivery.status || '').toLowerCase() === 'assigned' &&
        !ringSuppressedRef.current.has(delivery.id)
    );

    if (!rider || !notificationsEnabled || waiting.length === 0) {
      stopRiderRingNow();
      return;
    }

    // State has rendered/updated first; sound follows on the next animation frame.
    window.requestAnimationFrame(() => playNotificationSound());
    if (ringTimerRef.current !== null) window.clearInterval(ringTimerRef.current);
    ringTimerRef.current = window.setInterval(playNotificationSound, 5000);

    return () => {
      if (ringTimerRef.current !== null) {
        window.clearInterval(ringTimerRef.current);
        ringTimerRef.current = null;
      }
    };
  }, [deliveries, rider, notificationsEnabled]);

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('/rider-sw.js', { scope: '/rider' });
      swRegistrationRef.current = registration;
      const sw = registration.active || registration.waiting || registration.installing;
      if (sw && sw.state !== 'activated') {
        await new Promise<void>((resolve) => {
          sw.addEventListener('statechange', function handler() {
            if (sw.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
          });
        });
      }
      if (registration.active && rider) {
        const activeIds = deliveries.filter(d => !['delivered', 'rejected'].includes(String(d.status || '').toLowerCase())).map(d => d.id);
        registration.active.postMessage({ type: 'RIDER_LOGIN', data: { riderId: rider.id, currentDeliveryIds: activeIds, apiBaseUrl: getAPIBaseURL(), token: localStorage.getItem('rider_access_token') || '' } });
      }
    } catch (error) { console.error('SW registration failed:', error); }
  }

  async function requestNotificationPermission() {
    if (!browserNotificationsSupported) {
      setNotificationsEnabled(true);
      localStorage.setItem('rider_notifications', 'on');
      toast.success('🔔 Rider alerts enabled');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('rider_notifications', 'on');
      toast.success('🔔 Notifications enabled!');

      try {
        if (swRegistrationRef.current) {
          await swRegistrationRef.current.showNotification('🛵 Rider Notifications Active', {
            body: 'You will receive alerts for new delivery orders.',
            icon: '/vite.svg',
            tag: 'rider-test-notification',
          });
        }
      } catch (error) {
        console.error('Rider notification test failed:', error);
      }
    } else if (permission === 'denied') {
      setNotificationsEnabled(false);
      localStorage.setItem('rider_notifications', 'off');
      toast.error('Notifications are blocked in browser settings.');
    }
  }

  function toggleNotifications() {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('rider_notifications', 'off');
      if (swRegistrationRef.current?.active) {
        swRegistrationRef.current.active.postMessage({ type: 'RIDER_LOGOUT' });
      }
      toast.info(browserNotificationsSupported ? 'Notifications off' : 'Rider alerts off');
      return;
    }

    if (!browserNotificationsSupported) {
      setNotificationsEnabled(true);
      localStorage.setItem('rider_notifications', 'on');
      toast.success('🔔 Rider alerts on');
      return;
    }

    if (notificationPermission === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem('rider_notifications', 'on');
      if (swRegistrationRef.current?.active && rider) {
        const activeIds = deliveries
          .filter(d => !['delivered', 'rejected'].includes(String(d.status || '').toLowerCase()))
          .map(d => d.id);
        swRegistrationRef.current.active.postMessage({
          type: 'RIDER_LOGIN',
          data: {
            riderId: rider.id,
            currentDeliveryIds: activeIds,
            apiBaseUrl: getAPIBaseURL(),
            token: localStorage.getItem('rider_access_token') || '',
          },
        });
      }
      toast.success('Notifications on');
    } else {
      void requestNotificationPermission();
    }
  }

  function updateMap() {
    const latestByOrder = new Map<number, Delivery>();
    deliveries.forEach((delivery) => {
      const existing = latestByOrder.get(delivery.order_id);
      if (!existing || Number(delivery.id) > Number(existing.id)) {
        latestByOrder.set(delivery.order_id, delivery);
      }
    });

    const activeDeliveries = Array.from(latestByOrder.values()).filter(
      d =>
        !['delivered', 'rejected'].includes(String(d.status || '').toLowerCase()) &&
        d.customer_lat &&
        d.customer_lng
    );
    if (activeDeliveries.length === 0) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    if (!mapContainerRef.current) return;
    const firstDelivery = activeDeliveries[0];
    const map = L.map(mapContainerRef.current).setView([firstDelivery.customer_lat!, firstDelivery.customer_lng!], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    activeDeliveries.forEach(d => {
      if (d.customer_lat && d.customer_lng) {
        L.marker([d.customer_lat, d.customer_lng]).addTo(map).bindPopup(`📦 Order #${d.order_id}<br>${d.customer_name}<br>${d.customer_address || ''}`);
      }
    });
    if (activeDeliveries.length > 1) {
      const bounds = L.latLngBounds(activeDeliveries.map(d => [d.customer_lat!, d.customer_lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    mapInstanceRef.current = map;
  }

  function handleRiderAuthFailure(message = 'Rider session expired. Please login again.') {
    localStorage.removeItem('rider_auth');
    localStorage.removeItem('rider_access_token');
    setRider(null);
    setDeliveries([]);
    setStats(null);
    setFinanceSummary(null);
    setCashSubmissions([]);
    stopRiderRingNow();
    toast.error(message);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !pin) { toast.error('Please enter phone and PIN'); return; }
    setLoginLoading(true);
    try {
      const res = await riderApi({ url: '/api/v1/rider/login', method: 'POST', data: { phone, pin } });
      if (res?.data?.success) {
        const riderData = res.data.rider;
        const accessToken = String(res.data.access_token || '').trim();
        if (!accessToken) throw new Error('Secure rider session could not be created. Please login again.');
        localStorage.setItem('rider_access_token', accessToken);
        localStorage.setItem('rider_auth', JSON.stringify(riderData));
        setRider(riderData);
        toast.success(`Welcome, ${riderData.name}!`);
        loadDeliveries(riderData.id);
        loadStats(riderData.id);
        loadFinance(riderData.id, 'today');
        loadCashSubmissions(riderData.id);
        if (browserNotificationsSupported && Notification.permission === 'default') {
          setTimeout(() => requestNotificationPermission(), 2000);
        }
      }
    } catch (e: any) { toast.error(e?.response?.data?.detail || e?.data?.detail || 'Invalid phone or PIN'); }
    finally { setLoginLoading(false); }
  }

  function handleLogout() {
    if (swRegistrationRef.current?.active) { swRegistrationRef.current.active.postMessage({ type: 'RIDER_LOGOUT' }); }
    setRider(null);
    setDeliveries([]);
    setStats(null);
    setFinanceSummary(null);
    setCashSubmissions([]);
    setCashAmount('');
    setCashNote('');
    localStorage.removeItem('rider_auth');
    localStorage.removeItem('rider_access_token');
    stopRiderRingNow();
    ringSuppressedRef.current.clear();
    prevDeliveryIdsRef.current = [];
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
  }

  async function loadDeliveries(riderId: number) {
    try {
      const res = await riderApi({ url: `/api/v1/rider/deliveries/${riderId}`, method: 'GET' });
      const items = res?.data?.items || [];
      setDeliveries(items);
      setLastRefresh(new Date());
    } catch (e: any) {
      console.error('Failed to load deliveries:', e);
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        handleRiderAuthFailure();
        return;
      }
      if (loading) { toast.error('Could not load deliveries.'); }
    } finally { setLoading(false); }
  }

  async function loadStats(riderId: number) {
    try {
      const res = await riderApi({ url: `/api/v1/rider/stats/${riderId}`, method: 'GET' });
      if (res?.data) { setStats(res.data); }
    } catch (e: any) {
      console.error('Failed to load stats:', e);
      if (e?.response?.status === 401 || e?.response?.status === 403) handleRiderAuthFailure();
    }
  }

  function getFinanceUrl(riderId: number, period: FinancePeriod) {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('date_from', customFrom);
      params.set('date_to', customTo);
    }
    return `/api/v1/finance/rider/${riderId}/summary?${params.toString()}`;
  }

  async function loadFinance(riderId: number, period: FinancePeriod = financePeriod) {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setFinanceLoading(true);
    try {
      const res = await riderApi({
        url: getFinanceUrl(riderId, period),
        method: 'GET',
        data: {},
      });
      if (res?.data) setFinanceSummary(res.data);
    } catch (e: any) {
      console.error('Failed to load rider finance:', e);
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        handleRiderAuthFailure('Rider login required. Please login once again.');
        return;
      }
      toast.error(e?.response?.data?.detail || e?.data?.detail || 'Could not load finance report');
    } finally {
      setFinanceLoading(false);
    }
  }

  async function loadCashSubmissions(riderId: number) {
    try {
      const res = await riderApi({
        url: `/api/v1/finance/rider/${riderId}/cash-submissions?limit=100`,
        method: 'GET',
        data: {},
      });
      setCashSubmissions(res?.data?.items || []);
    } catch (e: any) {
      console.error('Failed to load cash submissions:', e);
      if (e?.response?.status === 401 || e?.response?.status === 403) handleRiderAuthFailure();
    }
  }

  async function submitCashToShop() {
    if (!rider || !financeSummary) return;
    const amount = Number(cashAmount);
    const available = financeSummary.current_balance.remaining_to_submit || 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid cash amount');
      return;
    }
    if (amount > available + 0.01) {
      toast.error(`Maximum cash available is AED ${available.toFixed(2)}`);
      return;
    }

    setSubmittingCash(true);
    try {
      await riderApi({
        url: `/api/v1/finance/rider/${rider.id}/cash-submissions`,
        method: 'POST',
        data: { amount, note: cashNote.trim() },
      });
      toast.success('Cash sent to admin for approval');
      setCashAmount('');
      setCashNote('');
      await Promise.all([
        loadFinance(rider.id, financePeriod),
        loadCashSubmissions(rider.id),
      ]);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.data?.detail || 'Cash submission failed');
    } finally {
      setSubmittingCash(false);
    }
  }

  function formatDateTime(value: string | null) {
    return formatUaeDateTime(value);
  }

  async function pushFreshGpsNow(): Promise<boolean> {
    if (!rider || !navigator.geolocation) {
      setGpsState('unsupported');
      return false;
    }

    setGpsState('checking');
    return await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await riderApi({
              url: `/api/v1/rider/location/${rider.id}`,
              method: 'POST',
              data: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            });
            setGpsState('live');
            setGpsUpdatedAt(new Date());
            resolve(true);
          } catch (error: any) {
            setGpsState('error');
            if (error?.response?.status === 401 || error?.response?.status === 403) {
              handleRiderAuthFailure('Rider login required. Please login once again.');
            }
            resolve(false);
          }
        },
        (error) => {
          setGpsState(error.code === 1 ? 'denied' : 'error');
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 },
      );
    });
  }

  async function updateStatus(assignmentId: number, newStatus: string, reason?: string) {
    // Customer live tracking begins after Picked Up. Push a fresh GPS fix first
    // so the customer does not land on "ETA updating / waiting for fresh GPS".
    if (newStatus === 'picked_up') {
      const gpsReady = await pushFreshGpsNow();
      if (!gpsReady) {
        toast.warning('Order picked up, but live GPS is not available. Please allow Location for customer tracking.');
      }
    }

    const previous = deliveries;
    if (newStatus === 'accepted' || newStatus === 'rejected') {
      stopRiderRingNow(assignmentId);
      setDeliveries(current => current.map(item => item.id === assignmentId ? { ...item, status: newStatus } : item));
    }

    try {
      await riderApi({
        url: `/api/v1/rider/deliveries/${assignmentId}/status`,
        method: 'PUT',
        data: { status: newStatus, reason: reason || undefined },
      });
      toast.success(newStatus === 'rejected' ? `Delivery rejected — ${reason}` : `Status updated to ${newStatus.replace(/_/g, ' ')}`);
      if (rider) {
        await Promise.all([
          loadDeliveries(rider.id),
          loadStats(rider.id),
          loadFinance(rider.id, financePeriod),
          loadCashSubmissions(rider.id),
        ]);
      }
    } catch (e: any) {
      setDeliveries(previous);
      ringSuppressedRef.current.delete(assignmentId);
      toast.error(e?.response?.data?.detail || e?.data?.detail || 'Failed to update status');
    }
  }

  function openInMaps(lat: number, lng: number) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'assigned': return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'accepted': return 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30';
      case 'rejected': return 'bg-red-600/20 text-red-400 border-red-600/30';
      case 'picked_up': return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30';
      case 'on_the_way': return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      case 'delivered': return 'bg-green-600/20 text-green-400 border-green-600/30';
      default: return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
    }
  }

  function getNextStatus(current: string): { label: string; value: string } | null {
    switch (current) {
      case 'accepted':
        return { label: '🏪 Picked Up from Kitchen', value: 'picked_up' };
      case 'picked_up':
      case 'on_the_way':
        return { label: '✅ Delivered to Customer', value: 'delivered' };
      default:
        return null;
    }
  }

  // Login screen
  if (!rider) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bike className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white text-2xl font-bold">Rider Panel</h1>
            <p className="text-gray-400 text-sm mt-1">Fai Fai Juice Delivery</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-gray-300">Phone Number</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971 XX XXX XXXX" className="bg-gray-900 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">PIN</Label>
              <Input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter your PIN" maxLength={6} className="bg-gray-900 border-gray-700 text-white mt-1" />
            </div>
            <Button type="submit" disabled={loginLoading} className="w-full bg-red-600 hover:bg-red-700 text-white py-5 cursor-pointer">
              {loginLoading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const latestByOrder = new Map<number, Delivery>();
  deliveries.forEach((delivery) => {
    const existing = latestByOrder.get(delivery.order_id);
    if (!existing || Number(delivery.id) > Number(existing.id)) {
      latestByOrder.set(delivery.order_id, delivery);
    }
  });

  const uniqueDeliveries = Array.from(latestByOrder.values());
  const activeDeliveries = uniqueDeliveries.filter(
    d => !['delivered', 'rejected'].includes(String(d.status || '').toLowerCase())
  );
  const completedDeliveries = uniqueDeliveries.filter(
    d => String(d.status || '').toLowerCase() === 'delivered'
  );

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      {rejectDelivery && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Reject Assignment #{rejectDelivery.order_id}</h3>
                <p className="mt-1 text-xs text-gray-400">Before Accept: this only rejects your assignment. Admin sees the reason; the customer order is not cancelled.</p>
              </div>
              <button type="button" onClick={() => { ringSuppressedRef.current.delete(rejectDelivery.id); setRejectDelivery(null); setDeliveries(current => [...current]); }} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <p className="mb-3 text-sm text-gray-400">Select why you cannot take this delivery. A reason is required.</p>
            <div className="grid grid-cols-1 gap-2">
              {['Too far', 'Vehicle issue', 'Busy with another delivery', 'Unable to complete delivery', 'Other'].map(reason => (
                <button key={reason} type="button" onClick={() => { setRejectPreset(reason); if (reason !== 'Other') setRejectOtherReason(''); }} className={`rounded-xl border px-3 py-2.5 text-left text-sm ${rejectPreset === reason ? 'border-red-500 bg-red-600/15 text-red-300' : 'border-gray-700 bg-gray-800 text-gray-300'}`}>{reason}</button>
              ))}
            </div>
            {rejectPreset === 'Other' && (
              <textarea value={rejectOtherReason} onChange={e => setRejectOtherReason(e.target.value)} maxLength={300} placeholder="Write rejection reason..." className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white" rows={2} />
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { ringSuppressedRef.current.delete(rejectDelivery.id); setRejectDelivery(null); setRejectPreset(''); setRejectOtherReason(''); setDeliveries(current => [...current]); }} className="border-gray-700 text-gray-300">Back</Button>
              <Button disabled={!rejectPreset || (rejectPreset === 'Other' && !rejectOtherReason.trim())} onClick={() => {
                const target = rejectDelivery;
                const reason = rejectPreset === 'Other' ? rejectOtherReason.trim() : rejectPreset;
                if (!reason) return;
                setRejectDelivery(null); setRejectPreset(''); setRejectOtherReason('');
                void updateStatus(target.id, 'rejected', reason);
              }} className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Confirm Reject</Button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
              <Bike className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold">{rider.name}</h1>
              <p className="text-gray-500 text-xs">Auto-refresh • {formatUaeTime(lastRefresh)} UAE</p>
              <p className={`text-[11px] mt-0.5 ${gpsState === 'live' ? 'text-green-400' : gpsState === 'checking' ? 'text-amber-400' : 'text-red-400'}`}>
                {gpsState === 'live'
                  ? `GPS live${gpsUpdatedAt ? ` • ${formatUaeTime(gpsUpdatedAt)} UAE` : ''}`
                  : gpsState === 'checking'
                    ? 'GPS checking…'
                    : gpsState === 'denied'
                      ? 'GPS permission blocked — allow Location'
                      : gpsState === 'unsupported'
                        ? 'GPS unavailable on this device'
                        : 'GPS update failed — check Location'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={toggleNotifications} variant="ghost" size="sm" className={`cursor-pointer ${notificationsEnabled ? 'text-green-400' : 'text-gray-400'}`}>
              {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </Button>
            <Button onClick={() => { if (rider) { loadDeliveries(rider.id); loadStats(rider.id); loadFinance(rider.id, financePeriod); loadCashSubmissions(rider.id); } }} variant="ghost" size="sm" className="text-gray-400 cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={handleLogout} variant="ghost" size="sm" className="text-gray-400 cursor-pointer">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'orders' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            📦 My Orders
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === 'stats' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            📊 Dashboard
          </button>
        </div>

        {/* Notification Permission Banner */}
        {browserNotificationsSupported && notificationPermission === 'default' && (
          <div className="mb-4 p-3 rounded-xl bg-blue-600/10 border border-blue-600/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-400 text-sm font-medium">🔔 Enable Notifications</p>
                <p className="text-blue-400/70 text-xs mt-0.5">Get alerts for new orders in background</p>
              </div>
              <Button onClick={requestNotificationPermission} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">Enable</Button>
            </div>
          </div>
        )}
        {browserNotificationsSupported && notificationPermission === 'denied' && (
          <div className="mb-4 p-3 rounded-xl bg-red-600/10 border border-red-600/30">
            <p className="text-red-400 text-sm">⚠️ Notifications blocked. Enable in browser settings.</p>
          </div>
        )}

        {/* FINANCE / DASHBOARD TAB */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-red-400" /> Report Period
                </h3>
                <p className="text-gray-500 text-xs mt-1">
                  Choose the exact period for your delivery earnings and cash settlement.
                </p>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
                {RIDER_FINANCE_PERIODS.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFinancePeriod(option.key)}
                    className={`rounded-xl px-3 py-3 text-sm font-semibold border transition ${
                      financePeriod === option.key
                        ? 'bg-green-600 border-green-500 text-white shadow-lg shadow-green-950/30'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 hover:border-gray-600'
                    }`}
                  >
                    {option.short}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500 text-xs">Showing</span>
                  <span className="text-white text-sm font-semibold">
                    {financeSummary?.period?.label ||
                      RIDER_FINANCE_PERIODS.find(option => option.key === financePeriod)?.label}
                  </span>
                </div>
                {financeSummary?.period?.date_from && financeSummary?.period?.date_to && (
                  <div className="mt-1 text-right text-gray-500 text-xs">
                    {formatFinanceDate(financeSummary.period.date_from)} — {formatFinanceDate(financeSummary.period.date_to)}
                  </div>
                )}
              </div>

              {financePeriod === 'custom' && (
                <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-gray-400 text-xs">From Date</Label>
                      <Input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1 rounded-xl"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">To Date</Label>
                      <Input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1 rounded-xl"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => rider && loadFinance(rider.id, 'custom')}
                    disabled={financeLoading || !customFrom || !customTo}
                    className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white rounded-xl"
                  >
                    {financeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Apply Custom Dates
                  </Button>
                </div>
              )}
            </Card>

            {financeLoading && !financeSummary ? (
              <div className="py-12 text-center text-gray-400">Loading finance report...</div>
            ) : financeSummary ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">{financeSummary.period.label}</h3>
                  {financeLoading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <Package className="w-5 h-5 text-blue-400 mb-2" />
                    <p className="text-2xl font-bold text-white">{financeSummary.totals.delivered_orders}</p>
                    <p className="text-gray-500 text-xs">Delivered Orders</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <MapPin className="w-5 h-5 text-purple-400 mb-2" />
                    <p className="text-xl font-bold text-purple-400">AED {financeSummary.totals.delivery_charges.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">Delivery Charges</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <span className="text-xl block mb-2">💝</span>
                    <p className="text-xl font-bold text-pink-400">AED {financeSummary.totals.rider_tips.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">Rider Tips</p>
                  </Card>
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <DollarSign className="w-5 h-5 text-green-400 mb-2" />
                    <p className="text-xl font-bold text-green-400">AED {financeSummary.totals.rider_earnings.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">My Earning</p>
                  </Card>
                </div>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-400" /> My Rider Payment
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-purple-600/10 border border-purple-600/30 rounded-xl p-3">
                      <p className="text-purple-300/70 text-xs">Earned All Time</p>
                      <p className="text-purple-300 font-bold mt-1">AED {Number(financeSummary.current_balance.rider_earnings_total || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-3">
                      <p className="text-green-300/70 text-xs">Paid by Shop</p>
                      <p className="text-green-300 font-bold mt-1">AED {Number(financeSummary.current_balance.rider_paid_total || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-xl p-3">
                      <p className="text-yellow-300/70 text-xs">Still Owed to Me</p>
                      <p className="text-yellow-300 font-bold mt-1">AED {Number(financeSummary.current_balance.rider_remaining_to_receive || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-3">
                      <p className="text-gray-500 text-xs">Paid This Period</p>
                      <p className="text-white font-bold mt-1">AED {(financeSummary.payouts?.paid_to_rider || 0).toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs mt-3">Delivery charge + Rider tip are my earnings. Customer cash is submitted to the shop separately.</p>
                </Card>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-yellow-400" /> Cash Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-800 rounded-xl p-3">
                      <p className="text-gray-500 text-xs">Cash Collected</p>
                      <p className="text-white font-bold mt-1">
                        AED {financeSummary.totals.cash_collected.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-orange-600/10 border border-orange-600/30 rounded-xl p-3">
                      <p className="text-orange-400/70 text-xs">Payable to Shop</p>
                      <p className="text-orange-400 font-bold mt-1">
                        AED {financeSummary.totals.cash_payable_to_shop.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-yellow-400" /> Current Cash Settlement
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-800 rounded-lg p-3">
                      <p className="text-gray-500 text-xs">Cash Due</p>
                      <p className="text-white font-bold mt-1">AED {financeSummary.current_balance.cash_due_to_shop.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3">
                      <p className="text-green-400/70 text-xs">Approved / Given</p>
                      <p className="text-green-400 font-bold mt-1">AED {financeSummary.current_balance.approved_cash.toFixed(2)}</p>
                    </div>
                    <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg p-3">
                      <p className="text-orange-400/70 text-xs">Waiting Admin</p>
                      <p className="text-orange-400 font-bold mt-1">AED {financeSummary.current_balance.awaiting_approval.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-3">
                      <p className="text-red-400/70 text-xs">Total Pending</p>
                      <p className="text-red-400 font-bold mt-1">AED {financeSummary.current_balance.total_pending_cash.toFixed(2)}</p>
                    </div>
                  </div>

                  {financeSummary.current_balance.remaining_to_submit > 0 ? (
                    <div className="border-t border-gray-800 pt-4">
                      <p className="text-gray-300 text-sm font-medium mb-3">Submit cash to shop</p>
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={financeSummary.current_balance.remaining_to_submit}
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          placeholder={`Max ${financeSummary.current_balance.remaining_to_submit.toFixed(2)}`}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                        <Input
                          value={cashNote}
                          onChange={(e) => setCashNote(e.target.value)}
                          placeholder="Optional note"
                          maxLength={500}
                          className="bg-gray-800 border-gray-700 text-white"
                        />
                        <Button onClick={submitCashToShop} disabled={submittingCash} className="bg-green-600 hover:bg-green-700 text-white">
                          {submittingCash ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                          Submit Cash
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-800 pt-4 text-green-400 text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> No cash waiting to submit.
                    </div>
                  )}
                </Card>

                <Card className="bg-gray-900 border-gray-800 p-4">
                  <h3 className="text-white font-semibold mb-3">Cash Submission History</h3>
                  {cashSubmissions.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center">No cash submissions yet</p>
                  ) : (
                    <div className="space-y-2">
                      {cashSubmissions.slice(0, 20).map((item) => (
                        <div key={item.id} className="bg-gray-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold">AED {item.amount.toFixed(2)}</span>
                              <Badge className={item.status === 'approved' ? 'bg-green-600/20 text-green-400 border-green-600/30' : item.status === 'rejected' ? 'bg-red-600/20 text-red-400 border-red-600/30' : 'bg-orange-600/20 text-orange-400 border-orange-600/30'}>
                                {item.status === 'pending' ? 'Waiting Admin' : item.status}
                              </Badge>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">Submitted: {formatDateTime(item.submitted_at)}</p>
                            {item.rider_note && <p className="text-gray-400 text-xs mt-1">Note: {item.rider_note}</p>}
                            {item.admin_note && <p className="text-gray-400 text-xs mt-1">Admin: {item.admin_note}</p>}
                          </div>
                          {item.reviewed_at && <p className="text-gray-500 text-xs">Reviewed: {formatDateTime(item.reviewed_at)}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {stats && (
                  <Card className="bg-gray-900 border-gray-800 p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> Current Order Status</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-orange-400">{stats.pending_orders}</p><p className="text-orange-400/70 text-xs mt-1">Pending</p></div>
                      <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-green-400">{stats.completed_orders}</p><p className="text-green-400/70 text-xs mt-1">All-Time Completed</p></div>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-gray-500">Finance report is not available.</div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <>
            {/* Map */}
            {activeDeliveries.some(d => d.customer_lat && d.customer_lng) && (
              <div ref={mapContainerRef} className="w-full h-[200px] rounded-xl overflow-hidden border border-gray-700 mb-4" style={{ zIndex: 1 }} />
            )}

            {loading ? (
              <div className="text-center text-gray-400 py-12">Loading deliveries...</div>
            ) : (
              <>
                {activeDeliveries.length > 0 ? (
                  <div className="space-y-4 mb-8">
                    <h2 className="text-white font-semibold">Active Deliveries ({activeDeliveries.length})</h2>
                    {activeDeliveries.map(delivery => {
                      let items: any[] = [];
                      try { items = JSON.parse(delivery.order_items); } catch { /* */ }
                      const nextStatus = getNextStatus(delivery.status);
                      return (
                        <Card key={delivery.id} className="bg-gray-900 border-gray-800 p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <span className="text-white font-semibold">Order #{delivery.order_id}</span>
                              <p className="mt-0.5 text-[11px] text-gray-500">Assigned: {formatUaeDateTime(delivery.created_at)} UAE</p>
                            </div>
                            <Badge className={`${getStatusColor(delivery.status)} border text-xs`}>
                              {delivery.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center gap-2 text-gray-300 text-sm">
                              <Package className="w-4 h-4 text-gray-500" />
                              <span>{delivery.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300 text-sm">
                              <Phone className="w-4 h-4 text-gray-500" />
                              <a href={`tel:${delivery.customer_phone}`} className="text-blue-400 hover:underline">{delivery.customer_phone}</a>
                            </div>
                            {delivery.customer_address && (
                              <div className="flex items-start gap-2 text-gray-300 text-sm">
                                <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
                                <span>{delivery.customer_address}</span>
                              </div>
                            )}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-3 mb-3">
                            {items.map((item, idx) => (
                              <div key={idx} className="text-gray-400 text-xs">{item.quantity}x {item.name} ({item.size})</div>
                            ))}
                            <div className="text-red-400 font-semibold text-sm mt-2">Total: AED {delivery.order_total?.toFixed(2)}</div>
                            {(delivery.delivery_charge > 0 || delivery.tip_amount > 0) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {delivery.delivery_charge > 0 && (
                                  <span className="text-purple-400 text-xs font-medium">🛵 Delivery: AED {delivery.delivery_charge.toFixed(2)}</span>
                                )}
                                {delivery.tip_amount > 0 && (
                                  <span className="text-pink-400 text-xs font-medium">💝 Tip: AED {delivery.tip_amount.toFixed(2)}</span>
                                )}
                                {delivery.zone_name && <span className="text-gray-500 text-xs">({delivery.zone_name})</span>}
                                {delivery.distance_km && <span className="text-gray-600 text-xs">• {delivery.distance_km.toFixed(1)} km</span>}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {delivery.customer_lat && delivery.customer_lng && (
                              <Button onClick={() => openInMaps(delivery.customer_lat!, delivery.customer_lng!)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer" size="sm">
                                <Navigation className="w-4 h-4 mr-1" /> Navigate
                              </Button>
                            )}
                            {delivery.status === 'assigned' ? (
                              <>
                                <Button
                                  onClick={() => updateStatus(delivery.id, 'accepted')}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                                  size="sm"
                                >
                                  ✅ Accept
                                </Button>
                                <Button
                                  onClick={() => { stopRiderRingNow(delivery.id); setRejectPreset(''); setRejectOtherReason(''); setRejectDelivery(delivery); }}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                                  size="sm"
                                >
                                  ❌ Reject
                                </Button>
                              </>
                            ) : delivery.status === 'accepted' && delivery.order_status !== 'ready' ? (
                              <Button
                                disabled
                                className="flex-1 bg-gray-700 text-gray-300 cursor-not-allowed"
                                size="sm"
                              >
                                Waiting for Kitchen Ready
                              </Button>
                            ) : nextStatus ? (
                              <Button
                                onClick={() => updateStatus(delivery.id, nextStatus.value)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                                size="sm"
                              >
                                {nextStatus.label}
                              </Button>
                            ) : null}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Bike className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500">No active deliveries</p>
                    <p className="text-gray-600 text-sm mt-1">New deliveries will appear here automatically</p>
                    {notificationsEnabled && <p className="text-green-500/70 text-xs mt-3">🔔 You'll be notified when new orders arrive</p>}
                  </div>
                )}

                {completedDeliveries.length > 0 && (
                  <div>
                    <h2 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-3">Completed ({completedDeliveries.length})</h2>
                    <div className="space-y-2">
                      {completedDeliveries.slice(0, 10).map(delivery => (
                        <Card key={delivery.id} className="bg-gray-900/50 border-gray-800 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-gray-300 text-sm">Order #{delivery.order_id}</span>
                              <span className="text-gray-500 text-xs ml-2">{delivery.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-sm">AED {delivery.order_total?.toFixed(2)}</span>
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            </div>
                          </div>
                          {(delivery.delivery_charge > 0 || delivery.tip_amount > 0) && (
                            <div className="flex items-center gap-2 mt-1">
                              {delivery.delivery_charge > 0 && (
                                <span className="text-purple-400 text-xs">Earned: AED {delivery.delivery_charge.toFixed(2)}</span>
                              )}
                              {delivery.tip_amount > 0 && (
                                <span className="text-pink-400 text-xs">+ Tip: AED {delivery.tip_amount.toFixed(2)}</span>
                              )}
                              {delivery.zone_name && <span className="text-gray-600 text-xs">({delivery.zone_name})</span>}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}