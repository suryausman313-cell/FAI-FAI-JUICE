import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  Clock3,
  PackageCheck,
  Printer,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Order } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';
import { paymentDisplayLabel } from '@/lib/payment-display';
import {
  DEFAULT_RECEIPT_SETTINGS,
  loadReceiptSettings,
  printKitchenOrder,
  ReceiptSettings,
} from '@/lib/kitchen-print-bridge';

const KITCHEN_PIN_STORAGE_KEY = 'kitchen_pin';
const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

type HistoryDay = 'today' | 'yesterday';

function uaeDateKey(value: string | null | undefined): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Date(date.getTime() + UAE_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function requiredDateKey(day: HistoryDay): string {
  const now = new Date(Date.now() + UAE_OFFSET_MS);

  if (day === 'yesterday') {
    now.setUTCDate(now.getUTCDate() - 1);
  }

  return now.toISOString().slice(0, 10);
}

function formatUaeTime(value: string | null | undefined): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatMoney(value: unknown): string {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function normalizedStatus(value: string | null | undefined): string {
  const status = String(value || 'new').toLowerCase().trim();

  if (
    ['pending', 'placed', 'order_placed', 'created'].includes(status)
  ) {
    return 'new';
  }

  return status;
}

function statusClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-600/20 text-green-400 border-green-600/30';
    case 'cancelled':
      return 'bg-red-600/20 text-red-400 border-red-600/30';
    case 'ready':
      return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
    case 'out_for_delivery':
      return 'bg-blue-700/20 text-blue-300 border-blue-700/30';
    case 'preparing':
      return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30';
    case 'accepted':
      return 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30';
    default:
      return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new':
      return 'NEW';
    case 'accepted':
      return 'ACCEPTED';
    case 'preparing':
      return 'PREPARING';
    case 'ready':
      return 'READY';
    case 'out_for_delivery':
      return 'DELIVERY PENDING';
    case 'completed':
      return 'COMPLETED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return status.toUpperCase();
  }
}

function orderType(order: Order): string {
  return String(order.order_notes || '').toLowerCase().includes('order type: delivery')
    ? 'Delivery'
    : 'Pickup';
}

function parseItems(order: Order): any[] {
  try {
    const items = JSON.parse(order.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export default function KitchenHistoryPanel({
  day,
}: {
  day: HistoryDay;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    ...DEFAULT_RECEIPT_SETTINGS,
  });

  const loadOrders = useCallback(async (silent = false) => {
    const pin =
      localStorage.getItem(KITCHEN_PIN_STORAGE_KEY) || '';
    const baseURL = getAPIBaseURL().replace(/\/$/, '');

    if (!silent) setRefreshing(true);

    try {
      const response = await axios.get<{
        items?: Order[];
      }>(`${baseURL}/api/v1/admin/kitchen/orders`, {
        params: {
          limit: 200,
          ...(Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0) > 0
            ? { branch_id: Number(localStorage.getItem('fai_fai_kitchen_branch_id')) }
            : {}),
        },
        headers: {
          'X-Kitchen-Pin': pin,
          ...(Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0) > 0
            ? { 'X-Branch-Id': String(Number(localStorage.getItem('fai_fai_kitchen_branch_id'))) }
            : {}),
        },
      });

      setOrders(
        Array.isArray(response.data?.items)
          ? response.data.items
          : [],
      );
    } catch (error: any) {
      const detail = error?.response?.data?.detail;

      if (error?.response?.status === 401) {
        toast.error('Open Live Orders and login with Kitchen PIN first');
      } else {
        toast.error(detail || 'Could not load kitchen history');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReceiptSettings().then(setReceiptSettings);
    void loadOrders();

    const interval = window.setInterval(() => {
      void loadOrders(true);
    }, 15000);

    return () => window.clearInterval(interval);
  }, [loadOrders]);

  const dateKey = requiredDateKey(day);

  const dayOrders = useMemo(
    () =>
      orders
        .filter(order => uaeDateKey(order.created_at) === dateKey)
        .sort(
          (first, second) =>
            new Date(second.created_at || 0).getTime() -
            new Date(first.created_at || 0).getTime(),
        ),
    [dateKey, orders],
  );

  const completedCount = dayOrders.filter(
    order => normalizedStatus(order.status) === 'completed',
  ).length;

  const cancelledCount = dayOrders.filter(
    order => normalizedStatus(order.status) === 'cancelled',
  ).length;

  const validSalesTotal = dayOrders
    .filter(order => normalizedStatus(order.status) === 'completed')
    .reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0,
    );

  return (
    <div className="min-h-[calc(100vh-76px)] bg-gray-950 px-3 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-white text-xl font-bold capitalize">
              {day} Orders
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              New, preparing, ready, completed and cancelled together
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadOrders()}
            disabled={refreshing}
            className="border-gray-700 text-gray-400"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing ? 'animate-spin' : ''
              }`}
            />
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="bg-gray-900 border-gray-800 p-3">
            <ShoppingBag className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-white font-bold text-lg">
              {dayOrders.length}
            </p>
            <p className="text-gray-500 text-xs">All Orders</p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 mb-2" />
            <p className="text-green-300 font-bold text-lg">
              {completedCount}
            </p>
            <p className="text-gray-500 text-xs">Completed</p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-3">
            <XCircle className="w-4 h-4 text-red-400 mb-2" />
            <p className="text-red-300 font-bold text-lg">
              {cancelledCount}
            </p>
            <p className="text-gray-500 text-xs">Cancelled</p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-3">
            <PackageCheck className="w-4 h-4 text-yellow-400 mb-2" />
            <p className="text-yellow-300 font-bold text-lg">
              AED {formatMoney(validSalesTotal)}
            </p>
            <p className="text-gray-500 text-xs">
              Completed Sales
            </p>
          </Card>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-500">
            Loading orders...
          </div>
        ) : dayOrders.length === 0 ? (
          <div className="text-center py-20">
            <Clock3 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">
              No {day} orders found
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayOrders.map(order => {
              const status = normalizedStatus(order.status);
              const items = parseItems(order);

              return (
                <Card
                  key={order.id}
                  className={`bg-gray-900 p-4 ${
                    status === 'cancelled'
                      ? 'border-red-900/60'
                      : status === 'completed'
                        ? 'border-green-900/50'
                        : 'border-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold text-lg">
                          #{order.id}
                        </p>
                        <Badge
                          variant="outline"
                          className={statusClasses(status)}
                        >
                          {statusLabel(status)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-gray-300 border-gray-700"
                        >
                          {orderType(order)}
                        </Badge>
                      </div>

                      <p className="text-gray-500 text-xs mt-1">
                        {formatUaeTime(order.created_at)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const latest = await loadReceiptSettings();
                        setReceiptSettings(latest);
                        await printKitchenOrder(
                          order,
                          latest,
                          'copy',
                          false,
                        );
                      }}
                      className="text-gray-400 hover:text-orange-400 p-2"
                      title="Reprint order"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <p className="text-gray-200 font-medium">
                      {order.customer_name || 'Customer'}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {order.customer_phone || 'No phone'}
                    </p>
                  </div>

                  <div className="mt-3 space-y-1">
                    {items.map((item, index) => (
                      <p
                        key={`${order.id}-${index}`}
                        className="text-gray-400 text-sm"
                      >
                        {Number(item.quantity || 1)}x{' '}
                        {String(item.name || 'Item')}
                        {item.size ? ` (${item.size})` : ''}
                      </p>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
                    <p className="text-gray-500 text-xs">
                      {paymentDisplayLabel(order.payment_method)}
                    </p>
                    <p
                      className={`font-bold ${
                        status === 'cancelled'
                          ? 'text-red-400 line-through'
                          : 'text-green-400'
                      }`}
                    >
                      AED {formatMoney(order.total_amount)}
                    </p>
                  </div>

                  {status === 'cancelled' && order.order_notes && (
                    <p className="text-red-300/80 text-xs mt-3">
                      {order.order_notes}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
