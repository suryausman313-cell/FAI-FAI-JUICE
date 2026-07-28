import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';

import { toast } from 'sonner';

import {
  Car,
  CheckCircle,
  MapPin,
  Navigation,
  Tag,
} from 'lucide-react';

import CustomerLayout from '@/components/CustomerLayout';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

import {
  CartItem,
  Offer,
  client,
} from '@/lib/api';

import {
  clearCart,
  getCart,
  getCartTotal,
} from '@/lib/cart-store';

import { customerAuthApi } from '@/lib/customer-auth';
import { getAPIBaseURL } from '@/lib/config';
import { useTranslation } from '@/lib/i18n';

delete (
  L.Icon.Default.prototype as unknown as {
    _getIconUrl?: unknown;
  }
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',

  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',

  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

type OrderType =
  | 'pickup'
  | 'delivery';

type PaymentMethod =
  | 'cash'
  | 'card';

type ServiceFeeType =
  | 'fixed'
  | 'percentage';

type ServiceFeeAppliesTo =
  | 'pickup'
  | 'delivery'
  | 'both';

type DeliveryZone = {
  zone_name: string;
  min_distance_km: number;
  max_distance_km: number;
  charge: number;
};

type PaymentOption = {
  value: PaymentMethod;
  label: string;
  description: string;
};

const numberValue = (
  value: unknown,
  fallback = 0
) => {
  const parsed = Number.parseFloat(
    String(value ?? '')
  );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const booleanValue = (
  value: unknown,
  fallback = false
) => {
  if (
    value === true ||
    value === 'true' ||
    value === 1 ||
    value === '1'
  ) {
    return true;
  }

  if (
    value === false ||
    value === 'false' ||
    value === 0 ||
    value === '0'
  ) {
    return false;
  }

  return fallback;
};

async function customerApiRequest<T>(
  url: string,
  method: 'GET' | 'POST',
  data?: unknown
): Promise<T> {
  const token =
    customerAuthApi.getToken();

  if (!token) {
    throw new Error(
      'Please login again'
    );
  }

  const base =
    getAPIBaseURL().replace(
      /\/$/,
      ''
    );

  const response =
    await axios.request<T>({
      url: `${base}${url}`,
      method,
      data,

      headers: {
        'Content-Type':
          'application/json',

        Authorization:
          `Bearer ${token}`,
      },
    });

  return response.data;
}

function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const radius = 6371;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLng =
    ((lng2 - lng1) *
      Math.PI) /
    180;

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 * Math.PI) /
          180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    radius *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    )
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const {
    customer,
    isLoggedIn,
    loading: authLoading,
  } = useCustomerAuth();

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const submittingRef =
    useRef(false);

  const [name, setName] =
    useState(
      () =>
        localStorage.getItem(
          'vita_customer_name'
        ) || ''
    );

  const [phone, setPhone] =
    useState(
      () =>
        localStorage.getItem(
          'vita_customer_phone'
        ) || ''
    );

  const [notes, setNotes] =
    useState('');

  const [carInfo, setCarInfo] =
    useState('');

  const [
    deliveryAddress,
    setDeliveryAddress,
  ] = useState('');

  const [
    orderType,
    setOrderType,
  ] = useState<OrderType>(
    'pickup'
  );

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState<PaymentMethod>(
    'cash'
  );

  const [errors, setErrors] =
    useState<
      Record<string, string>
    >({});

  const [
    deliveryEnabled,
    setDeliveryEnabled,
  ] = useState(false);

  const [
    deliveryCharge,
    setDeliveryCharge,
  ] = useState(5);

  const [
    estimatedDeliveryTime,
    setEstimatedDeliveryTime,
  ] = useState('30-45 min');

  const [
    restaurantLat,
    setRestaurantLat,
  ] = useState(25.2747);

  const [
    restaurantLng,
    setRestaurantLng,
  ] = useState(56.345);

  const [
    nearRadius,
    setNearRadius,
  ] = useState(5);

  const [
    farRadius,
    setFarRadius,
  ] = useState(15);

  const [
    nearCharge,
    setNearCharge,
  ] = useState(5);

  const [
    farCharge,
    setFarCharge,
  ] = useState(15);

  const [
    deliveryZones,
    setDeliveryZones,
  ] = useState<
    DeliveryZone[]
  >([]);

  const [
    serviceFeeEnabled,
    setServiceFeeEnabled,
  ] = useState(false);

  const [
    serviceFeeAmount,
    setServiceFeeAmount,
  ] = useState(0);

  const [
    serviceFeeType,
    setServiceFeeType,
  ] = useState<
    ServiceFeeType
  >('fixed');

  const [
    serviceFeeAppliesTo,
    setServiceFeeAppliesTo,
  ] = useState<
    ServiceFeeAppliesTo
  >('both');

  const [
    smallOrderFeeEnabled,
    setSmallOrderFeeEnabled,
  ] = useState(false);

  const [
    smallOrderFeeAmount,
    setSmallOrderFeeAmount,
  ] = useState(0);

  const [
    smallOrderFeeThreshold,
    setSmallOrderFeeThreshold,
  ] = useState(20);

  const [
    cashEnabledPickup,
    setCashEnabledPickup,
  ] = useState(true);

  const [
    cardEnabledPickup,
    setCardEnabledPickup,
  ] = useState(true);

  const [
    cashEnabledDelivery,
    setCashEnabledDelivery,
  ] = useState(true);

  const [
    cardEnabledDelivery,
    setCardEnabledDelivery,
  ] = useState(true);

  const [
    shopClosed,
    setShopClosed,
  ] = useState(false);

  const [
    shopMessage,
    setShopMessage,
  ] = useState('');

  const [
    allowedCountryCodes,
    setAllowedCountryCodes,
  ] = useState<string[]>([
    '+971',
  ]);

  const [
    showMap,
    setShowMap,
  ] = useState(false);

  const [
    gettingLocation,
    setGettingLocation,
  ] = useState(false);

  const [
    locationShared,
    setLocationShared,
  ] = useState(false);

  const [
    customerLat,
    setCustomerLat,
  ] = useState<number | null>(
    null
  );

  const [
    customerLng,
    setCustomerLng,
  ] = useState<number | null>(
    null
  );

  const [
    calculatedDeliveryCharge,
    setCalculatedDeliveryCharge,
  ] = useState(0);

  const [
    deliveryZoneError,
    setDeliveryZoneError,
  ] = useState('');

  const [
    zoneName,
    setZoneName,
  ] = useState('');

  const mapElementRef =
    useRef<HTMLDivElement>(
      null
    );

  const mapRef =
    useRef<L.Map | null>(
      null
    );

  const markerRef =
    useRef<L.Marker | null>(
      null
    );

  const [
    promoCode,
    setPromoCode,
  ] = useState('');

  const [
    promoApplied,
    setPromoApplied,
  ] = useState(false);

  const [
    promoDiscount,
    setPromoDiscount,
  ] = useState(0);

  const [
    promoOffer,
    setPromoOffer,
  ] = useState<
    Offer | null
  >(null);

  const [
    validatingPromo,
    setValidatingPromo,
  ] = useState(false);

  const [
    tipAmount,
    setTipAmount,
  ] = useState(0);

  const [
    customTip,
    setCustomTip,
  ] = useState('');

  useEffect(() => {
    setCart(getCart());
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!customer) {
      return;
    }

    setName(
      customer.name || ''
    );

    setPhone(
      customer.phone || ''
    );
  }, [customer]);

  const paymentOptions =
    useMemo<
      PaymentOption[]
    >(() => {
      const options:
        PaymentOption[] = [];

      if (
        orderType ===
        'pickup'
      ) {
        if (
          cashEnabledPickup
        ) {
          options.push({
            value: 'cash',

            label:
              '💵 Cash on Pickup',

            description:
              'Pay cash when you collect',
          });
        }

        if (
          cardEnabledPickup
        ) {
          options.push({
            value: 'card',

            label:
              '💳 Card on Pickup',

            description:
              'Pay by card when you collect',
          });
        }
      } else {
        if (
          cashEnabledDelivery
        ) {
          options.push({
            value: 'cash',

            label:
              '💵 Cash on Delivery',

            description:
              'Pay cash when the rider arrives',
          });
        }

        if (
          cardEnabledDelivery
        ) {
          options.push({
            value: 'card',

            label:
              '💳 Card on Delivery',

            description:
              'Pay by card when the rider arrives',
          });
        }
      }

      return options;
    }, [
      orderType,
      cashEnabledPickup,
      cardEnabledPickup,
      cashEnabledDelivery,
      cardEnabledDelivery,
    ]);

  useEffect(() => {
    if (
      paymentOptions.length >
        0 &&
      !paymentOptions.some(
        (option) =>
          option.value ===
          paymentMethod
      )
    ) {
      setPaymentMethod(
        paymentOptions[0]
          .value
      );
    }
  }, [
    paymentMethod,
    paymentOptions,
  ]);

  useEffect(() => {
    if (
      !showMap ||
      !mapElementRef.current
    ) {
      return;
    }

    mapRef.current?.remove();
    mapRef.current = null;

    const map = L.map(
      mapElementRef.current
    ).setView(
      [
        restaurantLat,
        restaurantLng,
      ],
      13
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution:
          '© OpenStreetMap contributors',
      }
    ).addTo(map);

    const shopIcon =
      L.divIcon({
        className: '',

        html:
          '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid white"></div>',

        iconSize: [
          18,
          18,
        ],

        iconAnchor: [
          9,
          9,
        ],
      });

    L.marker(
      [
        restaurantLat,
        restaurantLng,
      ],
      {
        icon: shopIcon,
      }
    )
      .addTo(map)
      .bindPopup(
        '🍕 Vita Napoli'
      );

    const zones =
      deliveryZones.length >
      0
        ? deliveryZones
        : [
            {
              zone_name:
                'Near Zone',

              min_distance_km:
                0,

              max_distance_km:
                nearRadius,

              charge:
                nearCharge,
            },
            {
              zone_name:
                'Far Zone',

              min_distance_km:
                nearRadius,

              max_distance_km:
                farRadius,

              charge:
                farCharge,
            },
          ];

    zones.forEach(
      (zone) => {
        L.circle(
          [
            restaurantLat,
            restaurantLng,
          ],
          {
            radius:
              zone.max_distance_km *
              1000,

            fillOpacity:
              0.02,

            weight: 1,

            dashArray:
              '5,5',
          }
        ).addTo(map);
      }
    );

    const marker =
      L.marker(
        [
          restaurantLat +
            0.005,

          restaurantLng +
            0.005,
        ],
        {
          draggable:
            true,
        }
      ).addTo(map);

    marker
      .bindPopup(
        '📍 Drag or tap the map'
      )
      .openPopup();

    marker.on(
      'dragend',
      () => {
        const point =
          marker.getLatLng();

        void selectLocation(
          point.lat,
          point.lng
        );
      }
    );

    map.on(
      'click',
      (
        event:
          L.LeafletMouseEvent
      ) => {
        marker.setLatLng(
          event.latlng
        );

        void selectLocation(
          event.latlng.lat,
          event.latlng.lng
        );
      }
    );

    mapRef.current = map;
    markerRef.current =
      marker;

    window.setTimeout(
      () =>
        map.invalidateSize(),
      100
    );

    return () => {
      map.remove();

      mapRef.current =
        null;

      markerRef.current =
        null;
    };
  }, [
    showMap,
    restaurantLat,
    restaurantLng,
    deliveryZones,
    nearRadius,
    farRadius,
    nearCharge,
    farCharge,
  ]);

  async function loadSettings() {
    try {
      const response =
        await client.entities.restaurant_settings.query(
          {
            query: {},
            limit: 1,
          }
        );

      const settings =
        response?.data
          ?.items?.[0] as
          | Record<
              string,
              unknown
            >
          | undefined;

      if (settings) {
        const status =
          String(
            settings.restaurant_status ||
              ''
          ).toLowerCase();

        setShopClosed(
          status ===
            'closed'
        );

        setShopMessage(
          String(
            settings.busy_message ||
              (status ===
              'closed'
                ? 'Restaurant is currently closed.'
                : '')
          )
        );

        setDeliveryEnabled(
          booleanValue(
            settings.delivery_enabled
          )
        );

        setDeliveryCharge(
          numberValue(
            settings.delivery_charges,
            5
          )
        );

        setEstimatedDeliveryTime(
          String(
            settings.estimated_delivery_time ||
              '30-45 min'
          )
        );

        setRestaurantLat(
          numberValue(
            settings.restaurant_lat,
            25.2747
          )
        );

        setRestaurantLng(
          numberValue(
            settings.restaurant_lng,
            56.345
          )
        );

        setNearRadius(
          numberValue(
            settings.near_radius,
            5
          )
        );

        setFarRadius(
          numberValue(
            settings.far_radius,
            15
          )
        );

        setNearCharge(
          numberValue(
            settings.near_charge,
            5
          )
        );

        setFarCharge(
          numberValue(
            settings.far_charge,
            15
          )
        );

        setServiceFeeEnabled(
          booleanValue(
            settings.service_fee_enabled
          )
        );

        setServiceFeeAmount(
          numberValue(
            settings.service_fee_amount
          )
        );

        setServiceFeeType(
          settings.service_fee_type ===
            'percentage'
            ? 'percentage'
            : 'fixed'
        );

        setServiceFeeAppliesTo(
          settings.service_fee_applies_to ===
            'pickup' ||
            settings.service_fee_applies_to ===
              'delivery'
            ? settings.service_fee_applies_to
            : 'both'
        );

        setSmallOrderFeeEnabled(
          booleanValue(
            settings.small_order_fee_enabled
          )
        );

        setSmallOrderFeeAmount(
          numberValue(
            settings.small_order_fee_amount
          )
        );

        setSmallOrderFeeThreshold(
          numberValue(
            settings.small_order_fee_threshold,
            20
          )
        );

        setCashEnabledPickup(
          booleanValue(
            settings.cash_enabled_pickup,
            true
          )
        );

        setCardEnabledPickup(
          booleanValue(
            settings.card_enabled_pickup,
            true
          )
        );

        setCashEnabledDelivery(
          booleanValue(
            settings.cash_enabled_delivery,
            true
          )
        );

        setCardEnabledDelivery(
          booleanValue(
            settings.card_enabled_delivery,
            true
          )
        );

        const codes =
          String(
            settings.allowed_country_codes ||
              '+971'
          )
            .split(',')
            .map((code) =>
              code.trim()
            )
            .filter(Boolean);

        setAllowedCountryCodes(
          codes.length
            ? codes
            : ['+971']
        );
      }

      try {
        const zonesResponse =
          await client.apiCall.invoke(
            {
              url:
                '/api/v1/entities/delivery_zones?query={"is_active":true}&sort=min_distance_km&limit=50',

              method:
                'GET',
            }
          );

        const zones =
          zonesResponse?.data
            ?.items;

        if (
          Array.isArray(
            zones
          )
        ) {
          setDeliveryZones(
            zones as DeliveryZone[]
          );
        }
      } catch {
        setDeliveryZones([]);
      }
    } catch (error) {
      console.error(
        'Failed to load checkout settings:',
        error
      );
    }
  }

  async function selectLocation(
    latitude: number,
    longitude: number
  ) {
    setCustomerLat(
      latitude
    );

    setCustomerLng(
      longitude
    );

    setLocationShared(
      true
    );

    setDeliveryZoneError(
      ''
    );

    try {
      const response =
        await client.apiCall.invoke(
          {
            url:
              '/api/v1/entities/delivery_zones/calculate',

            method:
              'POST',

            data: {
              customer_lat:
                latitude,

              customer_lng:
                longitude,

              restaurant_lat:
                restaurantLat,

              restaurant_lng:
                restaurantLng,
            },
          }
        );

      const result =
        response?.data;

      if (
        !result?.available
      ) {
        throw new Error(
          result?.message ||
            'Delivery is not available at this location.'
        );
      }

      setCalculatedDeliveryCharge(
        numberValue(
          result.charge
        )
      );

      setZoneName(
        String(
          result.zone_name ||
            ''
        )
      );
    } catch (error) {
      const distance =
        distanceKm(
          restaurantLat,
          restaurantLng,
          latitude,
          longitude
        );

      if (
        distance <=
        nearRadius
      ) {
        setCalculatedDeliveryCharge(
          nearCharge
        );

        setZoneName(
          'Near Zone'
        );
      } else if (
        distance <=
        farRadius
      ) {
        setCalculatedDeliveryCharge(
          farCharge
        );

        setZoneName(
          'Far Zone'
        );
      } else {
        setCalculatedDeliveryCharge(
          0
        );

        setZoneName('');

        setDeliveryZoneError(
          error instanceof
            Error
            ? error.message
            : `Delivery not available. Maximum distance is ${farRadius} km.`
        );
      }
    }
  }

  function useMyLocation() {
    if (
      !navigator.geolocation
    ) {
      toast.error(
        'Location service is not supported. Tap the map manually.'
      );

      return;
    }

    setGettingLocation(
      true
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const {
          latitude,
          longitude,
        } =
          position.coords;

        markerRef.current?.setLatLng(
          [
            latitude,
            longitude,
          ]
        );

        mapRef.current?.setView(
          [
            latitude,
            longitude,
          ],
          15
        );

        void selectLocation(
          latitude,
          longitude
        );

        setGettingLocation(
          false
        );
      },

      () => {
        setGettingLocation(
          false
        );

        toast.error(
          'Location permission denied. Tap the map manually.'
        );
      },

      {
        enableHighAccuracy:
          true,

        timeout:
          15000,
      }
    );
  }

  async function applyPromo() {
    if (
      !promoCode.trim()
    ) {
      toast.error(
        'Please enter a promo code'
      );

      return;
    }

    setValidatingPromo(
      true
    );

    try {
      const response =
        await client.entities.offers.query(
          {
            query: {
              is_active:
                true,
            },

            limit: 50,
          }
        );

      const offers =
        (response?.data
          ?.items ||
          []) as Offer[];

      const offer =
        offers.find(
          (item) =>
            item.promo_code?.toLowerCase() ===
            promoCode
              .trim()
              .toLowerCase()
        );

      if (
        !offer ||
        numberValue(
          offer.discount_percent
        ) <= 0
      ) {
        throw new Error(
          'Invalid or expired promo code'
        );
      }

      let orders:
        Array<
          Record<
            string,
            unknown
          >
        > = [];

      try {
        const result =
          await customerApiRequest<
            | {
                items?: Array<
                  Record<
                    string,
                    unknown
                  >
                >;
              }
            | Array<
                Record<
                  string,
                  unknown
                >
              >
          >(
            '/api/v1/orders/my-orders',
            'GET'
          );

        orders =
          Array.isArray(
            result
          )
            ? result
            : result.items ||
              [];
      } catch {
        orders = [];
      }

      const validOrders =
        orders.filter(
          (order) =>
            order.status !==
              'cancelled' &&
            order.status !==
              'expired'
        );

      if (
        offer.first_order_only &&
        validOrders.length >
          0
      ) {
        throw new Error(
          'This offer is for first orders only'
        );
      }

      const limit =
        numberValue(
          offer.usage_limit_per_customer,
          1
        );

      const code =
        offer.promo_code.toUpperCase();

      const used =
        validOrders.filter(
          (order) =>
            String(
              order.order_notes ||
                ''
            )
              .toUpperCase()
              .includes(
                `PROMO: ${code}`
              )
        ).length;

      if (
        limit > 0 &&
        used >= limit
      ) {
        throw new Error(
          'Promo usage limit reached'
        );
      }

      setPromoOffer(
        offer
      );

      setPromoDiscount(
        numberValue(
          offer.discount_percent
        )
      );

      setPromoApplied(
        true
      );

      toast.success(
        `Promo applied: ${offer.discount_percent}% off`
      );
    } catch (error) {
      setPromoOffer(
        null
      );

      setPromoDiscount(
        0
      );

      setPromoApplied(
        false
      );

      toast.error(
        error instanceof
          Error
          ? error.message
          : 'Promo validation failed'
      );
    } finally {
      setValidatingPromo(
        false
      );
    }
  }

  const subtotal =
    getCartTotal(cart);

  const currentDeliveryFee =
    orderType ===
    'delivery'
      ? locationShared
        ? calculatedDeliveryCharge
        : deliveryCharge
      : 0;

  const discountAmount =
    promoApplied
      ? (subtotal *
          promoDiscount) /
        100
      : 0;

  const serviceFeeAllowed =
    serviceFeeEnabled &&
    (serviceFeeAppliesTo ===
      'both' ||
      serviceFeeAppliesTo ===
        orderType);

  const serviceFee =
    serviceFeeAllowed
      ? serviceFeeType ===
        'percentage'
        ? (subtotal *
            serviceFeeAmount) /
          100
        : serviceFeeAmount
      : 0;

  const smallOrderFee =
    smallOrderFeeEnabled &&
    subtotal <
      smallOrderFeeThreshold
      ? smallOrderFeeAmount
      : 0;

  const total =
    Math.max(
      0,
      subtotal +
        currentDeliveryFee +
        serviceFee +
        smallOrderFee +
        tipAmount -
        discountAmount
    );

  function validate() {
    const next:
      Record<
        string,
        string
      > = {};

    const cleanedPhone =
      phone.replace(
        /[\s\-()]/g,
        ''
      );

    const digits =
      cleanedPhone.replace(
        /\D/g,
        ''
      );

    if (!isLoggedIn) {
      next.auth =
        'Please login to place your order';
    }

    if (!name.trim()) {
      next.name =
        'Please enter your name';
    }

    if (
      digits.length < 9
    ) {
      next.phone =
        'Please enter a valid phone number';
    }

    if (
      orderType ===
      'delivery'
    ) {
      const validCode =
        allowedCountryCodes.some(
          (code) => {
            const value =
              code.replace(
                /[\s\-()]/g,
                ''
              );

            return (
              cleanedPhone.startsWith(
                value
              ) ||
              cleanedPhone.startsWith(
                `00${value.replace(
                  '+',
                  ''
                )}`
              ) ||
              (value ===
                '+971' &&
                /^05\d{8}$/.test(
                  cleanedPhone
                ))
            );
          }
        );

      if (!validCode) {
        next.phone =
          `Use an allowed country code: ${allowedCountryCodes.join(', ')}`;
      }

      if (
        !locationShared
      ) {
        next.location =
          'Select your delivery location on the map';
      }

      if (
        deliveryZoneError
      ) {
        next.location =
          deliveryZoneError;
      }
    }

    if (
      cart.length === 0
    ) {
      next.cart =
        'Your cart is empty';
    }

    if (
      paymentOptions.length ===
      0
    ) {
      next.payment =
        'No payment method is available';
    }

    return next;
  }

  async function submitOrder(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submittingRef.current ||
      submitting
    ) {
      return;
    }

    if (shopClosed) {
      toast.error(
        shopMessage ||
          'Restaurant is closed'
      );

      return;
    }

    if (!isLoggedIn) {
      toast.error(
        'Please login first'
      );

      navigate(
        '/account'
      );

      return;
    }

    const nextErrors =
      validate();

    setErrors(
      nextErrors
    );

    if (
      Object.keys(
        nextErrors
      ).length > 0
    ) {
      toast.error(
        'Please fix the highlighted fields'
      );

      return;
    }

    submittingRef.current =
      true;

    setSubmitting(
      true
    );

    try {
      const noteParts = [
        notes.trim(),
      ];

      if (
        orderType ===
          'pickup' &&
        carInfo.trim()
      ) {
        noteParts.push(
          `Car: ${carInfo.trim()}`
        );
      }

      if (
        orderType ===
        'delivery'
      ) {
        if (
          deliveryAddress.trim()
        ) {
          noteParts.push(
            `Delivery Address: ${deliveryAddress.trim()}`
          );
        }

        noteParts.push(
          `Delivery Fee: AED ${currentDeliveryFee.toFixed(2)}`
        );

        if (zoneName) {
          noteParts.push(
            `Zone: ${zoneName}`
          );
        }

        if (
          customerLat !==
            null &&
          customerLng !==
            null
        ) {
          noteParts.push(
            `GPS: ${customerLat.toFixed(6)},${customerLng.toFixed(6)}`
          );
        }
      }

      if (
        promoApplied &&
        promoOffer
      ) {
        noteParts.push(
          `Promo: ${promoOffer.promo_code} (-${promoDiscount}%)`
        );
      }

      noteParts.push(
        `Order Type: ${
          orderType ===
          'delivery'
            ? 'Delivery'
            : 'Pickup'
        }`
      );

      const paymentLabel =
        paymentMethod ===
        'cash'
          ? orderType ===
            'delivery'
            ? 'Cash on Delivery'
            : 'Cash on Pickup'
          : orderType ===
            'delivery'
            ? 'Card on Delivery'
            : 'Card on Pickup';

      const result =
        await customerApiRequest<{
          order_id: number;
        }>(
          '/api/v1/orders/place',
          'POST',
          {
            customer_name:
              name.trim(),

            customer_phone:
              phone.trim(),

            order_notes:
              noteParts
                .filter(
                  Boolean
                )
                .join(
                  ' | '
                ),

            payment_method:
              paymentLabel,

            total_amount:
              Number(
                total.toFixed(
                  2
                )
              ),

            service_fee:
              Number(
                serviceFee.toFixed(
                  2
                )
              ),

            small_order_fee:
              Number(
                smallOrderFee.toFixed(
                  2
                )
              ),

            tip_amount:
              Number(
                tipAmount.toFixed(
                  2
                )
              ),

            tip_type:
              tipAmount > 0
                ? orderType ===
                  'delivery'
                  ? 'rider'
                  : 'shop'
                : '',

            items_json:
              JSON.stringify(
                cart.map(
                  (item) => ({
                    name:
                      item
                        .menuItem
                        .name,

                    size:
                      item.size,

                    quantity:
                      item.quantity,

                    extras:
                      item.extras.map(
                        (
                          extra
                        ) =>
                          extra.name
                      ),

                    price:
                      item.totalPrice,
                  })
                )
              ),

            order_type:
              orderType,

            customer_lat:
              orderType ===
              'delivery'
                ? customerLat
                : null,

            customer_lng:
              orderType ===
              'delivery'
                ? customerLng
                : null,
          }
        );

      localStorage.setItem(
        'vita_customer_name',
        name.trim()
      );

      localStorage.setItem(
        'vita_customer_phone',
        phone.trim()
      );

      clearCart();

      window.dispatchEvent(
        new Event(
          'cart-updated'
        )
      );

      toast.success(
        `Order #${result.order_id} placed successfully`
      );

      navigate(
        '/order-confirmation',
        {
          state: {
            orderId:
              result.order_id,
          },
        }
      );
    } catch (error) {
      const message =
        axios.isAxiosError(
          error
        )
          ? error.response
              ?.data
              ?.detail ||
            error.message
          : error instanceof
            Error
            ? error.message
            : 'Failed to place order';

      toast.error(
        message
      );

      console.error(
        'Order placement failed:',
        error
      );
    } finally {
      submittingRef.current =
        false;

      setSubmitting(
        false
      );
    }
  }

  if (authLoading) {
    return (
      <CustomerLayout>
        <div className="min-h-screen bg-black flex items-center justify-center text-gray-400">
          Loading...
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="min-h-screen bg-black px-4 py-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">
          {t(
            'checkout.title'
          )}
        </h1>

        {!isLoggedIn && (
          <div className="mb-5 rounded-xl border border-red-600/30 bg-red-600/10 p-4">
            <p className="text-sm text-red-400 mb-3">
              Please login to
              place your order.
            </p>

            <Button
              type="button"
              onClick={() =>
                navigate(
                  '/account'
                )
              }
              className="bg-red-600 hover:bg-red-700"
            >
              Login / Sign Up
            </Button>
          </div>
        )}

        {shopMessage && (
          <div
            className={`mb-5 rounded-xl border p-4 ${
              shopClosed
                ? 'border-orange-600/30 bg-orange-600/10 text-orange-300'
                : 'border-yellow-600/30 bg-yellow-600/10 text-yellow-300'
            }`}
          >
            {shopMessage}
          </div>
        )}

        <form
          onSubmit={
            submitOrder
          }
          className="space-y-6"
        >
          {deliveryEnabled && (
            <section>
              <Label className="text-gray-300 mb-3 block">
                {t(
                  'checkout.order_type'
                )}
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOrderType(
                      'pickup'
                    );

                    setShowMap(
                      false
                    );
                  }}
                  className={`rounded-xl border-2 p-4 ${
                    orderType ===
                    'pickup'
                      ? 'border-red-600 bg-red-600/10'
                      : 'border-gray-700 bg-gray-900'
                  }`}
                >
                  <Car className="mx-auto mb-2 text-red-400" />

                  <span className="text-white">
                    {t(
                      'checkout.pickup'
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderType(
                      'delivery'
                    );

                    setShowMap(
                      true
                    );
                  }}
                  className={`rounded-xl border-2 p-4 ${
                    orderType ===
                    'delivery'
                      ? 'border-red-600 bg-red-600/10'
                      : 'border-gray-700 bg-gray-900'
                  }`}
                >
                  <MapPin className="mx-auto mb-2 text-red-400" />

                  <span className="text-white">
                    {t(
                      'checkout.delivery'
                    )}
                  </span>
                </button>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div>
              <Label
                htmlFor="name"
                className="text-gray-300"
              >
                {t(
                  'checkout.your_name'
                )}{' '}
                *
              </Label>

              <Input
                id="name"
                value={name}
                onChange={(
                  event
                ) =>
                  setName(
                    event.target
                      .value
                  )
                }
                className="mt-1 bg-gray-900 border-gray-700 text-white"
              />

              {errors.name && (
                <p className="text-xs text-red-400 mt-1">
                  ⚠️{' '}
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="phone"
                className="text-gray-300"
              >
                {t(
                  'checkout.phone'
                )}{' '}
                *
              </Label>

              <Input
                id="phone"
                value={phone}
                onChange={(
                  event
                ) =>
                  setPhone(
                    event.target
                      .value
                  )
                }
                placeholder={`${allowedCountryCodes[0]} XX XXX XXXX`}
                className="mt-1 bg-gray-900 border-gray-700 text-white"
              />

              {errors.phone && (
                <p className="text-xs text-red-400 mt-1">
                  ⚠️{' '}
                  {errors.phone}
                </p>
              )}
            </div>

            {orderType ===
              'delivery' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-gray-300">
                      Delivery
                      Location *
                    </Label>

                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        gettingLocation
                      }
                      onClick={
                        useMyLocation
                      }
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Navigation className="w-3 h-3 mr-1" />

                      {gettingLocation
                        ? 'Getting...'
                        : 'My Location'}
                    </Button>
                  </div>

                  <div
                    ref={
                      mapElementRef
                    }
                    className="h-[250px] rounded-xl border border-gray-700 overflow-hidden"
                  />

                  {locationShared &&
                    !deliveryZoneError && (
                      <p className="mt-2 text-sm text-green-400 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />

                        Location
                        selected

                        {zoneName
                          ? ` (${zoneName})`
                          : ''}

                        {' — '}AED{' '}

                        {calculatedDeliveryCharge.toFixed(
                          2
                        )}
                      </p>
                    )}

                  {deliveryZoneError && (
                    <p className="mt-2 text-sm text-red-400">
                      ❌{' '}
                      {
                        deliveryZoneError
                      }
                    </p>
                  )}

                  {errors.location &&
                    !deliveryZoneError && (
                      <p className="mt-2 text-xs text-red-400">
                        ⚠️{' '}
                        {
                          errors.location
                        }
                      </p>
                    )}
                </div>

                <div>
                  <Label
                    htmlFor="address"
                    className="text-gray-300"
                  >
                    Building, floor
                    and apartment
                  </Label>

                  <Textarea
                    id="address"
                    value={
                      deliveryAddress
                    }
                    onChange={(
                      event
                    ) =>
                      setDeliveryAddress(
                        event.target
                          .value
                      )
                    }
                    className="mt-1 bg-gray-900 border-gray-700 text-white"
                  />

                  <p className="mt-1 text-xs text-gray-500">
                    Estimated
                    delivery:{' '}
                    {
                      estimatedDeliveryTime
                    }
                  </p>
                </div>
              </>
            )}

            {orderType ===
              'pickup' && (
              <div>
                <Label
                  htmlFor="carInfo"
                  className="text-gray-300"
                >
                  Car number and
                  color (optional)
                </Label>

                <Input
                  id="carInfo"
                  value={carInfo}
                  onChange={(
                    event
                  ) =>
                    setCarInfo(
                      event.target
                        .value
                    )
                  }
                  className="mt-1 bg-gray-900 border-gray-700 text-white"
                />
              </div>
            )}

            <div>
              <Label
                htmlFor="notes"
                className="text-gray-300"
              >
                {t(
                  'checkout.order_notes'
                )}
              </Label>

              <Textarea
                id="notes"
                value={notes}
                onChange={(
                  event
                ) =>
                  setNotes(
                    event.target
                      .value
                  )
                }
                className="mt-1 bg-gray-900 border-gray-700 text-white"
              />
            </div>
          </section>

          <section>
            <Label className="text-gray-300 mb-2 block">
              {t(
                'checkout.promo_code'
              )}
            </Label>

            {promoApplied ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-600/30 bg-green-600/10 p-3">
                <Tag className="text-green-400" />

                <div className="flex-1">
                  <p className="text-green-400">
                    {
                      promoOffer?.promo_code
                    }{' '}
                    applied
                  </p>

                  <p className="text-xs text-green-400/70">
                    Saving AED{' '}

                    {discountAmount.toFixed(
                      2
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPromoApplied(
                      false
                    );

                    setPromoOffer(
                      null
                    );

                    setPromoDiscount(
                      0
                    );

                    setPromoCode(
                      ''
                    );
                  }}
                  className="text-xs text-gray-400"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={
                    promoCode
                  }
                  onChange={(
                    event
                  ) =>
                    setPromoCode(
                      event.target
                        .value
                    )
                  }
                  className="bg-gray-900 border-gray-700 text-white"
                />

                <Button
                  type="button"
                  onClick={() =>
                    void applyPromo()
                  }
                  disabled={
                    validatingPromo
                  }
                  className="bg-gray-800"
                >
                  {validatingPromo
                    ? '...'
                    : t(
                        'checkout.apply'
                      )}
                </Button>
              </div>
            )}
          </section>

          <section>
            <Label className="text-gray-300 mb-3 block">
              💝 Add a Tip
            </Label>

            <div className="flex flex-wrap gap-2">
              {[
                0,
                5,
                10,
                15,
              ].map(
                (amount) => (
                  <button
                    key={
                      amount
                    }
                    type="button"
                    onClick={() => {
                      setTipAmount(
                        amount
                      );

                      setCustomTip(
                        ''
                      );
                    }}
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      tipAmount ===
                        amount &&
                      !customTip
                        ? 'border-green-500 text-green-400'
                        : 'border-gray-700 text-gray-400'
                    }`}
                  >
                    {amount ===
                    0
                      ? 'No Tip'
                      : `AED ${amount}`}
                  </button>
                )
              )}

              <Input
                type="number"
                min="0"
                value={
                  customTip
                }
                onChange={(
                  event
                ) => {
                  setCustomTip(
                    event.target
                      .value
                  );

                  setTipAmount(
                    Math.max(
                      0,
                      numberValue(
                        event.target
                          .value
                      )
                    )
                  );
                }}
                placeholder="Custom"
                className="w-28 bg-gray-900 border-gray-700 text-white"
              />
            </div>
          </section>

          <section>
            <Label className="text-gray-300 mb-3 block">
              {t(
                'checkout.payment_method'
              )}
            </Label>

            {paymentOptions.length >
            0 ? (
              <RadioGroup
                value={
                  paymentMethod
                }
                onValueChange={(
                  value
                ) =>
                  setPaymentMethod(
                    value as PaymentMethod
                  )
                }
                className="space-y-3"
              >
                {paymentOptions.map(
                  (option) => (
                    <label
                      key={
                        option.value
                      }
                      className="flex items-center gap-3 rounded-xl border border-gray-700 p-4"
                    >
                      <RadioGroupItem
                        value={
                          option.value
                        }
                      />

                      <div>
                        <p className="text-white">
                          {
                            option.label
                          }
                        </p>

                        <p className="text-sm text-gray-500">
                          {
                            option.description
                          }
                        </p>
                      </div>
                    </label>
                  )
                )}
              </RadioGroup>
            ) : (
              <p className="text-red-400">
                No payment method
                available.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h3 className="font-semibold text-white mb-3">
              Order Summary
            </h3>

            {cart.map(
              (item) => (
                <div
                  key={item.id}
                  className="flex justify-between py-1 text-sm"
                >
                  <span className="text-gray-400">
                    {
                      item.quantity
                    }
                    x{' '}
                    {
                      item
                        .menuItem
                        .name
                    }{' '}
                    ({item.size})
                  </span>

                  <span className="text-gray-300">
                    AED{' '}

                    {item.totalPrice.toFixed(
                      2
                    )}
                  </span>
                </div>
              )
            )}

            {errors.cart && (
              <p className="text-xs text-red-400 mt-2">
                ⚠️{' '}
                {errors.cart}
              </p>
            )}

            <div className="mt-3 border-t border-gray-700 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>
                  Subtotal
                </span>

                <span>
                  AED{' '}

                  {subtotal.toFixed(
                    2
                  )}
                </span>
              </div>

              {currentDeliveryFee >
                0 && (
                <div className="flex justify-between text-gray-400">
                  <span>
                    Delivery Fee
                  </span>

                  <span>
                    AED{' '}

                    {currentDeliveryFee.toFixed(
                      2
                    )}
                  </span>
                </div>
              )}

              {serviceFee >
                0 && (
                <div className="flex justify-between text-gray-400">
                  <span>
                    Service Fee
                  </span>

                  <span>
                    AED{' '}

                    {serviceFee.toFixed(
                      2
                    )}
                  </span>
                </div>
              )}

              {smallOrderFee >
                0 && (
                <div className="flex justify-between text-yellow-400">
                  <span>
                    Small Order
                    Fee
                  </span>

                  <span>
                    AED{' '}

                    {smallOrderFee.toFixed(
                      2
                    )}
                  </span>
                </div>
              )}

              {tipAmount >
                0 && (
                <div className="flex justify-between text-green-400">
                  <span>
                    Tip
                  </span>

                  <span>
                    AED{' '}

                    {tipAmount.toFixed(
                      2
                    )}
                  </span>
                </div>
              )}

              {discountAmount >
                0 && (
                <div className="flex justify-between text-green-400">
                  <span>
                    Discount
                  </span>

                  <span>
                    -AED{' '}

                    {discountAmount.toFixed(
                      2
                    )}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-t border-gray-700 pt-2 text-lg font-bold">
                <span className="text-white">
                  Total
                </span>

                <span className="text-red-400">
                  AED{' '}

                  {total.toFixed(
                    2
                  )}
                </span>
              </div>
            </div>
          </section>

          {Object.keys(
            errors
          ).length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-3">
              {Object.values(
                errors
              ).map(
                (error) => (
                  <p
                    key={error}
                    className="text-xs text-red-400"
                  >
                    • {error}
                  </p>
                )
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={
              submitting ||
              shopClosed ||
              !isLoggedIn ||
              (orderType ===
                'delivery' &&
                (!locationShared ||
                  Boolean(
                    deliveryZoneError
                  )))
            }
            className="w-full bg-red-600 hover:bg-red-700 py-6 text-lg font-semibold"
          >
            {submitting
              ? t(
                  'checkout.placing'
                )
              : `${t(
                  'checkout.place_order'
                )} — ${t(
                  'common.aed'
                )} ${total.toFixed(
                  2
                )}`}
          </Button>
        </form>
      </div>
    </CustomerLayout>
  );
}
