import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { MapPin, Car, Tag, Navigation, CheckCircle } from 'lucide-react';
import CustomerLayout from '@/components/CustomerLayout';
import { client, CartItem, Offer } from '@/lib/api';
import { getCart, getCartTotal, getCartOriginalTotal, getCartItemDiscountTotal, clearCart } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';
import { isPromoOfferCurrentlyActive } from '@/lib/discounts';
import { getGuestSessionId } from '@/lib/guest-session';
import { getAPIBaseURL } from '@/lib/config';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function isWithinDailySchedule(start: string, end: string, now: Date): boolean {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes)
      ? hours * 60 + minutes
      : -1;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes < 0 || endMinutes < 0 || startMinutes === endMinutes) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return endMinutes < startMinutes
    ? currentMinutes >= startMinutes || currentMinutes < endMinutes
    : currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function formatScheduleTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoggedIn } = useCustomerAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false); // Guard against double-submit
  // Auto-fill from localStorage (remember customer info from previous orders)
  const [name, setName] = useState(() => localStorage.getItem('vita_customer_name') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('vita_customer_phone') || '');
  const [carInfo, setCarInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Field-level validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);

  // Fee settings from admin
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const [serviceFeeAmount, setServiceFeeAmount] = useState(0);
  const [serviceFeeType, setServiceFeeType] = useState<'fixed' | 'percentage'>('fixed');
  const [serviceFeeAppliesTo, setServiceFeeAppliesTo] = useState<'pickup' | 'delivery' | 'both'>('both');
  const [smallOrderFeeEnabled, setSmallOrderFeeEnabled] = useState(false);
  const [smallOrderFeeAmount, setSmallOrderFeeAmount] = useState(0);
  const [smallOrderFeeThreshold, setSmallOrderFeeThreshold] = useState(20);
  const [taxPercent, setTaxPercent] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(false);

  // Payment method settings from admin
  const [cashEnabledPickup, setCashEnabledPickup] = useState(true);
  const [cardEnabledPickup, setCardEnabledPickup] = useState(true);
  const [cashEnabledDelivery, setCashEnabledDelivery] = useState(true);
  const [cardEnabledDelivery, setCardEnabledDelivery] = useState(true);

  // Delivery settings from admin
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryScheduleEnabled, setDeliveryScheduleEnabled] = useState(false);
  const [deliveryStartTime, setDeliveryStartTime] = useState('16:00');
  const [deliveryEndTime, setDeliveryEndTime] = useState('01:00');
  const [scheduleClock, setScheduleClock] = useState(() => Date.now());
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [estimatedDeliveryTime, setEstimatedDeliveryTime] = useState('30-45 min');

  // Delivery zone settings
  const [restaurantLat, setRestaurantLat] = useState(25.2747);
  const [restaurantLng, setRestaurantLng] = useState(56.3450);
  const [nearRadius, setNearRadius] = useState(5);
  const [farRadius, setFarRadius] = useState(15);
  const [nearCharge, setNearCharge] = useState(5);
  const [farCharge, setFarCharge] = useState(15);
  const [zoneName, setZoneName] = useState('');
  const [deliveryZones, setDeliveryZones] = useState<{zone_name: string; min_distance_km: number; max_distance_km: number; charge: number}[]>([]);

  // Tip
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [showCustomTip, setShowCustomTip] = useState(false);

  // Promo code
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoOffer, setPromoOffer] = useState<Offer | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [activePromoOffers, setActivePromoOffers] = useState<Offer[]>([]);

  // Shop status
  const [shopClosed, setShopClosed] = useState(false);
  const [shopClosedMessage, setShopClosedMessage] = useState('');

  // GPS location via map
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [locationShared, setLocationShared] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [deliveryZoneError, setDeliveryZoneError] = useState('');
  const [calculatedDeliveryCharge, setCalculatedDeliveryCharge] = useState(0);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    setCart(getCart());
    loadDeliverySettings();
    loadActivePromoOffers();
  }, []);

  const deliveryAvailableNow = deliveryEnabled && (
    !deliveryScheduleEnabled ||
    isWithinDailySchedule(deliveryStartTime, deliveryEndTime, new Date(scheduleClock))
  );

  useEffect(() => {
    const timer = window.setInterval(() => setScheduleClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (orderType === 'delivery' && !deliveryAvailableNow) {
      setOrderType('pickup');
      setShowMap(false);
    }
  }, [deliveryAvailableNow, orderType]);

  // Auto-select first available payment method when order type changes
  useEffect(() => {
    const methods = orderType === 'pickup'
      ? [cashEnabledPickup && 'cash', cardEnabledPickup && 'card'].filter(Boolean)
      : [cashEnabledDelivery && 'cash', cardEnabledDelivery && 'card'].filter(Boolean);
    if (methods.length > 0 && !methods.includes(paymentMethod)) {
      setPaymentMethod(methods[0] as string);
    }
  }, [orderType, cashEnabledPickup, cardEnabledPickup, cashEnabledDelivery, cardEnabledDelivery]);

  useEffect(() => {
    if (showMap && !mapInstanceRef.current) {
      // Small delay to ensure DOM is rendered before initializing map
      const timer = setTimeout(() => {
        if (mapRef.current && !mapInstanceRef.current) {
          initMap();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    if (!showMap && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  }, [showMap]);

  function initMap() {
    if (!mapRef.current) return;
    const map = L.map(mapRef.current).setView([restaurantLat, restaurantLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Restaurant marker
    const restaurantIcon = L.divIcon({
      html: '<div style="background:red;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>',
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker([restaurantLat, restaurantLng], { icon: restaurantIcon }).addTo(map)
      .bindPopup('🍕 Vita Napoli');

    // Draw delivery zones on map
    const zoneColors = ['#22c55e', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6'];
    if (deliveryZones.length > 0) {
      deliveryZones.forEach((zone, i) => {
        const color = zoneColors[i % zoneColors.length];
        L.circle([restaurantLat, restaurantLng], {
          radius: zone.max_distance_km * 1000,
          color,
          fillColor: color,
          fillOpacity: 0.03,
          weight: 2,
          dashArray: '5,5',
        }).addTo(map);
      });
    } else {
      // Fallback to legacy near/far zones
      L.circle([restaurantLat, restaurantLng], {
        radius: nearRadius * 1000,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.05,
        weight: 2,
        dashArray: '5,5',
      }).addTo(map);

      L.circle([restaurantLat, restaurantLng], {
        radius: farRadius * 1000,
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.03,
        weight: 2,
        dashArray: '5,5',
      }).addTo(map);
    }

    // Draggable customer marker
    const marker = L.marker([restaurantLat + 0.005, restaurantLng + 0.005], {
      draggable: true,
    }).addTo(map);
    marker.bindPopup('📍 Drag me to your location').openPopup();

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      handleLocationSelected(pos.lat, pos.lng);
    });

    // Click to place marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      handleLocationSelected(e.latlng.lat, e.latlng.lng);
    });

    // Auto-request user's current location when map loads
    if (navigator.geolocation) {
      setGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          marker.setLatLng([latitude, longitude]);
          map.setView([latitude, longitude], 15);
          handleLocationSelected(latitude, longitude);
          setLocationPermissionDenied(false);
          setGettingLocation(false);
        },
        (err) => {
          setGettingLocation(false);
          if (err.code === err.PERMISSION_DENIED) {
            setLocationPermissionDenied(true);
          }
          // User can still drag pin or tap map manually
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    mapInstanceRef.current = map;
    markerRef.current = marker;
  }

  async function handleLocationSelected(lat: number, lng: number) {
    setCustomerLat(lat);
    setCustomerLng(lng);
    setLocationShared(true);

    // Call backend zone calculation API
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/entities/delivery_zones/calculate',
        method: 'POST',
        data: {
          customer_lat: lat,
          customer_lng: lng,
          restaurant_lat: restaurantLat,
          restaurant_lng: restaurantLng,
        },
      });
      const result = res?.data;
      if (result?.available) {
        setDeliveryZoneError('');
        setCalculatedDeliveryCharge(result.charge || 0);
        setZoneName(result.zone_name || '');
      } else {
        setDeliveryZoneError(result?.message || `Delivery not available in your area (${result?.distance_km?.toFixed(1) || '?'} km away).`);
        setCalculatedDeliveryCharge(0);
        setZoneName('');
      }
    } catch {
      // Fallback to client-side near/far calculation if API fails
      const distance = getDistanceKm(restaurantLat, restaurantLng, lat, lng);
      if (distance <= nearRadius) {
        setDeliveryZoneError('');
        setCalculatedDeliveryCharge(nearCharge);
        setZoneName('Near Zone');
      } else if (distance <= farRadius) {
        setDeliveryZoneError('');
        setCalculatedDeliveryCharge(farCharge);
        setZoneName('Far Zone');
      } else {
        setDeliveryZoneError(`Delivery not available in your area (${distance.toFixed(1)} km away). We deliver within ${farRadius} km.`);
        setCalculatedDeliveryCharge(0);
        setZoneName('');
      }
    }
  }

  function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async function loadDeliverySettings() {
    try {
      // Fetch from backend entity (accessible to all users)
      const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
      const items = res?.data?.items || [];
      if (items.length > 0) {
        const s = items[0] as any;

        // ===== SHOP STATUS CHECK =====
        const status = (s.restaurant_status || '').toLowerCase().trim();
        if (status === 'closed') {
          setShopClosed(true);
          setShopClosedMessage(s.busy_message || 'The restaurant is currently closed. Please try again during opening hours.');
        } else if (status === 'busy') {
          // Busy but still accepting orders - show warning
          setShopClosedMessage(s.busy_message || 'We are currently busy. Orders may take longer than usual.');
        } else {
          setShopClosed(false);
          setShopClosedMessage('');
        }

        // Check auto-schedule
        if (s.auto_schedule_enabled && s.auto_open_time && s.auto_close_time) {
          const now = new Date();
          // UAE is UTC+4
          const uaeTime = new Date(now.getTime() + (4 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
          const currentMinutes = uaeTime.getHours() * 60 + uaeTime.getMinutes();

          const parseTime = (t: string) => {
            const match = t.match(/(\d{1,2}):(\d{2})/);
            return match ? parseInt(match[1]) * 60 + parseInt(match[2]) : -1;
          };

          const openMin = parseTime(s.auto_open_time);
          const closeMin = parseTime(s.auto_close_time);

          if (openMin >= 0 && closeMin >= 0) {
            let isOpen: boolean;
            if (closeMin < openMin) {
              // Overnight (e.g., 15:00 - 02:00)
              isOpen = currentMinutes >= openMin || currentMinutes < closeMin;
            } else {
              isOpen = currentMinutes >= openMin && currentMinutes < closeMin;
            }

            if (!isOpen && status !== 'open') {
              setShopClosed(true);
              setShopClosedMessage(s.busy_message || `We are currently closed. Opening hours: ${s.auto_open_time} - ${s.auto_close_time}`);
            }
          }
        }
        // ===== END SHOP STATUS CHECK =====

        setDeliveryEnabled(s.delivery_enabled === true || s.delivery_enabled === 'true');
        setDeliveryScheduleEnabled(s.delivery_schedule_enabled === true);
        setDeliveryStartTime(s.delivery_start_time || '16:00');
        setDeliveryEndTime(s.delivery_end_time || '01:00');
        setDeliveryCharge(parseFloat(s.delivery_charges) || 5);
        setEstimatedDeliveryTime(s.estimated_delivery_time || '30-45 min');
        if (s.restaurant_lat) setRestaurantLat(parseFloat(s.restaurant_lat));
        if (s.restaurant_lng) setRestaurantLng(parseFloat(s.restaurant_lng));
        if (s.near_radius) setNearRadius(parseFloat(s.near_radius));
        if (s.far_radius) setFarRadius(parseFloat(s.far_radius));
        if (s.near_charge) setNearCharge(parseFloat(s.near_charge));
        if (s.far_charge) setFarCharge(parseFloat(s.far_charge));
        // Fee settings
        setServiceFeeEnabled(s.service_fee_enabled === true);
        setServiceFeeAmount(parseFloat(s.service_fee_amount) || 0);
        setServiceFeeType(s.service_fee_type || 'fixed');
        setServiceFeeAppliesTo(s.service_fee_applies_to || 'both');
        setSmallOrderFeeEnabled(s.small_order_fee_enabled === true);
        setSmallOrderFeeAmount(parseFloat(s.small_order_fee_amount) || 0);
        setSmallOrderFeeThreshold(parseFloat(s.small_order_fee_threshold) || 20);
        setTaxPercent(Math.max(0, Math.min(100, parseFloat(s.tax_percent) || 0)));
        setVatIncluded(s.vat_included === true);
        // Payment method settings
        setCashEnabledPickup(s.cash_enabled_pickup !== false);
        setCardEnabledPickup(s.card_enabled_pickup !== false);
        setCashEnabledDelivery(s.cash_enabled_delivery !== false);
        setCardEnabledDelivery(s.card_enabled_delivery !== false);
      }
      // Load delivery zones from backend for map legend
      try {
        const zonesRes = await client.apiCall.invoke({
          url: '/api/v1/entities/delivery_zones?query={"is_active":true}&sort=min_distance_km&limit=50',
          method: 'GET',
        });
        const zones = zonesRes?.data?.items || [];
        if (zones.length > 0) {
          setDeliveryZones(zones);
        }
      } catch { /* zones not loaded, use legacy near/far */ }
    } catch (e) {
      console.error('Failed to load delivery settings:', e);
      // Fallback to localStorage for admin testing
      const ext = localStorage.getItem('extended_settings');
      if (ext) {
        try {
          const parsed = JSON.parse(ext);
          setDeliveryEnabled(parsed.delivery_enabled === true || parsed.delivery_enabled === 'true');
          setDeliveryScheduleEnabled(parsed.delivery_schedule_enabled === true);
          setDeliveryStartTime(parsed.delivery_start_time || '16:00');
          setDeliveryEndTime(parsed.delivery_end_time || '01:00');
          setDeliveryCharge(parseFloat(parsed.delivery_charges) || 5);
          setEstimatedDeliveryTime(parsed.estimated_delivery_time || '30-45 min');
          if (parsed.restaurant_lat) setRestaurantLat(parseFloat(parsed.restaurant_lat));
          if (parsed.restaurant_lng) setRestaurantLng(parseFloat(parsed.restaurant_lng));
          if (parsed.near_radius) setNearRadius(parseFloat(parsed.near_radius));
          if (parsed.far_radius) setFarRadius(parseFloat(parsed.far_radius));
          if (parsed.near_charge) setNearCharge(parseFloat(parsed.near_charge));
          if (parsed.far_charge) setFarCharge(parseFloat(parsed.far_charge));
        } catch { /* ignore */ }
      }
    }
  }

  async function loadActivePromoOffers() {
    try {
      const res = await client.entities.offers.query({
        query: { is_active: true },
        sort: '-created_at',
        limit: 100,
      });
      const active = (res?.data?.items || []).filter((offer: Offer) =>
        isPromoOfferCurrentlyActive(offer)
      );
      setActivePromoOffers(active);

      // Automatically remove a promo if Admin turned it OFF or it expired.
      if (promoApplied && promoOffer && !active.some((offer: Offer) => offer.id === promoOffer.id)) {
        removePromo();
      }
    } catch (error) {
      console.error('Failed to load active promo offers:', error);
      setActivePromoOffers([]);
    }
  }

  async function validatePromoCode() {
    if (!promoCode.trim()) {
      toast.error('Please enter a promo code');
      return;
    }
    setValidatingPromo(true);
    try {
      const res = await client.entities.offers.query({ query: { is_active: true }, limit: 100 });
      const offers = (res?.data?.items || []).filter((offer: Offer) =>
        isPromoOfferCurrentlyActive(offer)
      );
      setActivePromoOffers(offers);
      const matchedOffer = offers.find(
        (offer: Offer) => offer.promo_code.trim().toLowerCase() === promoCode.trim().toLowerCase()
      );
      if (matchedOffer && ((matchedOffer.discount_type || 'percentage') === 'fixed' ? Number(matchedOffer.fixed_discount_amount || 0) > 0 : Number(matchedOffer.discount_percent || 0) > 0)) {
        // Get user's previous orders for usage validation
        let previousOrders: any[] = [];
        try {
          const ordersRes = await axios.get(
            `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/orders/my-orders`,
            {
              params: { session_id: getGuestSessionId() },
              headers: {
                Authorization: `Bearer ${localStorage.getItem('vita_customer_token') || ''}`,
              },
              timeout: 15000,
            },
          );
          previousOrders = ordersRes?.data?.items || [];
        } catch {
          // If we can't check orders (not logged in), allow it - will be validated on backend
        }

        // Check if this is a "first order only" offer
        if (matchedOffer.first_order_only) {
          const completedOrders = previousOrders.filter(
            (o: any) => o.status !== 'cancelled' && o.status !== 'expired'
          );
          if (completedOrders.length > 0) {
            toast.error('This offer is valid for first orders only');
            setPromoApplied(false);
            setPromoDiscount(0);
            setPromoOffer(null);
            setValidatingPromo(false);
            return;
          }
        }

        // Check usage limit per customer (by promo code in order notes)
        const usageLimit = matchedOffer.usage_limit_per_customer ?? 1; // default 1 time
        if (usageLimit > 0 && previousOrders.length > 0) {
          // Count how many times this promo was used by this customer
          const promoCodeUpper = matchedOffer.promo_code.toUpperCase();
          const usageCount = previousOrders.filter((o: any) => {
            const savedPromo = String(o.promo_code || '').toUpperCase();
            const notes = String(o.order_notes || '').toUpperCase();
            return (savedPromo === promoCodeUpper || notes.includes(`PROMO: ${promoCodeUpper}`)) && o.status !== 'cancelled' && o.status !== 'expired';
          }).length;

          if (usageCount >= usageLimit) {
            toast.error(`This offer has already been used${usageLimit === 1 ? '' : ` ${usageLimit} times`}. Limit reached.`);
            setPromoApplied(false);
            setPromoDiscount(0);
            setPromoOffer(null);
            setValidatingPromo(false);
            return;
          }
        }

        const minimumOrder = Number(matchedOffer.minimum_order_amount || 0);
        if (subtotal < minimumOrder) {
          toast.error(`Minimum order for this promo is AED ${minimumOrder.toFixed(2)}`);
          setPromoApplied(false);
          setPromoOffer(null);
          return;
        }

        const isFixed = (matchedOffer.discount_type || 'percentage') === 'fixed';
        const value = isFixed
          ? Number(matchedOffer.fixed_discount_amount || 0)
          : Number(matchedOffer.discount_percent || 0);
        setPromoApplied(true);
        setPromoDiscount(value);
        setPromoOffer(matchedOffer);
        toast.success(isFixed ? `🎉 AED ${value.toFixed(2)} discount applied!` : `🎉 Promo code applied! ${value}% off`);
      } else {
        toast.error('Invalid or expired promo code');
        setPromoApplied(false);
        setPromoDiscount(0);
        setPromoOffer(null);
      }
    } catch {
      toast.error('Failed to validate promo code');
    } finally {
      setValidatingPromo(false);
    }
  }

  function removePromo() {
    setPromoApplied(false);
    setPromoDiscount(0);
    setPromoOffer(null);
    setPromoCode('');
  }

  const subtotal = getCartTotal(cart);
  const originalSubtotal = getCartOriginalTotal(cart);
  const itemDiscountTotal = getCartItemDiscountTotal(cart);
  const deliveryFee = orderType === 'delivery' ? (locationShared ? calculatedDeliveryCharge : deliveryCharge) : 0;
  const rawPromoDiscount = !promoApplied || !promoOffer
    ? 0
    : (promoOffer.discount_type || 'percentage') === 'fixed'
      ? Math.min(subtotal, Number(promoOffer.fixed_discount_amount || promoDiscount || 0))
      : (subtotal * Number(promoOffer.discount_percent || promoDiscount || 0)) / 100;
  const maximumPromoDiscount = Number(promoOffer?.maximum_discount_amount || 0);
  const discountAmount = maximumPromoDiscount > 0
    ? Math.min(rawPromoDiscount, maximumPromoDiscount)
    : rawPromoDiscount;
  // Service fee only applies based on admin setting (pickup/delivery/both)
  const shouldApplyServiceFee = serviceFeeEnabled && (
    serviceFeeAppliesTo === 'both' ||
    (serviceFeeAppliesTo === 'pickup' && orderType === 'pickup') ||
    (serviceFeeAppliesTo === 'delivery' && orderType === 'delivery')
  );
  // Calculate service fee: fixed amount OR percentage of subtotal
  const serviceFee = shouldApplyServiceFee
    ? (serviceFeeType === 'percentage' ? (subtotal * serviceFeeAmount) / 100 : serviceFeeAmount)
    : 0;
  const smallOrderFee = (smallOrderFeeEnabled && subtotal < smallOrderFeeThreshold) ? smallOrderFeeAmount : 0;
  const taxableAmount = Math.max(0, subtotal - discountAmount + deliveryFee + serviceFee + smallOrderFee);
  const taxAmount = taxPercent > 0
    ? vatIncluded
      ? taxableAmount - taxableAmount / (1 + taxPercent / 100)
      : (taxableAmount * taxPercent) / 100
    : 0;
  const taxAddedToTotal = vatIncluded ? 0 : taxAmount;
  const total = subtotal + deliveryFee + serviceFee + smallOrderFee + taxAddedToTotal + tipAmount - discountAmount;

  // Determine available payment methods based on order type
  const availablePaymentMethods: { value: string; label: string; description: string }[] = [];
  if (orderType === 'pickup') {
    if (cashEnabledPickup) availablePaymentMethods.push({ value: 'cash', label: `💵 Cash on Pickup`, description: 'Pay cash when you collect your order' });
    if (cardEnabledPickup) availablePaymentMethods.push({ value: 'card', label: `💳 Card on Pickup`, description: 'Pay by card when you collect' });
  } else {
    if (cashEnabledDelivery) availablePaymentMethods.push({ value: 'cash', label: `💵 Cash on Delivery`, description: 'Pay cash when you receive your order' });
    if (cardEnabledDelivery) availablePaymentMethods.push({ value: 'card', label: `💳 Card on Delivery`, description: 'Pay by card when you receive' });
  }

  // Allowed country codes from admin settings
  const [allowedCountryCodes, setAllowedCountryCodes] = useState<string[]>(['+971']);

  useEffect(() => {
    // Load allowed country codes from backend settings
    async function loadCountryCodes() {
      try {
        const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
        const items = res?.data?.items || [];
        if (items.length > 0) {
          const s = items[0] as any;
          if (s.allowed_country_codes) {
            const codes = s.allowed_country_codes.split(',').map((c: string) => c.trim()).filter(Boolean);
            if (codes.length > 0) setAllowedCountryCodes(codes);
          }
        }
      } catch { /* use default */ }
    }
    loadCountryCodes();
  }, []);

  // Phone validation with admin-configured country codes
  function validatePhone(phoneNumber: string, strict: boolean): string | null {
    const cleaned = phoneNumber.trim().replace(/[\s\-()]/g, '');
    
    if (!cleaned) {
      return 'Please enter your phone number';
    }

    if (strict) {
      // For delivery: must start with an allowed country code + have enough digits
      const hasValidCode = allowedCountryCodes.some(code => {
        const codeClean = code.replace(/[\s\-()]/g, '');
        // Check with + prefix or 00 prefix
        const withPlus = cleaned.startsWith(codeClean);
        const with00 = cleaned.startsWith('00' + codeClean.replace('+', ''));
        // Also allow local format (e.g., 05X for UAE)
        if (codeClean === '+971') {
          return withPlus || with00 || /^05[0-9]\d{7}$/.test(cleaned);
        }
        return withPlus || with00;
      });

      if (!hasValidCode) {
        return `Please enter a valid phone number with allowed country code (${allowedCountryCodes.join(', ')})`;
      }

      // Check minimum digits after country code
      const digitsOnly = cleaned.replace(/\D/g, '');
      if (digitsOnly.length < 9) {
        return 'Phone number is too short. Please enter a complete number.';
      }
    } else {
      // For pickup: minimum 9 digits (allows any number)
      const digitsOnly = cleaned.replace(/\D/g, '');
      if (digitsOnly.length < 9) {
        return 'Please enter a valid phone number (minimum 9 digits)';
      }
    }
    
    return null;
  }

  function validateForm(): Record<string, string> {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Please enter your name';
    }
    
    // For delivery: strict validation with allowed country codes. For pickup: minimum 9 digits
    const phoneError = validatePhone(phone, orderType === 'delivery');
    if (phoneError) {
      newErrors.phone = phoneError;
    }
    if (orderType === 'delivery' && !locationShared) {
      newErrors.location = 'Please select your delivery location on the map';
    }
    if (orderType === 'delivery' && deliveryZoneError) {
      newErrors.location = deliveryZoneError;
    }
    // CRITICAL: Block delivery orders with zero delivery charge (pin not in valid zone)
    if (orderType === 'delivery' && locationShared && calculatedDeliveryCharge <= 0 && !deliveryZoneError) {
      newErrors.location = 'Unable to calculate delivery charge. Please re-select your location on the map.';
    }
    if (availablePaymentMethods.length === 0) {
      newErrors.payment = 'No payment methods available for this order type';
    }
    if (cart.length === 0) {
      newErrors.cart = 'Your cart is empty — please add items first';
    }
    if (!isLoggedIn) {
      newErrors.auth = 'Please login to place your order';
    }

    return newErrors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Prevent duplicate submissions
    if (submittingRef.current || loading) return;

    // Block if shop is closed
    if (shopClosed) {
      toast.error(shopClosedMessage || 'Restaurant is currently closed.');
      return;
    }

    if (orderType === 'delivery' && !deliveryAvailableNow) {
      toast.error(
        `Delivery is available from ${formatScheduleTime(deliveryStartTime)} to ${formatScheduleTime(deliveryEndTime)}. Please select Pickup.`,
      );
      setOrderType('pickup');
      setShowMap(false);
      return;
    }

    // Block if not logged in
    if (!isLoggedIn) {
      toast.error('Please login to place your order.');
      return;
    }

    const validationErrors = validateForm();
    setErrors(validationErrors);
    setShowErrors(true);

    if (Object.keys(validationErrors).length > 0) {
      // Show summary toast
      const errorCount = Object.keys(validationErrors).length;
      toast.error(`Please fix ${errorCount} ${errorCount === 1 ? 'issue' : 'issues'} before placing your order`);

      // Scroll to first error field
      const errorFieldIds: Record<string, string> = {
        name: 'name',
        phone: 'phone',
        location: 'delivery-map',
        payment: 'payment-section',
        cart: 'order-summary',
        auth: 'auth-section',
      };
      const firstErrorKey = Object.keys(validationErrors)[0];
      const elementId = errorFieldIds[firstErrorKey];
      if (elementId) {
        const el = document.getElementById(elementId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Handle auth redirect
      if (validationErrors.auth) {
        navigate('/account');
      }
      return;
    }

    setLoading(true);
    submittingRef.current = true;
    try {
      const itemsData = cart.map(item => ({
        menu_item_id: item.menuItem.id,
        name: item.menuItem.name,
        size: item.size,
        quantity: item.quantity,
        extras: item.extras.map(e => e.name),
        price: item.totalPrice,
        original_price: Number(item.originalTotalPrice ?? item.totalPrice),
        item_discount_amount: Number(item.itemDiscountAmount || 0),
        item_discount_label: item.itemDiscountLabel || '',
      }));

      // Combine notes with car info or delivery address
      const noteParts = [notes];
      if (orderType === 'pickup' && carInfo) {
        noteParts.push(`Car: ${carInfo}`);
      }
      if (orderType === 'delivery') {
        if (deliveryAddress) noteParts.push(`Delivery Address: ${deliveryAddress}`);
        if (deliveryFee > 0) noteParts.push(`Delivery Fee: AED ${deliveryFee.toFixed(2)}`);
        if (zoneName) noteParts.push(`Zone: ${zoneName}`);
        if (customerLat && customerLng) {
          noteParts.push(`GPS: ${customerLat.toFixed(6)},${customerLng.toFixed(6)}`);
        }
      }
      if (promoApplied && promoOffer) {
        const promoLabel = (promoOffer.discount_type || 'percentage') === 'fixed'
          ? `AED ${Number(promoOffer.fixed_discount_amount || promoDiscount).toFixed(2)}`
          : `${Number(promoOffer.discount_percent || promoDiscount)}%`;
        noteParts.push(`Promo: ${promoOffer.promo_code} (-${promoLabel})`);
      }
      noteParts.push(`Order Type: ${orderType === 'delivery' ? 'Delivery' : 'Pickup'}`);
      const fullNotes = noteParts.filter(Boolean).join(' | ');

      const response = await axios.post(
        `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/orders/place`,
        {
          session_id: getGuestSessionId(),
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          order_notes: fullNotes,
          payment_method:
            paymentMethod === 'cash'
              ? orderType === 'delivery'
                ? 'Cash on Delivery'
                : 'Cash on Pickup'
              : orderType === 'delivery'
                ? 'Card on Delivery'
                : 'Card on Pickup',
          total_amount: Number(total.toFixed(2)),
          subtotal_amount: Number(subtotal.toFixed(2)),
          promo_code: promoApplied && promoOffer ? promoOffer.promo_code : '',
          discount_type: promoApplied && promoOffer ? (promoOffer.discount_type || 'percentage') : '',
          discount_percent: promoApplied && promoOffer && (promoOffer.discount_type || 'percentage') !== 'fixed' ? Number(promoOffer.discount_percent || 0) : 0,
          discount_amount: Number(discountAmount.toFixed(2)),
          service_fee: Number(serviceFee.toFixed(2)),
          small_order_fee: Number(smallOrderFee.toFixed(2)),
          delivery_charge: orderType === 'delivery' ? Number(deliveryFee.toFixed(2)) : 0,
          tax_amount: Number(taxAmount.toFixed(2)),
          tip_amount: Number(tipAmount.toFixed(2)),
          tip_type: tipAmount > 0 ? (orderType === 'delivery' ? 'rider' : 'shop') : '',
          items_json: JSON.stringify(itemsData),
          order_type: orderType,
          customer_lat: orderType === 'delivery' ? customerLat : null,
          customer_lng: orderType === 'delivery' ? customerLng : null,
          customer_address: orderType === 'delivery' ? deliveryAddress.trim() : '',
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('vita_customer_token') || ''}`,
          },
          timeout: 30000,
        },
      );

      const orderId = response?.data?.order_id;
      
      // Save customer info for next order auto-fill
      localStorage.setItem('vita_customer_name', name.trim());
      localStorage.setItem('vita_customer_phone', phone.trim());
      
      clearCart();
      window.dispatchEvent(new Event('cart-updated'));
      toast.success(`Order #${orderId} placed successfully!`);
      navigate('/order-confirmation', { state: { orderId } });
    } catch (e: any) {
      const errorMsg = e?.data?.detail || e?.response?.data?.detail || e?.message || 'Failed to place order. Please try again.';
      toast.error(errorMsg);
      console.error('Order placement failed:', e);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-white text-2xl font-bold mb-6">{t('checkout.title')}</h1>

        {!isLoggedIn && (
          <div id="auth-section" className="mb-6 p-4 rounded-xl bg-red-600/10 border border-red-600/30">
            <p className="text-red-400 text-sm mb-3">Please login to place your order</p>
            <Button
              onClick={() => navigate('/account')}
              className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
            >
              Login / Sign Up
            </Button>
          </div>
        )}

        {/* Shop Closed Banner */}
        {shopClosed && (
          <div className="mb-6 p-4 rounded-xl bg-orange-600/10 border border-orange-600/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🚫</span>
              <h3 className="text-orange-400 font-bold text-lg">Restaurant Closed</h3>
            </div>
            <p className="text-orange-300 text-sm">{shopClosedMessage}</p>
          </div>
        )}

        {/* Busy Warning (not blocking) */}
        {!shopClosed && shopClosedMessage && (
          <div className="mb-6 p-3 rounded-xl bg-yellow-600/10 border border-yellow-600/30">
            <p className="text-yellow-400 text-sm">⚠️ {shopClosedMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Type Selection */}
          {deliveryEnabled && (
            <div>
              <Label className="text-gray-300 mb-3 block">{t('checkout.order_type')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setOrderType('pickup'); setShowMap(false); }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 ${
                    orderType === 'pickup'
                      ? 'border-red-600 bg-red-600/10'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                  }`}
                >
                  <Car className={`w-6 h-6 ${orderType === 'pickup' ? 'text-red-400' : 'text-gray-400'}`} />
                  <span className={`font-medium ${orderType === 'pickup' ? 'text-white' : 'text-gray-400'}`}>{t('checkout.pickup')}</span>
                  <span className="text-gray-500 text-xs">Collect from store</span>
                </button>
                <button
                  type="button"
                  disabled={!deliveryAvailableNow}
                  onClick={() => {
                    if (!deliveryAvailableNow) return;
                    setOrderType('delivery');
                    setShowMap(true);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    !deliveryAvailableNow
                      ? 'border-gray-800 bg-gray-900/60 opacity-60 cursor-not-allowed'
                      : 'cursor-pointer ' + (
                    orderType === 'delivery'
                      ? 'border-red-600 bg-red-600/10'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                      )
                  }`}
                >
                  <MapPin className={`w-6 h-6 ${orderType === 'delivery' ? 'text-red-400' : 'text-gray-400'}`} />
                  <span className={`font-medium ${orderType === 'delivery' ? 'text-white' : 'text-gray-400'}`}>{t('checkout.delivery')}</span>
                  <span className="text-gray-500 text-xs">
                    {deliveryAvailableNow
                      ? 'To your location'
                      : `Opens ${formatScheduleTime(deliveryStartTime)}`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {!shopClosed && deliveryEnabled && deliveryScheduleEnabled && (
            <div className={`rounded-xl border p-3 ${
              deliveryAvailableNow
                ? 'border-green-700/40 bg-green-900/10 text-green-300'
                : 'border-yellow-700/40 bg-yellow-900/10 text-yellow-300'
            }`}>
              <p className="text-sm">
                Delivery hours: {formatScheduleTime(deliveryStartTime)} – {formatScheduleTime(deliveryEndTime)}
              </p>
              {!deliveryAvailableNow && (
                <p className="text-xs mt-1">
                  Delivery is closed now. Pickup is available while the shop is open.
                </p>
              )}
            </div>
          )}

          {/* Customer Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-gray-300">{t('checkout.your_name')} *</Label>
              <Input
                id="name"
                value={name}
                onChange={e => { setName(e.target.value); if (showErrors) setErrors(prev => { const n = {...prev}; delete n.name; return n; }); }}
                placeholder="Your full name"
                className={`bg-gray-900 border-gray-700 text-white mt-1 ${showErrors && errors.name ? 'border-red-500' : ''}`}
                required
              />
              {showErrors && errors.name && <p className="text-red-400 text-xs mt-1">⚠️ {errors.name}</p>}
            </div>
            <div>
              <Label htmlFor="phone" className="text-gray-300">{t('checkout.phone')} *</Label>
              <Input
                id="phone"
                value={phone}
                onChange={e => { setPhone(e.target.value); if (showErrors) setErrors(prev => { const n = {...prev}; delete n.phone; return n; }); }}
                placeholder={`${allowedCountryCodes[0] || '+971'} XX XXX XXXX`}
                className={`bg-gray-900 border-gray-700 text-white mt-1 ${showErrors && errors.phone ? 'border-red-500' : ''}`}
                required
              />
              {orderType === 'delivery' && (
                <p className="text-gray-500 text-xs mt-1">
                  Valid number required for delivery ({allowedCountryCodes.join(', ')})
                </p>
              )}
              {showErrors && errors.phone && <p className="text-red-400 text-xs mt-1">⚠️ {errors.phone}</p>}
            </div>

            {/* Delivery Map Location */}
            {orderType === 'delivery' && (
              <>
                <div id="delivery-map">
                  <Label className="text-gray-300 mb-2 block">Select Delivery Location *</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-gray-500 text-xs flex-1">
                      Tap on the map or drag the pin to your exact location
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={gettingLocation}
                      onClick={() => {
                        if (!navigator.geolocation) {
                          toast.error('Your browser does not support location services. Please tap on the map to select your location.');
                          return;
                        }
                        setGettingLocation(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const { latitude, longitude } = pos.coords;
                            // Always move pin back to GPS coordinates
                            if (markerRef.current) {
                              markerRef.current.setLatLng([latitude, longitude]);
                            }
                            if (mapInstanceRef.current) {
                              mapInstanceRef.current.setView([latitude, longitude], 15);
                            }
                            // Force recalculate delivery charge immediately
                            handleLocationSelected(latitude, longitude);
                            setLocationPermissionDenied(false);
                            setGettingLocation(false);
                            toast.success('Pin moved to your location!');
                          },
                          (err) => {
                            setGettingLocation(false);
                            if (err.code === err.PERMISSION_DENIED) {
                              setLocationPermissionDenied(true);
                              toast.warning('Location permission denied. You can tap on the map to select your delivery location manually.');
                            } else if (err.code === err.TIMEOUT) {
                              toast.warning('Could not get your location. Please tap on the map to select your location.');
                            } else {
                              toast.warning('Could not get your location. Please tap on the map to select your location.');
                            }
                          },
                          { enableHighAccuracy: true, timeout: 15000 }
                        );
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-pointer disabled:opacity-50"
                    >
                      <Navigation className="w-3 h-3 mr-1" /> {gettingLocation ? 'Getting...' : 'My Location'}
                    </Button>
                  </div>
                  <div
                    ref={mapRef}
                    className="w-full h-[250px] rounded-xl overflow-hidden border border-gray-700"
                    style={{ zIndex: 1 }}
                  />
                  {/* Zone legend */}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    {deliveryZones.length > 0 ? (
                      deliveryZones.map((z, i) => (
                        <span key={i} className={`${i === 0 ? 'text-green-400' : i === 1 ? 'text-yellow-400' : 'text-orange-400'}`}>
                          ● {z.zone_name} ({z.min_distance_km}-{z.max_distance_km} km = AED {z.charge})
                        </span>
                      ))
                    ) : (
                      <>
                        <span className="text-green-400">● Near zone (AED {nearCharge})</span>
                        <span className="text-yellow-400">● Far zone (AED {farCharge})</span>
                      </>
                    )}
                  </div>
                  {/* Location permission denied - friendly guidance */}
                  {locationPermissionDenied && !locationShared && (
                    <div className="mt-2 p-3 rounded-lg bg-yellow-600/10 border border-yellow-600/30">
                      <p className="text-yellow-300 text-sm font-medium mb-1">📍 Location access not available</p>
                      <p className="text-yellow-200/70 text-xs mb-2">
                        No problem! Simply tap anywhere on the map or drag the pin to set your delivery location.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (!navigator.geolocation) return;
                          setGettingLocation(true);
                          navigator.geolocation.getCurrentPosition(
                            (pos) => {
                              const { latitude, longitude } = pos.coords;
                              if (markerRef.current) {
                                markerRef.current.setLatLng([latitude, longitude]);
                              }
                              if (mapInstanceRef.current) {
                                mapInstanceRef.current.setView([latitude, longitude], 15);
                              }
                              handleLocationSelected(latitude, longitude);
                              setLocationPermissionDenied(false);
                              setGettingLocation(false);
                              toast.success('Pin moved to your location!');
                            },
                            () => {
                              setGettingLocation(false);
                              toast.warning('Still no access. Please tap on the map to select your location.');
                            },
                            { enableHighAccuracy: true, timeout: 10000 }
                          );
                        }}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs cursor-pointer"
                      >
                        <Navigation className="w-3 h-3 mr-1" /> Try Again
                      </Button>
                    </div>
                  )}
                  {/* Getting location indicator */}
                  {gettingLocation && !locationShared && (
                    <div className="mt-2 flex items-center gap-2 text-blue-400 text-sm">
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span>Getting your location...</span>
                    </div>
                  )}
                  {locationShared && !deliveryZoneError && (
                    <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      <span>Location selected{zoneName ? ` (${zoneName})` : ''} — Delivery fee: AED {calculatedDeliveryCharge}</span>
                    </div>
                  )}
                  {deliveryZoneError && (
                    <div className="mt-2 p-3 rounded-lg bg-red-600/10 border border-red-600/30">
                      <p className="text-red-400 text-sm">❌ {deliveryZoneError}</p>
                    </div>
                  )}
                  {showErrors && errors.location && !deliveryZoneError && (
                    <p className="text-red-400 text-xs mt-2">⚠️ {errors.location}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="address" className="text-gray-300">Delivery Notes (building, floor, etc.)</Label>
                  <Textarea
                    id="address"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder="Building name, floor, apartment number..."
                    className="bg-gray-900 border-gray-700 text-white mt-1"
                  />
                  <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Estimated delivery: {estimatedDeliveryTime}
                  </p>
                </div>
              </>
            )}

            {/* Car Info (only for pickup) */}
            {orderType === 'pickup' && (
              <div>
                <Label htmlFor="carInfo" className="text-gray-300">Car Number & Color (optional)</Label>
                <Input
                  id="carInfo"
                  value={carInfo}
                  onChange={e => setCarInfo(e.target.value)}
                  placeholder="e.g. White Toyota ABC 1234"
                  className="bg-gray-900 border-gray-700 text-white mt-1"
                />
                <p className="text-gray-500 text-xs mt-1">Helps us identify you for pickup</p>
              </div>
            )}

            <div>
              <Label htmlFor="notes" className="text-gray-300">{t('checkout.order_notes')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special instructions..."
                className="bg-gray-900 border-gray-700 text-white mt-1"
              />
            </div>
          </div>

          {/* Promo Code — hidden until Admin has a currently active promo-code offer */}
          {activePromoOffers.length > 0 && (
            <div>
              <Label className="text-gray-300 mb-2 block">{t('checkout.promo_code')}</Label>
              {promoApplied ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-green-600/10 border border-green-600/30">
                  <Tag className="w-5 h-5 text-green-400" />
                  <div className="flex-1">
                    <p className="text-green-400 font-medium text-sm">{promoOffer?.promo_code} applied!</p>
                    <p className="text-green-400/70 text-xs">
                      {(promoOffer?.discount_type || 'percentage') === 'fixed'
                        ? `AED ${Number(promoOffer?.fixed_discount_amount || promoDiscount).toFixed(2)} discount`
                        : `${Number(promoOffer?.discount_percent || promoDiscount)}% discount`}
                      {' — '}saving AED {discountAmount.toFixed(2)}
                    </p>
                  </div>
                  <button type="button" onClick={removePromo} className="text-gray-400 text-xs hover:text-red-400 cursor-pointer">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value)}
                    placeholder="Enter promo code"
                    className="bg-gray-900 border-gray-700 text-white flex-1"
                  />
                  <Button
                    type="button"
                    onClick={validatePromoCode}
                    disabled={validatingPromo}
                    className="bg-gray-800 hover:bg-gray-700 text-white cursor-pointer"
                  >
                    {validatingPromo ? '...' : t('checkout.apply')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tip Section */}
          <div>
            <Label className="text-gray-300 mb-3 block">
              💝 Add a Tip {orderType === 'delivery' ? '(goes to rider)' : '(goes to shop staff)'}
            </Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {[5, 10, 15].map(amount => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => { setTipAmount(amount); setShowCustomTip(false); setCustomTip(''); }}
                  className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                    tipAmount === amount && !showCustomTip
                      ? 'border-green-500 bg-green-600/20 text-green-400'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  AED {amount}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setShowCustomTip(true); setTipAmount(0); }}
                className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                  showCustomTip
                    ? 'border-green-500 bg-green-600/20 text-green-400'
                    : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'
                }`}
              >
                Custom
              </button>
              {tipAmount > 0 && (
                <button
                  type="button"
                  onClick={() => { setTipAmount(0); setShowCustomTip(false); setCustomTip(''); }}
                  className="px-3 py-2.5 rounded-lg border-2 border-gray-700 bg-gray-900 text-gray-500 text-sm cursor-pointer hover:border-red-600 hover:text-red-400"
                >
                  No Tip
                </button>
              )}
            </div>
            {showCustomTip && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">AED</span>
                <Input
                  type="number"
                  min="1"
                  max="500"
                  value={customTip}
                  onChange={e => {
                    setCustomTip(e.target.value);
                    const val = parseFloat(e.target.value);
                    setTipAmount(val > 0 ? val : 0);
                  }}
                  placeholder="Enter amount"
                  className="bg-gray-900 border-gray-700 text-white w-32"
                />
              </div>
            )}
            {tipAmount > 0 && (
              <p className="text-green-400/80 text-xs mt-2">
                ✓ AED {tipAmount.toFixed(0)} tip will go to {orderType === 'delivery' ? 'your delivery rider' : 'the shop staff'}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div id="payment-section">
            <Label className="text-gray-300 mb-3 block">{t('checkout.payment_method')}</Label>
            {availablePaymentMethods.length === 0 ? (
              <div className="p-4 rounded-xl bg-red-600/10 border border-red-600/30">
                <p className="text-red-400 text-sm">No payment methods available for {orderType} orders. Please contact the restaurant.</p>
              </div>
            ) : (
              <RadioGroup value={availablePaymentMethods.some(m => m.value === paymentMethod) ? paymentMethod : availablePaymentMethods[0]?.value || 'cash'} onValueChange={setPaymentMethod} className="space-y-3">
                {availablePaymentMethods.map(method => (
                  <label key={method.value} className="flex items-center gap-3 p-4 rounded-xl border border-gray-700 hover:border-gray-500 cursor-pointer">
                    <RadioGroupItem value={method.value} id={method.value} />
                    <div>
                      <div className="text-white font-medium">{method.label}</div>
                      <div className="text-gray-500 text-sm">{method.description}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
          </div>

          {/* Order Summary */}
          <div id="order-summary" className={`p-4 rounded-xl bg-gray-900 border ${showErrors && errors.cart ? 'border-red-500' : 'border-gray-800'}`}>
            <h3 className="text-white font-semibold mb-3">Order Summary</h3>
            {showErrors && errors.cart && <p className="text-red-400 text-xs mb-3">⚠️ {errors.cart}</p>}
            {cart.map(item => (
              <div key={item.id} className="flex justify-between text-sm py-1.5">
                <span className="text-gray-400">
                  {item.quantity}x {item.menuItem.name} ({item.size})
                  {item.extras.length > 0 && (
                    <span className="text-gray-600 text-xs block">
                      + {item.extras.map(e => e.name).join(', ')}
                    </span>
                  )}
                </span>
                <div className="text-right">
                  {Number(item.itemDiscountAmount || 0) > 0 && (
                    <span className="text-gray-600 text-xs line-through block">
                      AED {Number(item.originalTotalPrice ?? item.totalPrice).toFixed(2)}
                    </span>
                  )}
                  <span className={Number(item.itemDiscountAmount || 0) > 0 ? 'text-green-400' : 'text-gray-300'}>
                    AED {item.totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t border-gray-700 mt-3 pt-3 space-y-1.5">
              {itemDiscountTotal > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Original Subtotal</span>
                    <span className="text-gray-500 line-through">AED {originalSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-green-400">Item Discounts</span>
                    <span className="text-green-400">-AED {itemDiscountTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-300">AED {subtotal.toFixed(2)}</span>
              </div>
              {orderType === 'delivery' && deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Delivery Fee</span>
                  <span className="text-gray-300">AED {deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {serviceFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Service Fee</span>
                  <span className="text-gray-300">AED {serviceFee.toFixed(2)}</span>
                </div>
              )}
              {smallOrderFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-yellow-400">Small Order Fee</span>
                  <span className="text-yellow-400">AED {smallOrderFee.toFixed(2)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {vatIncluded ? 'VAT (Incl.)' : `VAT / Tax (${taxPercent.toFixed(2)}%)`}
                  </span>
                  <span className="text-gray-300">AED {taxAmount.toFixed(2)}</span>
                </div>
              )}
              {tipAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Tip ({orderType === 'delivery' ? 'Rider' : 'Shop'})</span>
                  <span className="text-green-400">AED {tipAmount.toFixed(2)}</span>
                </div>
              )}
              {promoApplied && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Discount ({(promoOffer?.discount_type || 'percentage') === 'fixed' ? `AED ${Number(promoOffer?.fixed_discount_amount || promoDiscount).toFixed(2)}` : `${Number(promoOffer?.discount_percent || promoDiscount)}%`})</span>
                  <span className="text-green-400">-AED {discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-white font-semibold">Total</span>
                <span className="text-red-400 font-bold text-lg">AED {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {showErrors && Object.keys(errors).length > 0 && (
            <div className="p-3 rounded-xl bg-red-600/10 border border-red-500/30 mb-3">
              <p className="text-red-400 text-sm font-medium mb-1">⚠️ Please fix the following:</p>
              <ul className="space-y-0.5">
                {Object.values(errors).map((err, i) => (
                  <li key={i} className="text-red-400/80 text-xs">• {err}</li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || shopClosed || !isLoggedIn || (orderType === 'delivery' && (!deliveryAvailableNow || !!deliveryZoneError || !locationShared || calculatedDeliveryCharge <= 0))}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('checkout.placing') : `${t('checkout.place_order')} — ${t('common.aed')} ${total.toFixed(2)}`}
          </Button>
        </form>
      </div>
    </CustomerLayout>
  );
}
