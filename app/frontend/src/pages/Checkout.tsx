import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem, } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Car, CheckCircle, MapPin, Navigation, Tag, } from 'lucide-react';
import CustomerLayout from '@/components/CustomerLayout';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import { client, CartItem, Offer, } from '@/lib/api';
import { clearCart, getCart, getCartTotal, } from '@/lib/cart-store';
import { customerAuthApi } from '@/lib/customer-auth';
import { getAPIBaseURL } from '@/lib/config';
import { useTranslation } from '@/lib/i18n';
// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});
type CustomerRequestMethod = 'GET' | 'POST';
async function customerApiRequest<T>(url: string, method: CustomerRequestMethod, data?: unknown): Promise<T> {
    const token = customerAuthApi.getToken();
    if (!token) {
        throw new Error(text.loginAgain);
    }
    const response = await axios.request<T>({
        url: `${getAPIBaseURL()}${url}`,
        method,
        data,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
    return response.data;
}
export default function Checkout() {
    const navigate = useNavigate();
    const { t, language, dir } = useTranslation();
    const text = {
        en: { custom: 'Custom', noTip: 'No Tip', addTip: 'Add a Tip', riderTip: 'goes to rider', shopTip: 'goes to shop staff', enterAmount: 'Enter amount', remove: 'Remove', orderSummary: 'Order Summary', pleaseFix: 'Please fix the following:', deliveryLocation: 'Delivery Location', selectMap: 'Select location on map', useLocation: 'Use My Location', deliveryTime: 'Estimated delivery time', contactRestaurant: 'Please contact the restaurant.', noPayment: 'No payment methods available for this order type.', promoSuccess: 'Promo code applied!', promoFailed: 'Failed to validate promo code', firstOrderOnly: 'This offer is valid for first orders only', loginAgain: 'Please login again', phoneShort: 'Phone number is too short. Please enter a complete number.', validPhone: 'Please enter a valid phone number', calculateDelivery: 'Unable to calculate delivery charge. Please select your location again.', cartEmpty: 'Your cart is empty — please add items first', issue: 'Please fix the highlighted fields before placing your order', orderPlaced: 'Order placed successfully!', failedOrder: 'Failed to place order. Please try again.', dragMarker: 'Drag me to your location', deliveryUnavailable: 'Delivery is not available in your area', tipGoes: 'tip will go to', rider: 'your delivery rider', staff: 'the shop staff', subtotal: 'Subtotal', total: 'Total', tip: 'Tip', serviceFee: 'Service Fee', smallOrderFee: 'Small Order Fee', discount: 'Discount' },
        ar: { custom: 'مخصص', noTip: 'بدون إكرامية', addTip: 'أضف إكرامية', riderTip: 'تذهب للسائق', shopTip: 'تذهب لموظفي المطعم', enterAmount: 'أدخل المبلغ', remove: 'إزالة', orderSummary: 'ملخص الطلب', pleaseFix: 'يرجى تصحيح ما يلي:', deliveryLocation: 'موقع التوصيل', selectMap: 'حدد الموقع على الخريطة', useLocation: 'استخدم موقعي', deliveryTime: 'وقت التوصيل المتوقع', contactRestaurant: 'يرجى التواصل مع المطعم.', noPayment: 'لا توجد طريقة دفع متاحة لهذا النوع من الطلبات.', promoSuccess: 'تم تطبيق كود الخصم!', promoFailed: 'فشل التحقق من كود الخصم', firstOrderOnly: 'هذا العرض صالح للطلب الأول فقط', loginAgain: 'يرجى تسجيل الدخول مرة أخرى', phoneShort: 'رقم الهاتف قصير. أدخل الرقم كاملاً.', validPhone: 'يرجى إدخال رقم هاتف صحيح', calculateDelivery: 'تعذر حساب رسوم التوصيل. اختر موقعك مرة أخرى.', cartEmpty: 'السلة فارغة — أضف أصنافاً أولاً', issue: 'يرجى تصحيح الحقول المحددة قبل تقديم الطلب', orderPlaced: 'تم تقديم الطلب بنجاح!', failedOrder: 'فشل تقديم الطلب. حاول مرة أخرى.', dragMarker: 'اسحب العلامة إلى موقعك', deliveryUnavailable: 'التوصيل غير متاح في منطقتك', tipGoes: 'ستذهب الإكرامية إلى', rider: 'سائق التوصيل', staff: 'موظفي المطعم', subtotal: 'المجموع الفرعي', total: 'المجموع', tip: 'إكرامية', serviceFee: 'رسوم الخدمة', smallOrderFee: 'رسوم الطلب الصغير', discount: 'خصم' },
        ur: { custom: 'اپنی رقم', noTip: 'ٹپ نہیں', addTip: 'ٹپ شامل کریں', riderTip: 'رائیڈر کو جائے گی', shopTip: 'دکان کے عملے کو جائے گی', enterAmount: 'رقم درج کریں', remove: 'ہٹائیں', orderSummary: 'آرڈر کا خلاصہ', pleaseFix: 'یہ چیزیں درست کریں:', deliveryLocation: 'ڈیلیوری مقام', selectMap: 'نقشے پر مقام منتخب کریں', useLocation: 'میرا مقام استعمال کریں', deliveryTime: 'متوقع ڈیلیوری وقت', contactRestaurant: 'ریستوراں سے رابطہ کریں۔', noPayment: 'اس آرڈر کے لیے ادائیگی کا کوئی طریقہ دستیاب نہیں۔', promoSuccess: 'پرومو کوڈ لاگو ہو گیا!', promoFailed: 'پرومو کوڈ چیک نہیں ہو سکا', firstOrderOnly: 'یہ آفر صرف پہلے آرڈر کے لیے ہے', loginAgain: 'دوبارہ لاگ اِن کریں', phoneShort: 'فون نمبر چھوٹا ہے۔ مکمل نمبر درج کریں۔', validPhone: 'درست فون نمبر درج کریں', calculateDelivery: 'ڈیلیوری چارج معلوم نہیں ہو سکا۔ مقام دوبارہ منتخب کریں۔', cartEmpty: 'کارٹ خالی ہے — پہلے آئٹمز شامل کریں', issue: 'آرڈر دینے سے پہلے نشان زدہ خانے درست کریں', orderPlaced: 'آرڈر کامیابی سے دے دیا گیا!', failedOrder: 'آرڈر نہیں ہو سکا۔ دوبارہ کوشش کریں۔', dragMarker: 'مارکر اپنے مقام پر لے جائیں', deliveryUnavailable: 'آپ کے علاقے میں ڈیلیوری دستیاب نہیں', tipGoes: 'ٹپ جائے گی', rider: 'آپ کے ڈیلیوری رائیڈر کو', staff: 'دکان کے عملے کو', subtotal: 'ذیلی کل', total: 'کل', tip: 'ٹپ', serviceFee: 'سروس فیس', smallOrderFee: 'چھوٹے آرڈر کی فیس', discount: 'رعایت' },
    }[language];
    const { customer, isLoggedIn: customerLoggedIn, loading: authLoading, } = useCustomerAuth();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(false);
    const submittingRef = useRef(false);
    const [name, setName] = useState(() => localStorage.getItem('vita_customer_name') || '');
    const [phone, setPhone] = useState(() => localStorage.getItem('vita_customer_phone') || '');
    const [carInfo, setCarInfo] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
    const [deliveryAddress, setDeliveryAddress,] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showErrors, setShowErrors] = useState(false);
    // Fee settings
    const [serviceFeeEnabled, setServiceFeeEnabled,] = useState(false);
    const [serviceFeeAmount, setServiceFeeAmount,] = useState(0);
    const [serviceFeeType, setServiceFeeType,] = useState<'fixed' | 'percentage'>('fixed');
    const [serviceFeeAppliesTo, setServiceFeeAppliesTo,] = useState<'pickup' | 'delivery' | 'both'>('both');
    const [smallOrderFeeEnabled, setSmallOrderFeeEnabled,] = useState(false);
    const [smallOrderFeeAmount, setSmallOrderFeeAmount,] = useState(0);
    const [smallOrderFeeThreshold, setSmallOrderFeeThreshold,] = useState(20);
    // Payment settings
    const [cashEnabledPickup, setCashEnabledPickup,] = useState(true);
    const [cardEnabledPickup, setCardEnabledPickup,] = useState(true);
    const [cashEnabledDelivery, setCashEnabledDelivery,] = useState(true);
    const [cardEnabledDelivery, setCardEnabledDelivery,] = useState(true);
    // Delivery settings
    const [deliveryEnabled, setDeliveryEnabled,] = useState(false);
    const [deliveryCharge, setDeliveryCharge,] = useState(0);
    const [estimatedDeliveryTime, setEstimatedDeliveryTime,] = useState('30-45 min');
    // Delivery zone settings
    const [restaurantLat, setRestaurantLat,] = useState(25.2747);
    const [restaurantLng, setRestaurantLng,] = useState(56.345);
    const [nearRadius, setNearRadius] = useState(5);
    const [farRadius, setFarRadius] = useState(15);
    const [nearCharge, setNearCharge] = useState(5);
    const [farCharge, setFarCharge] = useState(15);
    const [zoneName, setZoneName] = useState('');
    const [deliveryZones, setDeliveryZones,] = useState<{
        zone_name: string;
        min_distance_km: number;
        max_distance_km: number;
        charge: number;
    }[]>([]);
    // Tip
    const [tipAmount, setTipAmount] = useState(0);
    const [customTip, setCustomTip] = useState('');
    const [showCustomTip, setShowCustomTip,] = useState(false);
    // Promo code
    const [promoCode, setPromoCode] = useState('');
    const [promoApplied, setPromoApplied,] = useState(false);
    const [promoDiscount, setPromoDiscount,] = useState(0);
    const [promoOffer, setPromoOffer] = useState<Offer | null>(null);
    const [validatingPromo, setValidatingPromo,] = useState(false);
    // Shop status
    const [shopClosed, setShopClosed] = useState(false);
    const [shopClosedMessage, setShopClosedMessage,] = useState('');
    // GPS and map
    const [customerLat, setCustomerLat] = useState<number | null>(null);
    const [customerLng, setCustomerLng] = useState<number | null>(null);
    const [locationShared, setLocationShared,] = useState(false);
    const [showMap, setShowMap] = useState(false);
    const [deliveryZoneError, setDeliveryZoneError,] = useState('');
    const [calculatedDeliveryCharge, setCalculatedDeliveryCharge,] = useState(0);
    const [locationPermissionDenied, setLocationPermissionDenied,] = useState(false);
    const [gettingLocation, setGettingLocation,] = useState(false);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const [allowedCountryCodes, setAllowedCountryCodes,] = useState<string[]>(['+971']);
    useEffect(() => {
        setCart(getCart());
        void loadDeliverySettings();
    }, []);
    // Fill name and mobile from customer PIN account
    useEffect(() => {
        if (!customer) {
            return;
        }
        setName(customer.name || '');
        setPhone(customer.phone || '');
    }, [customer]);
    // Auto-select payment method
    useEffect(() => {
        const methods = orderType === 'pickup'
            ? [
                cashEnabledPickup &&
                    'cash',
                cardEnabledPickup &&
                    'card',
            ].filter(Boolean)
            : [
                cashEnabledDelivery &&
                    'cash',
                cardEnabledDelivery &&
                    'card',
            ].filter(Boolean);
        if (methods.length > 0 &&
            !methods.includes(paymentMethod)) {
            setPaymentMethod(methods[0] as string);
        }
    }, [
        orderType,
        cashEnabledPickup,
        cardEnabledPickup,
        cashEnabledDelivery,
        cardEnabledDelivery,
        paymentMethod,
    ]);
    useEffect(() => {
        if (showMap &&
            !mapInstanceRef.current) {
            const timer = window.setTimeout(() => {
                if (mapRef.current &&
                    !mapInstanceRef.current) {
                    initMap();
                }
            }, 100);
            return () => window.clearTimeout(timer);
        }
        if (!showMap &&
            mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    }, [showMap]);
    useEffect(() => {
        async function loadCountryCodes() {
            try {
                const response = await client.entities.restaurant_settings.query({
                    query: {},
                    limit: 1,
                });
                const items = response?.data?.items || [];
                if (items.length > 0) {
                    const settings = items[0] as any;
                    if (settings.allowed_country_codes) {
                        const codes = settings.allowed_country_codes
                            .split(',')
                            .map((code: string) => code.trim())
                            .filter(Boolean);
                        if (codes.length > 0) {
                            setAllowedCountryCodes(codes);
                        }
                    }
                }
            }
            catch {
                // Use +971 default  
            }
        }
        void loadCountryCodes();
    }, []);
    function initMap() {
        if (!mapRef.current) {
            return;
        }
        const map = L.map(mapRef.current).setView([restaurantLat, restaurantLng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
        }).addTo(map);
        const restaurantIcon = L.divIcon({
            html: '<div style="background:red;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>',
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
        });
        L.marker([restaurantLat, restaurantLng], {
            icon: restaurantIcon,
        })
            .addTo(map)
            .bindPopup('🍕 Vita Napoli');
        const zoneColors = [
            '#22c55e',
            '#f59e0b',
            '#f97316',
            '#ef4444',
            '#8b5cf6',
        ];
        if (deliveryZones.length > 0) {
            deliveryZones.forEach((zone, index) => {
                const color = zoneColors[index %
                    zoneColors.length];
                L.circle([
                    restaurantLat,
                    restaurantLng,
                ], {
                    radius: zone.max_distance_km *
                        1000,
                    color,
                    fillColor: color,
                    fillOpacity: 0.03,
                    weight: 2,
                    dashArray: '5,5',
                }).addTo(map);
            });
        }
        else {
            L.circle([
                restaurantLat,
                restaurantLng,
            ], {
                radius: nearRadius * 1000,
                color: '#22c55e',
                fillColor: '#22c55e',
                fillOpacity: 0.05,
                weight: 2,
                dashArray: '5,5',
            }).addTo(map);
            L.circle([
                restaurantLat,
                restaurantLng,
            ], {
                radius: farRadius * 1000,
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.03,
                weight: 2,
                dashArray: '5,5',
            }).addTo(map);
        }
        const marker = L.marker([
            restaurantLat + 0.005,
            restaurantLng + 0.005,
        ], {
            draggable: true,
        }).addTo(map);
        marker
            .bindPopup(`📍 ${text.dragMarker}`)
            .openPopup();
        marker.on('dragend', () => {
            const position = marker.getLatLng();
            void handleLocationSelected(position.lat, position.lng);
        });
        map.on('click', (event: L.LeafletMouseEvent) => {
            marker.setLatLng(event.latlng);
            void handleLocationSelected(event.latlng.lat, event.latlng.lng);
        });
        if (navigator.geolocation) {
            setGettingLocation(true);
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude, } = position.coords;
                marker.setLatLng([
                    latitude,
                    longitude,
                ]);
                map.setView([latitude, longitude], 15);
                void handleLocationSelected(latitude, longitude);
                setLocationPermissionDenied(false);
                setGettingLocation(false);
            }, (error) => {
                setGettingLocation(false);
                if (error.code ===
                    error.PERMISSION_DENIED) {
                    setLocationPermissionDenied(true);
                }
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
            });
        }
        mapInstanceRef.current = map;
        markerRef.current = marker;
    }
    async function handleLocationSelected(latitude: number, longitude: number) {
        setCustomerLat(latitude);
        setCustomerLng(longitude);
        setLocationShared(true);
        try {
            const response = await client.apiCall.invoke({
                url: '/api/v1/entities/delivery_zones/calculate',
                method: 'POST',
                data: {
                    customer_lat: latitude,
                    customer_lng: longitude,
                    restaurant_lat: restaurantLat,
                    restaurant_lng: restaurantLng,
                },
            });
            const result = response?.data;
            if (result?.available) {
                setDeliveryZoneError('');
                setCalculatedDeliveryCharge(result.charge || 0);
                setZoneName(result.zone_name || '');
            }
            else {
                setDeliveryZoneError(result?.message ||
                    `Delivery not available in your area (${result?.distance_km?.toFixed(1) || '?'} km away).`);
                setCalculatedDeliveryCharge(0);
                setZoneName('');
            }
        }
        catch {
            const distance = getDistanceKm(restaurantLat, restaurantLng, latitude, longitude);
            if (distance <= nearRadius) {
                setDeliveryZoneError('');
                setCalculatedDeliveryCharge(nearCharge);
                setZoneName(t('checkout.near_zone'));
            }
            else if (distance <= farRadius) {
                setDeliveryZoneError('');
                setCalculatedDeliveryCharge(farCharge);
                setZoneName(t('checkout.far_zone'));
            }
            else {
                setDeliveryZoneError(`Delivery not available in your area (${distance.toFixed(1)} km away). We deliver within ${farRadius} km.`);
                setCalculatedDeliveryCharge(0);
                setZoneName('');
            }
        }
    }
    function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const earthRadius = 6371;
        const deltaLatitude = ((lat2 - lat1) * Math.PI) /
            180;
        const deltaLongitude = ((lon2 - lon1) * Math.PI) /
            180;
        const value = Math.sin(deltaLatitude / 2) *
            Math.sin(deltaLatitude / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(deltaLongitude / 2) *
                Math.sin(deltaLongitude / 2);
        const centralAngle = 2 *
            Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
        return (earthRadius * centralAngle);
    }
    async function loadDeliverySettings() {
        try {
            const response = await client.entities.restaurant_settings.query({
                query: {},
                limit: 1,
            });
            const items = response?.data?.items || [];
            if (items.length > 0) {
                const settings = items[0] as any;
                const restaurantStatus = (settings.restaurant_status ||
                    '')
                    .toLowerCase()
                    .trim();
                if (restaurantStatus === 'closed') {
                    setShopClosed(true);
                    setShopClosedMessage(settings.busy_message ||
                        'The restaurant is currently closed. Please try again during opening hours.');
                }
                else if (restaurantStatus === 'busy') {
                    setShopClosedMessage(settings.busy_message ||
                        'We are currently busy. Orders may take longer than usual.');
                }
                else {
                    setShopClosed(false);
                    setShopClosedMessage('');
                }
                if (settings.auto_schedule_enabled &&
                    settings.auto_open_time &&
                    settings.auto_close_time) {
                    const now = new Date();
                    const uaeTime = new Date(now.getTime() +
                        4 * 60 * 60 * 1000 +
                        now.getTimezoneOffset() *
                            60 *
                            1000);
                    const currentMinutes = uaeTime.getHours() *
                        60 +
                        uaeTime.getMinutes();
                    const parseTime = (value: string) => {
                        const match = value.match(/(\d{1,2}):(\d{2})/);
                        return match
                            ? Number.parseInt(match[1], 10) *
                                60 +
                                Number.parseInt(match[2], 10)
                            : -1;
                    };
                    const openMinutes = parseTime(settings.auto_open_time);
                    const closeMinutes = parseTime(settings.auto_close_time);
                    if (openMinutes >= 0 &&
                        closeMinutes >= 0) {
                        let isOpen: boolean;
                        if (closeMinutes <
                            openMinutes) {
                            isOpen =
                                currentMinutes >=
                                    openMinutes ||
                                    currentMinutes <
                                        closeMinutes;
                        }
                        else {
                            isOpen =
                                currentMinutes >=
                                    openMinutes &&
                                    currentMinutes <
                                        closeMinutes;
                        }
                        if (!isOpen &&
                            restaurantStatus !==
                                'open') {
                            setShopClosed(true);
                            setShopClosedMessage(settings.busy_message ||
                                `We are currently closed. Opening hours: ${settings.auto_open_time} - ${settings.auto_close_time}`);
                        }
                    }
                }
                setDeliveryEnabled(settings.delivery_enabled ===
                    true ||
                    settings.delivery_enabled ===
                        'true');
                setDeliveryCharge(Number.parseFloat(settings.delivery_charges) || 5);
                setEstimatedDeliveryTime(settings.estimated_delivery_time ||
                    '30-45 min');
                if (settings.restaurant_lat) {
                    setRestaurantLat(Number.parseFloat(settings.restaurant_lat));
                }
                if (settings.restaurant_lng) {
                    setRestaurantLng(Number.parseFloat(settings.restaurant_lng));
                }
                if (settings.near_radius) {
                    setNearRadius(Number.parseFloat(settings.near_radius));
                }
                if (settings.far_radius) {
                    setFarRadius(Number.parseFloat(settings.far_radius));
                }
                if (settings.near_charge) {
                    setNearCharge(Number.parseFloat(settings.near_charge));
                }
                if (settings.far_charge) {
                    setFarCharge(Number.parseFloat(settings.far_charge));
                }
                setServiceFeeEnabled(settings.service_fee_enabled ===
                    true);
                setServiceFeeAmount(Number.parseFloat(settings.service_fee_amount) || 0);
                setServiceFeeType(settings.service_fee_type ||
                    'fixed');
                setServiceFeeAppliesTo(settings.service_fee_applies_to ||
                    'both');
                setSmallOrderFeeEnabled(settings.small_order_fee_enabled ===
                    true);
                setSmallOrderFeeAmount(Number.parseFloat(settings.small_order_fee_amount) || 0);
                setSmallOrderFeeThreshold(Number.parseFloat(settings.small_order_fee_threshold) || 20);
                setCashEnabledPickup(settings.cash_enabled_pickup !==
                    false);
                setCardEnabledPickup(settings.card_enabled_pickup !==
                    false);
                setCashEnabledDelivery(settings.cash_enabled_delivery !==
                    false);
                setCardEnabledDelivery(settings.card_enabled_delivery !==
                    false);
            }
            try {
                const zonesResponse = await client.apiCall.invoke({
                    url: '/api/v1/entities/delivery_zones?query={"is_active":true}&sort=min_distance_km&limit=50',
                    method: 'GET',
                });
                const zones = zonesResponse?.data?.items ||
                    [];
                if (zones.length > 0) {
                    setDeliveryZones(zones);
                }
            }
            catch {
                // Use old near/far zones  
            }
        }
        catch (error) {
            console.error('Failed to load delivery settings:', error);
            const savedSettings = localStorage.getItem('extended_settings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    setDeliveryEnabled(parsed.delivery_enabled ===
                        true ||
                        parsed.delivery_enabled ===
                            'true');
                    setDeliveryCharge(Number.parseFloat(parsed.delivery_charges) || 5);
                    setEstimatedDeliveryTime(parsed.estimated_delivery_time ||
                        '30-45 min');
                    if (parsed.restaurant_lat) {
                        setRestaurantLat(Number.parseFloat(parsed.restaurant_lat));
                    }
                    if (parsed.restaurant_lng) {
                        setRestaurantLng(Number.parseFloat(parsed.restaurant_lng));
                    }
                    if (parsed.near_radius) {
                        setNearRadius(Number.parseFloat(parsed.near_radius));
                    }
                    if (parsed.far_radius) {
                        setFarRadius(Number.parseFloat(parsed.far_radius));
                    }
                    if (parsed.near_charge) {
                        setNearCharge(Number.parseFloat(parsed.near_charge));
                    }
                    if (parsed.far_charge) {
                        setFarCharge(Number.parseFloat(parsed.far_charge));
                    }
                }
                catch {
                    // Ignore invalid saved settings  
                }
            }
        }
    }
    async function validatePromoCode() {
        if (!promoCode.trim()) {
            toast.error(t('checkout.enter_promo'));
            return;
        }
        setValidatingPromo(true);
        try {
            const response = await client.entities.offers.query({
                query: {
                    is_active: true,
                },
                limit: 50,
            });
            const offers = response?.data?.items || [];
            const matchedOffer = offers.find((offer: any) => offer.promo_code &&
                offer.promo_code.toLowerCase() ===
                    promoCode
                        .trim()
                        .toLowerCase());
            if (matchedOffer &&
                matchedOffer.discount_percent >
                    0) {
                let previousOrders: any[] = [];
                try {
                    const ordersResponse = await customerApiRequest<any>('/api/v1/orders/my-orders', 'GET');
                    previousOrders =
                        ordersResponse?.items ||
                            ordersResponse ||
                            [];
                }
                catch {
                    previousOrders = [];
                }
                if (matchedOffer.first_order_only) {
                    const completedOrders = previousOrders.filter((order: any) => order.status !==
                        'cancelled' &&
                        order.status !==
                            'expired');
                    if (completedOrders.length >
                        0) {
                        toast.error(text.firstOrderOnly);
                        setPromoApplied(false);
                        setPromoDiscount(0);
                        setPromoOffer(null);
                        setValidatingPromo(false);
                        return;
                    }
                }
                const usageLimit = matchedOffer.usage_limit_per_customer ??
                    1;
                if (usageLimit > 0 &&
                    previousOrders.length > 0) {
                    const code = matchedOffer.promo_code.toUpperCase();
                    const usageCount = previousOrders.filter((order: any) => {
                        const orderNotes = (order.order_notes ||
                            '').toUpperCase();
                        return (orderNotes.includes(`PROMO: ${code}`) &&
                            order.status !==
                                'cancelled' &&
                            order.status !==
                                'expired');
                    }).length;
                    if (usageCount >= usageLimit) {
                        toast.error(`This offer has already been used${usageLimit === 1
                            ? ''
                            : ` ${usageLimit} times`}. Limit reached.`);
                        setPromoApplied(false);
                        setPromoDiscount(0);
                        setPromoOffer(null);
                        setValidatingPromo(false);
                        return;
                    }
                }
                setPromoApplied(true);
                setPromoDiscount(matchedOffer.discount_percent);
                setPromoOffer(matchedOffer);
                toast.success(`🎉 Promo code applied! ${matchedOffer.discount_percent}% off`);
            }
            else {
                toast.error(t('checkout.invalid_promo'));
                setPromoApplied(false);
                setPromoDiscount(0);
                setPromoOffer(null);
            }
        }
        catch {
            toast.error(text.promoFailed);
        }
        finally {
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
    const deliveryFee = orderType === 'delivery'
        ? locationShared
            ? calculatedDeliveryCharge
            : deliveryCharge
        : 0;
    const discountAmount = promoApplied
        ? (subtotal * promoDiscount) /
            100
        : 0;
    const shouldApplyServiceFee = serviceFeeEnabled &&
        (serviceFeeAppliesTo ===
            'both' ||
            (serviceFeeAppliesTo ===
                'pickup' &&
                orderType === 'pickup') ||
            (serviceFeeAppliesTo ===
                'delivery' &&
                orderType ===
                    'delivery'));
    const serviceFee = shouldApplyServiceFee
        ? serviceFeeType ===
            'percentage'
            ? (subtotal *
                serviceFeeAmount) /
                100
            : serviceFeeAmount
        : 0;
    const smallOrderFee = smallOrderFeeEnabled &&
        subtotal <
            smallOrderFeeThreshold
        ? smallOrderFeeAmount
        : 0;
    const total = subtotal +
        deliveryFee +
        serviceFee +
        smallOrderFee +
        tipAmount -
        discountAmount;
    const availablePaymentMethods: {
        value: string;
        label: string;
        description: string;
    }[] = [];
    if (orderType === 'pickup') {
        if (cashEnabledPickup) {
            availablePaymentMethods.push({
                value: 'cash',
                label: `💵 ${t('checkout.cash_on_pickup')}`,
                description: t('checkout.pay_cash_collect'),
            });
        }
        if (cardEnabledPickup) {
            availablePaymentMethods.push({
                value: 'card',
                label: `💳 ${t('checkout.card_on_pickup')}`,
                description: t('checkout.pay_card_collect'),
            });
        }
    }
    else {
        if (cashEnabledDelivery) {
            availablePaymentMethods.push({
                value: 'cash',
                label: `💵 ${t('checkout.cash_on_delivery')}`,
                description: t('checkout.pay_cash_rider'),
            });
        }
        if (cardEnabledDelivery) {
            availablePaymentMethods.push({
                value: 'card',
                label: `💳 ${t('checkout.card_on_delivery')}`,
                description: t('checkout.pay_card_rider'),
            });
        }
    }
    function validatePhone(phoneNumber: string, strict: boolean): string | null {
        const cleaned = phoneNumber
            .trim()
            .replace(/[\s-()]/g, '');
        if (!cleaned) {
            return t('checkout.phone');
        }
        if (strict) {
            const hasValidCode = allowedCountryCodes.some((code) => {
                const cleanedCode = code.replace(/[\s\-()]/g, '');
                const withPlus = cleaned.startsWith(cleanedCode);
                const withDoubleZero = cleaned.startsWith(`00${cleanedCode.replace('+', '')}`);
                if (cleanedCode === '+971') {
                    return (withPlus ||
                        withDoubleZero ||
                        /^05[0-9]\d{7}$/.test(cleaned));
                }
                return (withPlus ||
                    withDoubleZero);
            });
            if (!hasValidCode) {
                return `Please enter a valid phone number with allowed country code (${allowedCountryCodes.join(', ')})`;
            }
            const digitsOnly = cleaned.replace(/\D/g, '');
            if (digitsOnly.length < 9) {
                return text.phoneShort;
            }
        }
        else {
            const digitsOnly = cleaned.replace(/\D/g, '');
            if (digitsOnly.length < 9) {
                return text.validPhone;
            }
        }
        return null;
    }
    function validateForm(): Record<string, string> {
        const newErrors: Record<string, string> = {};
        if (!name.trim()) {
            newErrors.name =
                t('checkout.enter_name');
        }
        const phoneError = validatePhone(phone, orderType === 'delivery');
        if (phoneError) {
            newErrors.phone =
                phoneError;
        }
        if (orderType === 'delivery' &&
            !locationShared) {
            newErrors.location =
                t('checkout.select_location');
        }
        if (orderType === 'delivery' &&
            deliveryZoneError) {
            newErrors.location =
                deliveryZoneError;
        }
        if (orderType === 'delivery' &&
            locationShared &&
            calculatedDeliveryCharge <=
                0 &&
            !deliveryZoneError) {
            newErrors.location =
                text.calculateDelivery;
        }
        if (availablePaymentMethods.length ===
            0) {
            newErrors.payment =
                text.noPayment;
        }
        if (cart.length === 0) {
            newErrors.cart =
                text.cartEmpty;
        }
        if (!customerLoggedIn) {
            newErrors.auth =
                t('checkout.login_required');
        }
        return newErrors;
    }
    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (submittingRef.current ||
            loading) {
            return;
        }
        if (shopClosed) {
            toast.error(shopClosedMessage ||
                t('checkout.restaurant_closed'));
            return;
        }
        if (!customerLoggedIn) {
            toast.error(t('checkout.login_required'));
            navigate('/account');
            return;
        }
        const validationErrors = validateForm();
        setErrors(validationErrors);
        setShowErrors(true);
        if (Object.keys(validationErrors).length > 0) {
            const errorCount = Object.keys(validationErrors).length;
            toast.error(`Please fix ${errorCount} ${errorCount === 1
                ? 'issue'
                : 'issues'} before placing your order`);
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
                const element = document.getElementById(elementId);
                element?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }
            if (validationErrors.auth) {
                navigate('/account');
            }
            return;
        }
        setLoading(true);
        submittingRef.current = true;
        try {
            const itemsData = cart.map((item) => ({
                name: item.menuItem.name,
                size: item.size,
                quantity: item.quantity,
                extras: item.extras.map((extra) => extra.name),
                price: item.totalPrice,
            }));
            const noteParts = [notes];
            if (orderType === 'pickup' &&
                carInfo) {
                noteParts.push(`Car: ${carInfo}`);
            }
            if (orderType ===
                'delivery') {
                if (deliveryAddress) {
                    noteParts.push(`Delivery Address: ${deliveryAddress}`);
                }
                if (deliveryFee > 0) {
                    noteParts.push(`Delivery Fee: AED ${deliveryFee.toFixed(2)}`);
                }
                if (zoneName) {
                    noteParts.push(`Zone: ${zoneName}`);
                }
                if (customerLat !== null &&
                    customerLng !== null) {
                    noteParts.push(`GPS: ${customerLat.toFixed(6)},${customerLng.toFixed(6)}`);
                }
            }
            if (promoApplied &&
                promoOffer) {
                noteParts.push(`Promo: ${promoOffer.promo_code} (-${promoDiscount}%)`);
            }
            noteParts.push(`Order Type: ${orderType ===
                'delivery'
                ? 'Delivery'
                : 'Pickup'}`);
            const fullNotes = noteParts
                .filter(Boolean)
                .join(' | ');
            const paymentLabel = paymentMethod === 'cash'
                ? orderType ===
                    'delivery'
                    ? 'Cash on Delivery'
                    : 'Cash on Pickup'
                : orderType ===
                    'delivery'
                    ? 'Card on Delivery'
                    : 'Card on Pickup';
            const response = await customerApiRequest<{
                order_id: number;
            }>('/api/v1/orders/place', 'POST', {
                customer_name: name.trim(),
                customer_phone: phone.trim(),
                order_notes: fullNotes,
                payment_method: paymentLabel,
                total_amount: total,
                service_fee: serviceFee,
                small_order_fee: smallOrderFee,
                tip_amount: tipAmount,
                tip_type: tipAmount > 0
                    ? orderType ===
                        'delivery'
                        ? 'rider'
                        : 'shop'
                    : '',
                items_json: JSON.stringify(itemsData),
                order_type: orderType,
                customer_lat: orderType ===
                    'delivery'
                    ? customerLat
                    : null,
                customer_lng: orderType ===
                    'delivery'
                    ? customerLng
                    : null,
            });
            const orderId = response.order_id;
            localStorage.setItem('vita_customer_name', name.trim());
            localStorage.setItem('vita_customer_phone', phone.trim());
            clearCart();
            window.dispatchEvent(new Event('cart-updated'));
            toast.success(`${text.orderPlaced} #${orderId}`);
            navigate('/order-confirmation', {
                state: {
                    orderId,
                },
            });
        }
        catch (error: any) {
            let errorMessage = text.failedOrder;
            if (axios.isAxiosError(error)) {
                errorMessage =
                    error.response?.data
                        ?.detail ||
                        error.message ||
                        errorMessage;
            }
            else if (error instanceof Error) {
                errorMessage =
                    error.message;
            }
            toast.error(errorMessage);
            console.error('Order placement failed:', error);
        }
        finally {
            setLoading(false);
            submittingRef.current = false;
        }
    }
    if (authLoading) {
        return (<CustomerLayout>
        <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="text-gray-400">
Loading...
        </div>
        </div>
        </CustomerLayout>);
    }
    return (<CustomerLayout>
    <div className="bg-black min-h-screen px-4 py-6 max-w-lg mx-auto">
    <h1 className="text-white text-2xl font-bold mb-6">
    {t('checkout.title')}
    </h1>

        {!customerLoggedIn && (<div id="auth-section" className="mb-6 p-4 rounded-xl bg-red-600/10 border border-red-600/30">  
        <p className="text-red-400 text-sm mb-3">  
          Please login to place  
          your order  
        </p>  

        <Button onClick={() => navigate('/account')} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">  
          Login / Sign Up  
        </Button>  
      </div>)}  

    {shopClosed && (<div className="mb-6 p-4 rounded-xl bg-orange-600/10 border border-orange-600/30">  
        <div className="flex items-center gap-2 mb-2">  
          <span className="text-2xl">  
            🚫  
          </span>  

          <h3 className="text-orange-400 font-bold text-lg">  
            Restaurant Closed  
          </h3>  
        </div>  

        <p className="text-orange-300 text-sm">  
          {shopClosedMessage}  
        </p>  
      </div>)}  

    {!shopClosed &&
            shopClosedMessage && (<div className="mb-6 p-3 rounded-xl bg-yellow-600/10 border border-yellow-600/30">  
          <p className="text-yellow-400 text-sm">  
            ⚠️{' '}  
            {shopClosedMessage}  
          </p>  
        </div>)}  

    <form onSubmit={handleSubmit} className="space-y-6">  
      {deliveryEnabled && (<div>  
          <Label className="text-gray-300 mb-3 block">  
            {t('checkout.order_type')}  
          </Label>  

          <div className="grid grid-cols-2 gap-3">  
            <button type="button" onClick={() => {
                setOrderType('pickup');
                setShowMap(false);
            }} className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 ${orderType ===
                'pickup'
                ? 'border-red-600 bg-red-600/10'
                : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>  
              <Car className={`w-6 h-6 ${orderType ===
                'pickup'
                ? 'text-red-400'
                : 'text-gray-400'}`}/>  

              <span className={`font-medium ${orderType ===
                'pickup'
                ? 'text-white'
                : 'text-gray-400'}`}>  
                {t('checkout.pickup')}  
              </span>  

              <span className="text-gray-500 text-xs">  
                Collect from store  
              </span>  
            </button>  

            <button type="button" onClick={() => {
                setOrderType('delivery');
                setShowMap(true);
            }} className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center gap-2 ${orderType ===
                'delivery'
                ? 'border-red-600 bg-red-600/10'
                : 'border-gray-700 bg-gray-900 hover:border-gray-500'}`}>  
              <MapPin className={`w-6 h-6 ${orderType ===
                'delivery'
                ? 'text-red-400'
                : 'text-gray-400'}`}/>  

              <span className={`font-medium ${orderType ===
                'delivery'
                ? 'text-white'
                : 'text-gray-400'}`}>  
                {t('checkout.delivery')}  
              </span>  

              <span className="text-gray-500 text-xs">  
                To your location  
              </span>  
            </button>  
          </div>  
        </div>)}  

      <div className="space-y-4">  
        <div>  
          <Label htmlFor="name" className="text-gray-300">  
            {t('checkout.your_name')}{' '}  
            *  
          </Label>  

          <Input id="name" value={name} onChange={(event) => {
            setName(event.target.value);
            if (showErrors) {
                setErrors((previous) => {
                    const next = {
                        ...previous,
                    };
                    delete next.name;
                    return next;
                });
            }
        }} placeholder="Your full name" className={`bg-gray-900 border-gray-700 text-white mt-1 ${showErrors &&
            errors.name
            ? 'border-red-500'
            : ''}`} required/>  

          {showErrors &&
            errors.name && (<p className="text-red-400 text-xs mt-1">  
                ⚠️ {errors.name}  
              </p>)}  
        </div>  

        <div>  
          <Label htmlFor="phone" className="text-gray-300">  
            {t('checkout.phone')}{' '}  
            *  
          </Label>  

          <Input id="phone" value={phone} onChange={(event) => {
            setPhone(event.target.value);
            if (showErrors) {
                setErrors((previous) => {
                    const next = {
                        ...previous,
                    };
                    delete next.phone;
                    return next;
                });
            }
        }} placeholder={`${allowedCountryCodes[0] ||
            '+971'} XX XXX XXXX`} className={`bg-gray-900 border-gray-700 text-white mt-1 ${showErrors &&
            errors.phone
            ? 'border-red-500'
            : ''}`} required/>  

          {orderType ===
            'delivery' && (<p className="text-gray-500 text-xs mt-1">  
              Valid number required  
              for delivery (  
              {allowedCountryCodes.join(', ')}  
              )  
            </p>)}  

          {showErrors &&
            errors.phone && (<p className="text-red-400 text-xs mt-1">  
                ⚠️ {errors.phone}  
              </p>)}  
        </div>  

        {orderType ===
            'delivery' && (<>  
            <div id="delivery-map">  
              <Label className="text-gray-300 mb-2 block">  
                Select Delivery  
                Location *  
              </Label>  

              <div className="flex items-center gap-2 mb-2">  
                <p className="text-gray-500 text-xs flex-1">  
                  Tap on the map or  
                  drag the pin to  
                  your exact location  
                </p>  

                <Button type="button" size="sm" disabled={gettingLocation} onClick={() => {
                if (!navigator.geolocation) {
                    toast.error('Your browser does not support location services. Please tap on the map to select your location.');
                    return;
                }
                setGettingLocation(true);
                navigator.geolocation.getCurrentPosition((position) => {
                    const { latitude, longitude, } = position.coords;
                    markerRef.current?.setLatLng([
                        latitude,
                        longitude,
                    ]);
                    mapInstanceRef.current?.setView([
                        latitude,
                        longitude,
                    ], 15);
                    void handleLocationSelected(latitude, longitude);
                    setLocationPermissionDenied(false);
                    setGettingLocation(false);
                    toast.success('Pin moved to your location!');
                }, (error) => {
                    setGettingLocation(false);
                    if (error.code ===
                        error.PERMISSION_DENIED) {
                        setLocationPermissionDenied(true);
                        toast.warning('Location permission denied. You can tap on the map to select your delivery location manually.');
                    }
                    else {
                        toast.warning('Could not get your location. Please tap on the map to select your location.');
                    }
                }, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                });
            }} className="bg-blue-600 hover:bg-blue-700 text-white text-xs cursor-pointer disabled:opacity-50">  
                  <Navigation className="w-3 h-3 mr-1"/>  

                  {gettingLocation
                ? 'Getting...'
                : 'My Location'}  
                </Button>  
              </div>  

              <div ref={mapRef} className="w-full h-[250px] rounded-xl overflow-hidden border border-gray-700" style={{
                zIndex: 1,
            }}/>  

              <div className="flex flex-wrap gap-3 mt-2 text-xs">  
                {deliveryZones.length >
                0 ? (deliveryZones.map((zone, index) => (<span key={index} className={index ===
                    0
                    ? 'text-green-400'
                    : index ===
                        1
                        ? 'text-yellow-400'
                        : 'text-orange-400'}>  
                        ●{' '}  
                        {zone.zone_name}{' '}  
                        (  
                        {zone.min_distance_km}  
                        -  
                        {zone.max_distance_km}{' '}  
                        km = AED{' '}  
                        {zone.charge}  
                        )  
                      </span>))) : (<>  
                    <span className="text-green-400">  
                      ● Near zone  
                      (AED{' '}  
                      {nearCharge}  
                      )  
                    </span>  

                    <span className="text-yellow-400">  
                      ● Far zone  
                      (AED{' '}  
                      {farCharge}  
                      )  
                    </span>  
                  </>)}  
              </div>  

              {locationPermissionDenied &&
                !locationShared && (<div className="mt-2 p-3 rounded-lg bg-yellow-600/10 border border-yellow-600/30">  
                    <p className="text-yellow-300 text-sm font-medium mb-1">  
                      📍 Location  
                      access not  
                      available  
                    </p>  

                    <p className="text-yellow-200/70 text-xs">  
                      Tap anywhere  
                      on the map or  
                      drag the pin to  
                      set your  
                      delivery  
                      location.  
                    </p>  
                  </div>)}  

              {gettingLocation &&
                !locationShared && (<div className="mt-2 flex items-center gap-2 text-blue-400 text-sm">  
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>  

                    <span>  
                      Getting your  
                      location...  
                    </span>  
                  </div>)}  

              {locationShared &&
                !deliveryZoneError && (<div className="mt-2 flex items-center gap-2 text-green-400 text-sm">  
                    <CheckCircle className="w-4 h-4"/>  

                    <span>  
                      Location  
                      selected  
                      {zoneName
                    ? ` (${zoneName})`
                    : ''}  
                      {' — '}  
                      Delivery fee:  
                      AED{' '}  
                      {calculatedDeliveryCharge}  
                    </span>  
                  </div>)}  

              {deliveryZoneError && (<div className="mt-2 p-3 rounded-lg bg-red-600/10 border border-red-600/30">  
                  <p className="text-red-400 text-sm">  
                    ❌{' '}  
                    {deliveryZoneError}  
                  </p>  
                </div>)}  

              {showErrors &&
                errors.location &&
                !deliveryZoneError && (<p className="text-red-400 text-xs mt-2">  
                    ⚠️{' '}  
                    {errors.location}  
                  </p>)}  
            </div>  

            <div>  
              <Label htmlFor="address" className="text-gray-300">  
                Delivery Notes  
                (building,  
                floor, etc.)  
              </Label>  

              <Textarea id="address" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target
                .value)} placeholder="Building name, floor, apartment number..." className="bg-gray-900 border-gray-700 text-white mt-1"/>  

              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">  
                <MapPin className="w-3 h-3"/>  
                Estimated  
                delivery:{' '}  
                {estimatedDeliveryTime}  
              </p>  
            </div>  
          </>)}  

        {orderType ===
            'pickup' && (<div>  
            <Label htmlFor="carInfo" className="text-gray-300">  
              Car Number &  
              Color (optional)  
            </Label>  

            <Input id="carInfo" value={carInfo} onChange={(event) => setCarInfo(event.target.value)} placeholder="e.g. White Toyota ABC 1234" className="bg-gray-900 border-gray-700 text-white mt-1"/>  

            <p className="text-gray-500 text-xs mt-1">  
              Helps us identify  
              you for pickup  
            </p>  
          </div>)}  

        <div>  
          <Label htmlFor="notes" className="text-gray-300">  
            {t('checkout.order_notes')}  
          </Label>  

          <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Any special instructions..." className="bg-gray-900 border-gray-700 text-white mt-1"/>  
        </div>  
      </div>  

      <div>  
        <Label className="text-gray-300 mb-2 block">  
          {t('checkout.promo_code')}  
        </Label>  

        {promoApplied ? (<div className="flex items-center gap-3 p-3 rounded-xl bg-green-600/10 border border-green-600/30">  
            <Tag className="w-5 h-5 text-green-400"/>  

            <div className="flex-1">  
              <p className="text-green-400 font-medium text-sm">  
                {promoOffer?.promo_code}{' '}  
                applied!  
              </p>  

              <p className="text-green-400/70 text-xs">  
                {promoDiscount}  
                % discount —  
                saving AED{' '}  
                {discountAmount.toFixed(2)}  
              </p>  
            </div>  

            <button type="button" onClick={removePromo} className="text-gray-400 text-xs hover:text-red-400 cursor-pointer">  
              {text.remove}  
            </button>  
          </div>) : (<div className="flex gap-2">  
            <Input value={promoCode} onChange={(event) => setPromoCode(event.target
                .value)} placeholder={t('checkout.promo_placeholder')} className="bg-gray-900 border-gray-700 text-white flex-1"/>  

            <Button type="button" onClick={() => void validatePromoCode()} disabled={validatingPromo} className="bg-gray-800 hover:bg-gray-700 text-white cursor-pointer">  
              {validatingPromo
                ? '...'
                : t('checkout.apply')}  
            </Button>  
          </div>)}  
      </div>  

      <div>
       <Label className="text-gray-300
 mb-3 block">  
          💝 {text.addTip}{' '}  
          {orderType ===
            'delivery'
            ? `(${text.riderTip})`
            : `(${text.shopTip})`}  
        </Label>  

        <div className="flex flex-wrap gap-2 mb-2">  
          {[5, 10, 15].map((amount) => (<button key={amount} type="button" onClick={() => {
                setTipAmount(amount);
                setShowCustomTip(false);
                setCustomTip('');
            }} className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${tipAmount ===
                amount &&
                !showCustomTip
                ? 'border-green-500 bg-green-600/20 text-green-400'
                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'}`}>  
                AED {amount}  
              </button>))}  

          <button type="button" onClick={() => {
            setShowCustomTip(true);
            setTipAmount(0);
        }} className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${showCustomTip
            ? 'border-green-500 bg-green-600/20 text-green-400'
            : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'}`}>  
            {text.custom}  
          </button>  

          {tipAmount > 0 && (<button type="button" onClick={() => {
                setTipAmount(0);
                setShowCustomTip(false);
                setCustomTip('');
            }} className="px-3 py-2.5 rounded-lg border-2 border-gray-700 bg-gray-900 text-gray-500 text-sm cursor-pointer hover:border-red-600 hover:text-red-400">  
              {text.noTip}  
            </button>)}  
        </div>  

        {showCustomTip && (<div className="flex items-center gap-2">  
            <span className="text-gray-400 text-sm">  
              AED  
            </span>  

            <Input type="number" min="1" max="500" value={customTip} onChange={(event) => {
                setCustomTip(event.target
                    .value);
                const value = Number.parseFloat(event.target
                    .value);
                setTipAmount(value > 0
                    ? value
                    : 0);
            }} placeholder={text.enterAmount} className="bg-gray-900 border-gray-700 text-white w-32"/>  
          </div>)}  

        {tipAmount > 0 && (<p className="text-green-400/80 text-xs mt-2">  
            ✓ AED{' '}  
            {tipAmount.toFixed(0)}{' '}  
            tip will go to{' '}  
            {orderType ===
                'delivery'
                ? text.rider
                : text.staff}  
          </p>)}  
      </div>  

      <div id="payment-section">  
        <Label className="text-gray-300 mb-3 block">  
          {t('checkout.payment_method')}  
        </Label>  

        {availablePaymentMethods.length ===
            0 ? (<div className="p-4 rounded-xl bg-red-600/10 border border-red-600/30">  
            <p className="text-red-400 text-sm">  
              {text.noPayment} {text.contactRestaurant}  
            </p>  
          </div>) : (<RadioGroup value={availablePaymentMethods.some((method) => method.value ===
                paymentMethod)
                ? paymentMethod
                : availablePaymentMethods[0]
                    ?.value ||
                    'cash'} onValueChange={setPaymentMethod} className="space-y-3">  
            {availablePaymentMethods.map((method) => (<label key={method.value} className="flex items-center gap-3 p-4 rounded-xl border border-gray-700 hover:border-gray-500 cursor-pointer">  
                  <RadioGroupItem value={method.value} id={method.value}/>  

                  <div>  
                    <div className="text-white font-medium">  
                      {method.label}  
                    </div>  

                    <div className="text-gray-500 text-sm">  
                      {method.description}  
                    </div>  
                  </div>  
                </label>))}  
          </RadioGroup>)}  
      </div>  

      <div id="order-summary" className={`p-4 rounded-xl bg-gray-900 border ${showErrors &&
            errors.cart
            ? 'border-red-500'
            : 'border-gray-800'}`}>  
        <h3 className="text-white font-semibold mb-3">  
          Order Summary  
        </h3>  

        {showErrors &&
            errors.cart && (<p className="text-red-400 text-xs mb-3">  
              ⚠️ {errors.cart}  
            </p>)}  

        {cart.map((item) => (<div key={item.id} className="flex justify-between text-sm py-1.5">  
            <span className="text-gray-400">  
              {item.quantity}x{' '}  
              {item.menuItem
                .name}{' '}  
              ({item.size})  

              {item.extras
                .length > 0 && (<span className="text-gray-600 text-xs block">  
                  +{' '}  
                  {item.extras
                    .map((extra) => extra.name)
                    .join(', ')}  
                </span>)}  
            </span>  

            <span className="text-gray-300">  
              AED{' '}  
              {item.totalPrice.toFixed(2)}  
            </span>  
          </div>))}  

        <div className="border-t border-gray-700 mt-3 pt-3 space-y-1.5">  
          <div className="flex justify-between text-sm">  
            <span className="text-gray-400">  
              {text.subtotal}  
            </span>  

            <span className="text-gray-300">  
              AED{' '}  
              {subtotal.toFixed(2)}  
            </span>  
          </div>  

          {orderType ===
            'delivery' &&
            deliveryFee > 0 && (<div className="flex justify-between text-sm">  
                <span className="text-gray-400">  
                  Delivery Fee  
                </span>  

                <span className="text-gray-300">  
                  AED{' '}  
                  {deliveryFee.toFixed(2)}  
                </span>  
              </div>)}  

          {serviceFee > 0 && (<div className="flex justify-between text-sm">  
              <span className="text-gray-400">  
                {text.serviceFee}  
              </span>  

              <span className="text-gray-300">  
                AED{' '}  
                {serviceFee.toFixed(2)}  
              </span>  
            </div>)}  

          {smallOrderFee >
            0 && (<div className="flex justify-between text-sm">  
              <span className="text-yellow-400">  
                {text.smallOrderFee}  
              </span>  

              <span className="text-yellow-400">  
                AED{' '}  
                {smallOrderFee.toFixed(2)}  
              </span>  
            </div>)}  

          {tipAmount > 0 && (<div className="flex justify-between text-sm">  
              <span className="text-green-400">  
                {text.tip} (  
                {orderType ===
                'delivery'
                ? 'Rider'
                : 'Shop'}  
                )  
              </span>  

              <span className="text-green-400">  
                AED{' '}  
                {tipAmount.toFixed(2)}  
              </span>  
            </div>)}  

          {promoApplied && (<div className="flex justify-between text-sm">  
              <span className="text-green-400">  
                {text.discount} (  
                {promoDiscount}  
                %)  
              </span>  

              <span className="text-green-400">  
                -AED{' '}

                {discountAmount.toFixed(2)}  
              </span>  
            </div>)}  

          <div className="flex justify-between pt-2 border-t border-gray-700">  
            <span className="text-white font-semibold">  
              {text.total}  
            </span>  

            <span className="text-red-400 font-bold text-lg">  
              AED{' '}  
              {total.toFixed(2)}  
            </span>  
          </div>  
        </div>  
      </div>  

      {showErrors &&
            Object.keys(errors)
                .length > 0 && (<div className="p-3 rounded-xl bg-red-600/10 border border-red-500/30 mb-3">  
            <p className="text-red-400 text-sm font-medium mb-1">  
              ⚠️ {text.pleaseFix}  
            </p>  

            <ul className="space-y-0.5">  
              {Object.values(errors).map((error, index) => (<li key={index} className="text-red-400/80 text-xs">  
                    • {error}  
                  </li>))}  
            </ul>  
          </div>)}  

      <Button type="submit" disabled={loading ||
            shopClosed ||
            !customerLoggedIn ||
            (orderType ===
                'delivery' &&
                (Boolean(deliveryZoneError) ||
                    !locationShared ||
                    calculatedDeliveryCharge <=
                        0))} className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">  
        {loading
            ? t('checkout.placing')
            : `${t('checkout.place_order')} — ${t('common.aed')} ${total.toFixed(2)}`}  
      </Button>  
    </form>  
  </div>  
    </CustomerLayout>);
}
