import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  KeyRound,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api';

interface Customer {
  user_id?: string;
  customer_name: string;
  customer_phone: string;
  total_orders: number;
  total_spent: number;
  last_order_date?: string | null;
  is_online: boolean;
  last_active?: string | null;
  first_seen?: string | null;
  is_guest?: boolean;
}

interface PinAccount {
  id: number;
  customer_name: string;
  phone: string;
  phone_verified: boolean;
  is_locked: boolean;
  locked_until?: string | null;
  last_login_at?: string | null;
  updated_at?: string | null;
}

interface ResetResult {
  customerName: string;
  phone: string;
  pin: string;
  accountCreated: boolean;
}

type FilterStatus = 'all' | 'online' | 'offline';

function phoneKey(value: string | undefined | null): string {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('00971')) return digits.slice(2);
  if (digits.startsWith('971')) return digits;
  if (digits.startsWith('0') && digits.length >= 9) {
    return `971${digits.slice(1)}`;
  }

  return digits;
}

function whatsappPhone(value: string): string {
  return phoneKey(value);
}

function errorMessage(error: any, fallback: string): string {
  return (
    error?.data?.detail ||
    error?.response?.data?.detail ||
    error?.message ||
    fallback
  );
}

export default function AdminCustomers() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pinAccounts, setPinAccounts] = useState<PinAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] =
    useState<FilterStatus>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [resetCustomer, setResetCustomer] =
    useState<Customer | null>(null);
  const [newPin, setNewPin] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] =
    useState<ResetResult | null>(null);

  const pinAccountMap = useMemo(() => {
    const map = new Map<string, PinAccount>();

    pinAccounts.forEach(account => {
      const key = phoneKey(account.phone);
      if (key) map.set(key, account);
    });

    return map;
  }, [pinAccounts]);


  // Customer signup is stored in customer_pin_accounts_v2.
  // The old customer endpoint mostly returns visitors/orders, so merge both
  // sources here. This makes a newly signed-up customer visible immediately,
  // even before placing an order.
  const allCustomers = useMemo(() => {
    const map = new Map<string, Customer>();

    customers.forEach(customer => {
      const key =
        phoneKey(customer.customer_phone) ||
        String(customer.user_id || '');

      if (!key) return;

      map.set(key, {
        ...customer,
        total_orders: Number(customer.total_orders || 0),
        total_spent: Number(customer.total_spent || 0),
        is_online: Boolean(customer.is_online),
      });
    });

    pinAccounts.forEach(account => {
      const key = phoneKey(account.phone);
      if (!key) return;

      const existing = map.get(key);

      if (existing) {
        map.set(key, {
          ...existing,
          customer_name:
            account.customer_name ||
            existing.customer_name ||
            'Customer',
          customer_phone:
            account.phone || existing.customer_phone,
          is_guest: false,
          last_active:
            existing.last_active ||
            account.last_login_at ||
            account.updated_at ||
            null,
        });
        return;
      }

      map.set(key, {
        user_id: `pin:${account.id}`,
        customer_name: account.customer_name || 'Customer',
        customer_phone: account.phone,
        total_orders: 0,
        total_spent: 0,
        last_order_date: null,
        is_online: false,
        last_active:
          account.last_login_at || account.updated_at || null,
        first_seen: account.updated_at || null,
        is_guest: false,
      });
    });

    return Array.from(map.values()).sort((first, second) => {
      const firstDate = new Date(
        first.last_active ||
          first.last_order_date ||
          first.first_seen ||
          0
      ).getTime();

      const secondDate = new Date(
        second.last_active ||
          second.last_order_date ||
          second.first_seen ||
          0
      ).getTime();

      return secondDate - firstDate;
    });
  }, [customers, pinAccounts]);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allCustomers.filter(customer => {
      const matchesSearch =
        !query ||
        String(customer.customer_name || '')
          .toLowerCase()
          .includes(query) ||
        String(customer.customer_phone || '')
          .toLowerCase()
          .includes(query);

      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'online' && customer.is_online) ||
        (filterStatus === 'offline' && !customer.is_online);

      return matchesSearch && matchesStatus;
    });
  }, [allCustomers, filterStatus, search]);

  const mergedTotalCustomers = allCustomers.length;
  const mergedOnlineCount = allCustomers.filter(
    customer => customer.is_online
  ).length;

  const loadPinAccounts = useCallback(async () => {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/admin/customer-pin/accounts',
        method: 'GET',
        data: { limit: 500 },
      });

      setPinAccounts(res.data?.items || []);
    } catch (error) {
      console.error('Failed to load customer PIN accounts:', error);
    }
  }, []);

  const loadCustomers = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);

      try {
        const params: Record<string, string | number> = {
          limit: 500,
        };

        const res = await client.apiCall.invoke({
          url: '/api/v1/admin/customers-enhanced',
          method: 'GET',
          data: params,
        });

        setCustomers(res.data?.items || []);
      } catch (error) {
        console.error('Failed to load customers:', error);

        try {
          const params: Record<string, string | number> = {
            limit: 500,
          };

          const res = await client.apiCall.invoke({
            url: '/api/v1/admin/customers',
            method: 'GET',
            data: params,
          });

          const items = res.data?.items || [];
          setCustomers(items);
        } catch (fallbackError) {
          console.error(
            'Failed to load fallback customers:',
            fallbackError
          );
        }
      } finally {
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    async function checkAuthAndLoad() {
      const auth = localStorage.getItem('admin_auth');

      if (!auth) {
        navigate('/admin');
        setLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(auth);
        if (!parsed.loggedIn) {
          navigate('/admin');
          setLoading(false);
          return;
        }
      } catch {
        navigate('/admin');
        setLoading(false);
        return;
      }

      await Promise.all([loadCustomers(), loadPinAccounts()]);
      setLoading(false);
    }

    void checkAuthAndLoad();
  }, [loadCustomers, loadPinAccounts, navigate]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadCustomers(true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadCustomers]);

  function formatTimeAgo(
    dateStr: string | undefined | null
  ): string {
    if (!dateStr) return 'Never';

    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'Just now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  async function refreshAll() {
    await Promise.all([loadCustomers(), loadPinAccounts()]);
  }

  function openResetDialog(customer: Customer) {
    if (!customer.customer_phone) {
      toast.error('This customer does not have a mobile number');
      return;
    }

    setResetCustomer(customer);
    setNewPin('');
    setResetResult(null);
  }

  function closeResetDialog() {
    if (resetting) return;

    setResetCustomer(null);
    setNewPin('');
    setResetResult(null);
  }

  async function resetCustomerPin() {
    if (!resetCustomer) return;

    if (!/^\d{4}$/.test(newPin)) {
      toast.error('New PIN must be exactly 4 digits');
      return;
    }

    setResetting(true);

    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/admin/customer-pin/reset',
        method: 'POST',
        data: {
          phone: resetCustomer.customer_phone,
          new_pin: newPin,
        },
      });

      const result: ResetResult = {
        customerName:
          res.data?.customer?.customer_name ||
          resetCustomer.customer_name ||
          'Customer',
        phone:
          res.data?.customer?.phone ||
          resetCustomer.customer_phone,
        pin: newPin,
        accountCreated: Boolean(res.data?.account_created),
      };

      setResetResult(result);
      toast.success(
        result.accountCreated
          ? 'PIN account created successfully'
          : 'Customer PIN reset successfully'
      );

      await loadPinAccounts();
    } catch (error: any) {
      toast.error(
        errorMessage(error, 'Could not reset customer PIN')
      );
    } finally {
      setResetting(false);
    }
  }

  function openResetWhatsApp() {
    if (!resetResult) return;

    const number = whatsappPhone(resetResult.phone);
    if (!number) {
      toast.error('Customer WhatsApp number is invalid');
      return;
    }

    const message = encodeURIComponent(
      `Vita Napoli Pizza\n\nHello ${resetResult.customerName}, your temporary 4-digit PIN is: ${resetResult.pin}\n\nPlease login using your registered mobile number and change this PIN after login.\n\nNever share your PIN with anyone.`
    );

    window.open(
      `https://wa.me/${number}?text=${message}`,
      '_blank',
      'noopener,noreferrer'
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/dashboard')}
            className="text-gray-400 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <h1 className="text-white text-2xl font-bold">
              Customer Management
            </h1>
            <p className="text-gray-500 text-sm">
              Customer activity and secure PIN reset
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshAll()}
            className={`ml-auto text-gray-400 cursor-pointer ${
              refreshing ? 'animate-spin' : ''
            }`}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">
              {mergedTotalCustomers}
            </p>
            <p className="text-xs text-gray-400">Total</p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <Wifi className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-400">
              {mergedOnlineCount}
            </p>
            <p className="text-xs text-gray-400">Online Now</p>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <WifiOff className="w-5 h-5 text-gray-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-400">
              {Math.max(mergedTotalCustomers - mergedOnlineCount, 0)}
            </p>
            <p className="text-xs text-gray-400">Offline</p>
          </Card>
        </div>

        <Card className="bg-blue-950/30 border-blue-900/50 p-4 mb-6">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-200 font-medium">
                Safe PIN reset
              </p>
              <p className="text-blue-300/70 text-sm mt-1">
                Verify the customer name, registered mobile number and
                last order before resetting. Send the temporary PIN only
                to the registered WhatsApp number shown on this page.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search by name or phone..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="bg-gray-900 border-gray-700 text-white pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(
            ['all', 'online', 'offline'] as FilterStatus[]
          ).map(status => (
            <Button
              key={status}
              variant={
                filterStatus === status ? 'default' : 'outline'
              }
              size="sm"
              onClick={() => setFilterStatus(status)}
              className={`cursor-pointer capitalize ${
                filterStatus === status
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                  : 'border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {status === 'online' && (
                <Wifi className="w-3 h-3 mr-1" />
              )}
              {status === 'offline' && (
                <WifiOff className="w-3 h-3 mr-1" />
              )}
              {status === 'all' && (
                <Users className="w-3 h-3 mr-1" />
              )}
              {status}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          {visibleCustomers.map((customer, index) => {
            const pinAccount = pinAccountMap.get(
              phoneKey(customer.customer_phone)
            );

            return (
              <Card
                key={`${customer.customer_phone}-${index}`}
                className="bg-gray-900 border-gray-800 p-4"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        customer.is_online
                          ? 'bg-green-400 animate-pulse'
                          : 'bg-gray-600'
                      }`}
                    />

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-white font-semibold">
                          {customer.customer_name || 'Guest'}
                        </h3>

                        <Badge
                          variant="outline"
                          className={
                            customer.is_guest
                              ? 'text-yellow-400 border-yellow-600/40 text-[10px] px-1.5 py-0'
                              : 'text-blue-400 border-blue-600/40 text-[10px] px-1.5 py-0'
                          }
                        >
                          {customer.is_guest
                            ? '👤 Guest'
                            : '✓ Registered'}
                        </Badge>

                        <Badge
                          variant="outline"
                          className={
                            pinAccount
                              ? pinAccount.is_locked
                                ? 'text-red-400 border-red-600/40 text-[10px] px-1.5 py-0'
                                : 'text-green-400 border-green-600/40 text-[10px] px-1.5 py-0'
                              : 'text-gray-400 border-gray-600/40 text-[10px] px-1.5 py-0'
                          }
                        >
                          {pinAccount
                            ? pinAccount.is_locked
                              ? 'PIN Locked'
                              : 'PIN Active'
                            : 'No PIN Account'}
                        </Badge>
                      </div>

                      <p className="text-gray-400 text-sm">
                        {customer.customer_phone || 'No phone'}
                      </p>

                      {pinAccount?.last_login_at && (
                        <p className="text-gray-600 text-xs mt-1">
                          Last PIN login:{' '}
                          {formatTimeAgo(
                            pinAccount.last_login_at
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:justify-end">
                    <Badge
                      variant={
                        customer.is_online
                          ? 'default'
                          : 'secondary'
                      }
                      className={
                        customer.is_online
                          ? 'bg-green-600/20 text-green-400 border-green-600/30'
                          : 'bg-gray-800 text-gray-500 border-gray-700'
                      }
                    >
                      {customer.is_online
                        ? 'Online'
                        : 'Offline'}
                    </Badge>

                    <Button
                      size="sm"
                      onClick={() => openResetDialog(customer)}
                      disabled={!customer.customer_phone}
                      className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      {pinAccount ? 'Reset PIN' : 'Create PIN'}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-800/50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingBag className="w-3 h-3 text-blue-400" />
                      <span className="text-white font-medium text-sm">
                        {customer.total_orders}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Orders
                    </p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-2">
                    <p className="text-white font-medium text-sm">
                      AED{' '}
                      {Number(customer.total_spent || 0).toFixed(
                        0
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Spent
                    </p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-yellow-400" />
                      <span className="text-white font-medium text-sm">
                        {formatTimeAgo(
                          customer.last_active ||
                            customer.last_order_date
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Active
                    </p>
                  </div>
                </div>

                {customer.first_seen && (
                  <p className="text-gray-600 text-xs mt-2">
                    First visit:{' '}
                    {new Date(
                      customer.first_seen
                    ).toLocaleDateString()}
                  </p>
                )}
              </Card>
            );
          })}

          {visibleCustomers.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">
                {filterStatus === 'online'
                  ? 'No customers online right now'
                  : 'No customers found'}
              </p>
              <p className="text-gray-600 text-xs mt-2">
                Visitors will appear here as they open the app
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(resetCustomer)}
        onOpenChange={open => {
          if (!open) closeResetDialog();
        }}
      >
        <DialogContent className="bg-gray-950 border-gray-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-red-400" />
              Customer PIN Reset
            </DialogTitle>
          </DialogHeader>

          {resetCustomer && (
            <div className="space-y-5">
              <Card className="bg-gray-900 border-gray-800 p-4">
                <p className="text-white font-semibold">
                  {resetCustomer.customer_name || 'Customer'}
                </p>
                <p className="text-gray-400 text-sm">
                  Registered number:{' '}
                  {resetCustomer.customer_phone}
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  Orders: {resetCustomer.total_orders} · Spent:
                  AED{' '}
                  {Number(
                    resetCustomer.total_spent || 0
                  ).toFixed(0)}
                </p>
              </Card>

              {!resetResult ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="new-customer-pin">
                      New temporary 4-digit PIN
                    </Label>
                    <Input
                      id="new-customer-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={4}
                      value={newPin}
                      onChange={event =>
                        setNewPin(
                          event.target.value
                            .replace(/\D/g, '')
                            .slice(0, 4)
                        )
                      }
                      placeholder="••••"
                      className="bg-gray-900 border-gray-700 text-white text-center text-2xl tracking-[0.6em]"
                    />
                    <p className="text-gray-500 text-xs">
                      Verify the customer's identity before pressing
                      Reset PIN.
                    </p>
                  </div>

                  <Button
                    onClick={() => void resetCustomerPin()}
                    disabled={
                      resetting || !/^\d{4}$/.test(newPin)
                    }
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    {resetting
                      ? 'Resetting...'
                      : pinAccountMap.has(
                          phoneKey(
                            resetCustomer.customer_phone
                          )
                        )
                        ? 'Reset Customer PIN'
                        : 'Create Customer PIN'}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <Card className="bg-green-950/30 border-green-800 p-4">
                    <div className="flex gap-3">
                      <ShieldCheck className="w-6 h-6 text-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-green-300 font-semibold">
                          {resetResult.accountCreated
                            ? 'PIN account created'
                            : 'PIN reset completed'}
                        </p>
                        <p className="text-green-200/70 text-sm mt-1">
                          Temporary PIN:{' '}
                          <span className="font-bold text-xl tracking-widest text-white">
                            {resetResult.pin}
                          </span>
                        </p>
                      </div>
                    </div>
                  </Card>

                  <Button
                    onClick={openResetWhatsApp}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Send PIN to Registered WhatsApp
                  </Button>

                  <p className="text-yellow-300/80 text-xs text-center">
                    WhatsApp will open with the registered number.
                    Check the number before sending.
                  </p>

                  <Button
                    variant="outline"
                    onClick={closeResetDialog}
                    className="w-full border-gray-700 text-gray-300"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
