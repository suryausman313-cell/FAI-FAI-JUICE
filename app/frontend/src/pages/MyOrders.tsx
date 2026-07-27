import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bike,
  CheckCircle,
  ChefHat,
  Clock,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  ShoppingCart,
  Store,
  X,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import CustomerLayout from '@/components/CustomerLayout';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';
import { client, Order, CartItem } from '@/lib/api';
import { getCart, saveCart } from '@/lib/cart-store';

const PICKUP_STEPS = [
  { key: 'new', label: 'Order Placed', icon: Store },
  { key: 'accepted', label: 'Accepted', icon: CheckCircle },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready!', icon: Package },
];

const DELIVERY_STEPS = [
  { key: 'new', label: 'Order Placed', icon: Store },
  { key: 'accepted', label: 'Confirmed', icon: CheckCircle },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
  { key: 'picked_up', label: 'Picked Up', icon: Bike },
  { key: 'on_the_way', label: 'On the Way', icon: Navigation },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

function getStepIndex(
  status: string,
  steps: typeof PICKUP_STEPS
): number {
  const index = steps.findIndex(
    (step) => step.key === status
  );

  return index >= 0 ? index : -1;
}

function getDeliveryStepIndex(
  orderStatus: string,
  deliveryStatus: string | null
): number {
  if (deliveryStatus === 'delivered') return 6;
  if (deliveryStatus === 'on_the_way') return 5;
  if (deliveryStatus === 'picked_up') return 4;
  if (orderStatus === 'ready') return 3;
  if (orderStatus === 'preparing') return 2;
  if (orderStatus === 'accepted') return 1;
  if (orderStatus === 'new') return 0;

  return -1;
}

function formatDate(
  dateString: string | null | undefined
): string {
  if (!dateString) {
    return 'Date unavailable';
  }

  try {
    const date = new Date(dateString);

    if (
      date.getFullYear() < 2000 ||
      Number.isNaN(date.getTime())
    ) {
      return 'Date unavailable';
    }

    return date.toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function formatDateShort(
  dateString: string | null | undefined
): string {
  if (!dateString) {
    return 'Date unavailable';
  }

  try {
    const date = new Date(dateString);

    if (
      date.getFullYear() < 2000 ||
      Number.isNaN(date.getTime())
    ) {
      return 'Date unavailable';
    }

    return date.toLocaleDateString();
  } catch {
    return 'Date unavailable';
  }
}

function getElapsedMinutes(
  createdAt: string | null | undefined
): number {
  if (!createdAt) {
    return 0;
  }

  try {
    const date = new Date(createdAt);

    if (
      date.getFullYear() < 2000 ||
      Number.isNaN(date.getTime())
    ) {
      return 0;
    }

    return Math.floor(
      (Date.now() - date.getTime()) / 60000
    );
  } catch {
    return 0;
  }
}

interface OrderProgressTrackerProps {
  status: string;
  estimatedTime: string;
  isDelivery: boolean;
  deliveryStatus: string | null;
}

function OrderProgressTracker({
  status,
  estimatedTime,
  isDelivery,
  deliveryStatus,
}: OrderProgressTrackerProps) {
  const steps = isDelivery
    ? DELIVERY_STEPS
    : PICKUP_STEPS;

  const currentStep = isDelivery
    ? getDeliveryStepIndex(status, deliveryStatus)
    : getStepIndex(status, steps);

  if (
    status === 'completed' ||
    status === 'cancelled'
  ) {
    return null;
  }

  if (
    isDelivery &&
    deliveryStatus === 'delivered'
  ) {
    return null;
  }

  return (
    <div className="py-4">
      {estimatedTime && status !== 'new' && (
        <div className="bg-green-600/10 border border-green-600/30 rounded-xl p-3 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-green-400" />
          </div>

          <div>
            <p className="text-green-400 font-bold text-sm">
              Estimated ready time
            </p>

            <p className="text-green-300 text-lg font-bold">
              ~{estimatedTime}
            </p>
          </div>
        </div>
      )}

      <div className="relative">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isCompleted =
            index <= currentStep;
          const isCurrent =
            index === currentStep;

          return (
            <div
              key={step.key}
              className="flex items-start gap-3 relative"
            >
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-[15px] top-[32px] w-0.5 h-8 ${
                    index < currentStep
                      ? 'bg-green-500'
                      : 'bg-gray-700'
                  }`}
                />
              )}

              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-500 border border-gray-700'
                } ${
                  isCurrent
                    ? 'ring-2 ring-green-400/50 ring-offset-2 ring-offset-gray-900'
                    : ''
                }`}
              >
                <StepIcon className="w-4 h-4" />
              </div>

              <div
                className={`pb-6 ${
                  isCurrent ? 'pt-0.5' : 'pt-1'
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    isCompleted
                      ? 'text-white'
                      : 'text-gray-500'
                  } ${
                    isCurrent
                      ? 'text-green-400'
                      : ''
                  }`}
                >
                  {step.label}
                </p>

                {isCurrent && (
                  <p className="text-green-400/60 text-xs mt-0.5">
                    Current status
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RiderContactCardProps {
  riderName: string;
  riderPhone: string;
}

function RiderContactCard({
  riderName,
  riderPhone,
}: RiderContactCardProps) {
  let whatsappPhone = riderPhone
    .replace(/[^0-9+]/g, '')
    .replace('+', '');

  if (whatsappPhone.startsWith('0')) {
    whatsappPhone =
      '971' + whatsappPhone.substring(1);
  }

  if (
    whatsappPhone.length <= 10 &&
    !whatsappPhone.startsWith('971')
  ) {
    whatsappPhone = '971' + whatsappPhone;
  }

  return (
    <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
          <Bike className="w-5 h-5 text-blue-400" />
        </div>

        <div>
          <p className="text-blue-400 font-bold text-sm">
            Your Rider
          </p>

          <p className="text-white font-semibold">
            {riderName}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <a
          href={`tel:${riderPhone}`}
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 px-3 text-sm font-medium transition-colors"
        >
          <Phone className="w-4 h-4" />
          Call
        </a>

        <a
          href={`https://wa.me/${whatsappPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 px-3 text-sm font-medium transition-colors"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}

interface OrderWithDelivery extends Order {
  delivery_status?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
}

interface OrderTimerNotificationProps {
  order: OrderWithDelivery;
  acceptTimeout: number;
  expireTimeout: number;
  onExpired: (orderId: number) => void;
}

function OrderTimerNotification({
  order,
  acceptTimeout,
  expireTimeout,
  onExpired,
}: OrderTimerNotificationProps) {
  const [elapsedMinutes, setElapsedMinutes] =
    useState(
      getElapsedMinutes(order.created_at)
    );

  const [expired, setExpired] =
    useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const minutes = getElapsedMinutes(
        order.created_at
      );

      setElapsedMinutes(minutes);

      if (
        minutes >= expireTimeout &&
        !expired
      ) {
        setExpired(true);
        onExpired(order.id);
      }
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    order.created_at,
    order.id,
    expireTimeout,
    expired,
    onExpired,
  ]);

  if (order.status !== 'new') {
    return null;
  }

  const restaurantPhone = '+971542940112';

  const whatsappMessage = encodeURIComponent(
    `Hello, maine Order #${order.id} place kiya hai. Abhi tak accept nahi hua. Kya aap check kar sakte hain?`
  );

  const whatsappUrl =
    `https://wa.me/${restaurantPhone.replace(
      '+',
      ''
    )}?text=${whatsappMessage}`;

  if (
    elapsedMinutes >= acceptTimeout &&
    elapsedMinutes < expireTimeout
  ) {
    return (
      <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>

          <div className="flex-1">
            <p className="text-yellow-400 font-bold text-sm">
              Restaurant ne abhi tak aapka
              order accept nahi kiya
            </p>

            <p className="text-yellow-400/70 text-xs mt-1">
              {elapsedMinutes} min ho gaye hain
              • Auto-cancel in{' '}
              {expireTimeout - elapsedMinutes}{' '}
              min
            </p>
          </div>
        </div>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-3 px-4 text-sm font-medium transition-colors"
        >
          WhatsApp Restaurant
        </a>
      </div>
    );
  }

  if (
    elapsedMinutes >= expireTimeout ||
    expired
  ) {
    return (
      <div className="bg-red-600/10 border border-red-600/30 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>

          <div className="flex-1">
            <p className="text-red-400 font-bold text-sm">
              Order expired — Restaurant ne
              accept nahi kiya
            </p>

            <p className="text-red-400/70 text-xs mt-1">
              {expireTimeout}+ minutes wait •
              Order auto-cancelled
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl p-3 mb-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 animate-pulse">
        <Clock className="w-5 h-5 text-blue-400" />
      </div>

      <div>
        <p className="text-blue-400 font-bold text-sm">
          Waiting for restaurant to accept
        </p>

        <p className="text-blue-300/70 text-xs">
          {elapsedMinutes} min elapsed •
          Usually accepted within{' '}
          {acceptTimeout} min
        </p>
      </div>
    </div>
  );
}

interface CancelOrderDialogProps {
  orderId: number;
  orderStatus: string;
  onCancel: (
    orderId: number,
    reason: string
  ) => Promise<void>;
  onClose: () => void;
}

function CancelOrderDialog({
  orderId,
  orderStatus,
  onCancel,
  onClose,
}: CancelOrderDialogProps) {
  const [reason, setReason] =
    useState('');

  const [cancelling, setCancelling] =
    useState(false);

  async function handleCancel() {
    setCancelling(true);

    try {
      await onCancel(orderId, reason);
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">
            Cancel Order #{orderId}?
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          {orderStatus === 'new'
            ? 'Your order has not been accepted yet. Are you sure you want to cancel?'
            : `Your order is currently "${orderStatus}". Are you sure you want to cancel?`}
        </p>

        <div className="mb-4">
          <label className="text-gray-300 text-sm block mb-1">
            Reason (optional)
          </label>

          <textarea
            value={reason}
            onChange={(event) =>
              setReason(event.target.value)
            }
            placeholder="e.g. Changed my mind, taking too long..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm resize-none"
            rows={2}
          />
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-gray-600 text-gray-300 cursor-pointer"
          >
            Keep Order
          </Button>

          <Button
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
          >
            {cancelling
              ? 'Cancelling...'
              : 'Yes, Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MyOrders() {
  const navigate = useNavigate();

  const {
    isLoggedIn: customerLoggedIn,
    loading: authLoading,
  } = useCustomerAuth();

  const [orders, setOrders] = useState<
    OrderWithDelivery[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [reviewedOrders, setReviewedOrders] =
    useState<Set<number>>(new Set());

  const [
    cancelDialogOrder,
    setCancelDialogOrder,
  ] = useState<OrderWithDelivery | null>(
    null
  );

  const [acceptTimeout, setAcceptTimeout] =
    useState(5);

  const [expireTimeout, setExpireTimeout] =
    useState(15);

  const [
    allowCancelPreparing,
    setAllowCancelPreparing,
  ] = useState(false);

  const [
    allowCancelReady,
    setAllowCancelReady,
  ] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!customerLoggedIn) {
      setLoading(false);
      return;
    }

    async function loadCustomerData() {
      try {
        setLoading(true);

        await Promise.all([
          loadOrders(),
          loadReviewedOrders(),
          loadSettings(),
        ]);
      } finally {
        setLoading(false);
      }
    }

    void loadCustomerData();

    const interval = window.setInterval(
      () => {
        void loadOrders();
      },
      8000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [authLoading, customerLoggedIn]);

  async function loadSettings() {
    try {
      const response =
        await client.entities.restaurant_settings.query(
          {
            query: {},
            limit: 1,
          }
        );

      const items =
        response?.data?.items || [];

      if (items.length > 0) {
        const settings = items[0] as any;

        if (
          settings.order_accept_timeout_minutes
        ) {
          setAcceptTimeout(
            Number(
              settings.order_accept_timeout_minutes
            ) || 5
          );
        }

        if (
          settings.order_expire_timeout_minutes
        ) {
          setExpireTimeout(
            Number(
              settings.order_expire_timeout_minutes
            ) || 15
          );
        }

        setAllowCancelPreparing(
          settings.allow_cancel_preparing === true
        );

        setAllowCancelReady(
          settings.allow_cancel_ready === true
        );
      }
    } catch {
      // Default settings will be used.
    }
  }

  async function loadReviewedOrders() {
    try {
      const response =
        await client.entities.feedbacks.query({
          query: {},
          limit: 100,
        });

      if (response?.data?.items) {
        const reviewed = new Set<number>(
          response.data.items.map(
            (feedback: any) =>
              feedback.order_id
          )
        );

        setReviewedOrders(reviewed);
      }
    } catch (error) {
      console.error(
        'Failed to load feedbacks:',
        error
      );
    }
  }

  async function loadOrders() {
    try {
      setRefreshing(true);

      const response =
        await client.apiCall.invoke({
          url: '/api/v1/orders/my-orders',
          method: 'GET',
        });

      setOrders(
        response?.data?.items || []
      );
    } catch (error) {
      console.error(
        'Failed to load orders:',
        error
      );
    } finally {
      setRefreshing(false);
    }
  }

  const handleOrderExpired = useCallback(
    async (orderId: number) => {
      try {
        await client.apiCall.invoke({
          url: `/api/v1/orders/${orderId}/cancel`,
          method: 'POST',
          data: {
            reason:
              'Auto-expired: Restaurant did not accept in time',
          },
        });

        await loadOrders();
      } catch (error) {
        console.error(
          'Failed to auto-cancel expired order:',
          error
        );
      }
    },
    []
  );

  async function handleCancelOrder(
    orderId: number,
    reason: string
  ) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/orders/${orderId}/cancel`,
        method: 'POST',
        data: { reason },
      });

      await loadOrders();
    } catch (error: any) {
      const message =
        error?.data?.detail ||
        'Failed to cancel order';

      window.alert(message);
    }
  }

  function canCancelOrder(
    order: OrderWithDelivery
  ): boolean {
    if (order.status === 'new') {
      return true;
    }

    if (order.status === 'accepted') {
      return true;
    }

    if (
      order.status === 'preparing' &&
      allowCancelPreparing
    ) {
      return true;
    }

    if (
      order.status === 'ready' &&
      allowCancelReady
    ) {
      return true;
    }

    return false;
  }

  function handleOrderAgain(
    order: OrderWithDelivery
  ) {
    try {
      let items: any[] = [];

      try {
        items = JSON.parse(
          order.items_json
        );
      } catch {
        return;
      }

      if (items.length === 0) {
        return;
      }

      const cart = getCart();

      for (const item of items) {
        const unitPrice =
          item.price /
          (item.quantity || 1);

        const newCartItem: CartItem = {
          id:
            `reorder-${order.id}-` +
            `${item.name}-${item.size}-` +
            `${Date.now()}-` +
            Math.random()
              .toString(36)
              .slice(2, 6),

          menuItem: {
            id: 0,
            category_id: 0,
            name: item.name,
            description: '',
            price: unitPrice,
            image_url: '',
            is_active: true,
            has_extras: false,
            sort_order: 0,
          } as any,

          size:
            item.size || 'Regular',

          extras: (
            item.extras || []
          ).map(
            (
              extraName: string,
              index: number
            ) => ({
              id: index,
              name: extraName,
              price: 0,
            })
          ),

          quantity:
            item.quantity || 1,

          totalPrice: item.price,
        };

        cart.push(newCartItem);
      }

      saveCart(cart);

      window.dispatchEvent(
        new Event('cart-updated')
      );

      navigate('/cart');
    } catch (error) {
      console.error(
        'Failed to reorder:',
        error
      );
    }
  }

  function isDeliveryOrder(
    order: OrderWithDelivery
  ): boolean {
    if (
      order.delivery_status !== null &&
      order.delivery_status !== undefined
    ) {
      return true;
    }

    return (
      order.order_notes?.includes(
        'Order Type: Delivery'
      ) || false
    );
  }

  function isActiveOrder(
    order: OrderWithDelivery
  ): boolean {
    if (
      order.status === 'completed' ||
      order.status === 'cancelled'
    ) {
      return false;
    }

    if (
      isDeliveryOrder(order) &&
      order.delivery_status === 'delivered'
    ) {
      return false;
    }

    return true;
  }

  if (loading || authLoading) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex items-center justify-center">
          <div className="text-gray-400">
            Loading...
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (!customerLoggedIn) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex flex-col items-center justify-center px-4">
          <h2 className="text-white text-2xl font-bold mb-4">
            Login Required
          </h2>

          <p className="text-gray-400 mb-6">
            Please login to view your orders
          </p>

          <Button
            onClick={() =>
              navigate('/account')
            }
            className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
          >
            Login / Sign Up
          </Button>
        </div>
      </CustomerLayout>
    );
  }

  const activeOrders = orders.filter(
    (order) => isActiveOrder(order)
  );

  const pastOrders = orders.filter(
    (order) => !isActiveOrder(order)
  );

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-white text-2xl font-bold">
            My Orders
          </h1>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void loadOrders()
            }
            disabled={refreshing}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </Button>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">
              🍕
            </div>

            <p className="text-gray-400 text-lg font-medium">
              No orders yet
            </p>

            <p className="text-gray-600 text-sm mt-2">
              Your orders will appear here
              after you place them
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeOrders.length > 0 && (
              <div>
                <h2 className="text-green-400 font-semibold text-sm uppercase tracking-wider mb-3">
                  Active Orders
                </h2>

                <div className="space-y-4">
                  {activeOrders.map(
                    (order) => {
                      let items: any[] = [];

                      try {
                        items = JSON.parse(
                          order.items_json
                        );
                      } catch {
                        items = [];
                      }

                      const isDelivery =
                        isDeliveryOrder(order);

                      const showRiderContact =
                        Boolean(
                          isDelivery &&
                            order.rider_name &&
                            order.rider_phone &&
                            (
                              order.delivery_status ===
                                'picked_up' ||
                              order.delivery_status ===
                                'on_the_way'
                            )
                        );

                      return (
                        <Card
                          key={order.id}
                          className="bg-gray-900 border-green-600/20 border p-4"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold text-lg">
                                Order #{order.id}
                              </span>

                              {isDelivery && (
                                <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs">
                                  <Bike className="w-3 h-3 mr-1" />
                                  Delivery
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-col items-end">
                              {order.delivery_charge >
                                0 && (
                                <span className="text-[10px] text-gray-400">
                                  Delivery: AED{' '}
                                  {order.delivery_charge?.toFixed(
                                    2
                                  )}
                                </span>
                              )}

                              {order.tip_amount >
                                0 && (
                                <span className="text-[10px] text-green-400">
                                  Tip: AED{' '}
                                  {order.tip_amount?.toFixed(
                                    2
                                  )}
                                </span>
                              )}

                              <span className="text-red-400 font-bold">
                                AED{' '}
                                {order.total_amount?.toFixed(
                                  2
                                )}
                              </span>
                            </div>
                          </div>

                          <p className="text-gray-500 text-xs mb-3">
                            {formatDate(
                              order.created_at
                            )}
                          </p>

                          <OrderTimerNotification
                            order={order}
                            acceptTimeout={
                              acceptTimeout
                            }
                            expireTimeout={
                              expireTimeout
                            }
                            onExpired={
                              handleOrderExpired
                            }
                          />

                          {showRiderContact && (
                            <RiderContactCard
                              riderName={
                                order.rider_name!
                              }
                              riderPhone={
                                order.rider_phone!
                              }
                            />
                          )}

                          {isDelivery &&
                            order.delivery_status &&
                            order.delivery_status !==
                              'delivered' && (
                              <Button
                                onClick={() =>
                                  navigate(
                                    `/track/${order.id}`
                                  )
                                }
                                className="w-full mb-3 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                                size="sm"
                              >
                                <Navigation className="w-4 h-4 mr-2" />
                                Track Live on Map
                              </Button>
                            )}

                          <OrderProgressTracker
                            status={order.status}
                            estimatedTime={
                              order.estimated_time
                            }
                            isDelivery={
                              isDelivery
                            }
                            deliveryStatus={
                              order.delivery_status ||
                              null
                            }
                          />

                          <div className="border-t border-gray-800 pt-3">
                            <p className="text-gray-500 text-xs uppercase mb-2">
                              Items
                            </p>

                            {items.map(
                              (
                                item: any,
                                index: number
                              ) => (
                                <div
                                  key={index}
                                  className="flex justify-between text-sm py-0.5"
                                >
                                  <span className="text-gray-300">
                                    {item.quantity}x{' '}
                                    {item.name} (
                                    {item.size})
                                  </span>

                                  <span className="text-gray-400">
                                    AED{' '}
                                    {item.price?.toFixed(
                                      2
                                    )}
                                  </span>
                                </div>
                              )
                            )}
                          </div>

                          {canCancelOrder(
                            order
                          ) && (
                            <div className="mt-3 pt-3 border-t border-gray-800">
                              <Button
                                onClick={() =>
                                  setCancelDialogOrder(
                                    order
                                  )
                                }
                                variant="outline"
                                size="sm"
                                className="border-red-600/50 text-red-400 hover:bg-red-600/10 hover:text-red-300 cursor-pointer w-full"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Cancel Order
                              </Button>
                            </div>
                          )}
                        </Card>
                      );
                    }
                  )}
                </div>
              </div>
            )}

            {pastOrders.length > 0 && (
              <div>
                <h2 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-3">
                  Past Orders
                </h2>

                <div className="space-y-3">
                  {pastOrders.map(
                    (order) => {
                      let items: any[] = [];

                      try {
                        items = JSON.parse(
                          order.items_json
                        );
                      } catch {
                        items = [];
                      }

                      const hasReviewed =
                        reviewedOrders.has(
                          order.id
                        );

                      const completed =
                        order.status ===
                          'completed' ||
                        order.delivery_status ===
                          'delivered';

                      return (
                        <Card
                          key={order.id}
                          className="bg-gray-900/50 border-gray-800 p-4"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-300 font-medium">
                                #{order.id}
                              </span>

                              <Badge
                                className={`${
                                  completed
                                    ? 'bg-gray-700'
                                    : 'bg-red-600/20 text-red-400 border border-red-600/30'
                                } text-xs`}
                              >
                                {completed ? (
                                  <>
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Completed
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3 h-3 mr-1" />
                                    Cancelled
                                  </>
                                )}
                              </Badge>
                            </div>

                            <div className="flex flex-col items-end">
                              {order.delivery_charge >
                                0 && (
                                <span className="text-[10px] text-gray-500">
                                  Delivery: AED{' '}
                                  {order.delivery_charge?.toFixed(
                                    2
                                  )}
                                </span>
                              )}

                              {order.tip_amount >
                                0 && (
                                <span className="text-[10px] text-green-500">
                                  Tip: AED{' '}
                                  {order.tip_amount?.toFixed(
                                    2
                                  )}
                                </span>
                              )}

                              <span className="text-gray-400 font-medium">
                                AED{' '}
                                {order.total_amount?.toFixed(
                                  2
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-1">
                            <p className="text-gray-600 text-xs">
                              {formatDateShort(
                                order.created_at
                              )}{' '}
                              • {items.length}{' '}
                              item
                              {items.length > 1
                                ? 's'
                                : ''}
                            </p>

                            {completed &&
                              (hasReviewed ? (
                                <span className="text-green-500 text-xs flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Reviewed
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/feedback?order=${order.id}`
                                    )
                                  }
                                  className="text-yellow-400 text-xs flex items-center gap-1 hover:text-yellow-300 cursor-pointer"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  Give Feedback
                                </button>
                              ))}
                          </div>

                          {completed && (
                            <div className="mt-3 pt-3 border-t border-gray-800">
                              <Button
                                onClick={() =>
                                  handleOrderAgain(
                                    order
                                  )
                                }
                                size="sm"
                                className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                              >
                                <ShoppingCart className="w-4 h-4 mr-2" />
                                Order Again
                              </Button>
                            </div>
                          )}
                        </Card>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {cancelDialogOrder && (
          <CancelOrderDialog
            orderId={cancelDialogOrder.id}
            orderStatus={
              cancelDialogOrder.status
            }
            onCancel={handleCancelOrder}
            onClose={() =>
              setCancelDialogOrder(null)
            }
          />
        )}
      </div>
    </CustomerLayout>
  );
}
