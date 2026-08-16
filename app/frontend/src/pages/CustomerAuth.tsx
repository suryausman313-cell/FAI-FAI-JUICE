import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Home,
  KeyRound,
  LogOut,
  MessageCircle,
  Phone,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAPIBaseURL } from '@/lib/config';
import { enableCustomerPush, requestCustomerPushPermissionOnLogin } from '@/lib/customer-push';

type ScreenMode = 'login' | 'signup' | 'forgotPin' | 'changePin';

interface CustomerData {
  id?: number | string;
  name?: string;
  customer_name?: string;
  phone?: string;
  customer_phone?: string;
  [key: string]: unknown;
}

interface AuthResponse {
  access_token?: string;
  token?: string;
  customer?: CustomerData;
  user?: CustomerData;
  message?: string;
  exists?: boolean;
  secure_pin_active?: boolean;
  can_signup?: boolean;
  [key: string]: unknown;
}

const DEVICE_ACCOUNT_KEY = 'vita_customer_registered_on_device';
const DEVICE_PHONE_KEY = 'vita_customer_registered_phone';
const TOKEN_KEY = 'vita_customer_token';
const CUSTOMER_KEY = 'vita_customer';

const RESTAURANT_PHONE_DISPLAY = '+971 52 109 1092';
const RESTAURANT_PHONE_TEL = '+971521091092';
const RESTAURANT_WHATSAPP = '971521091092';

function normalizePhone(value: string): string {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('971')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 9) return `+971${digits.slice(1)}`;

  return raw;
}

function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
}

function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  const value = error as any;
  return (
    value?.response?.data?.detail ||
    value?.response?.data?.message ||
    value?.data?.detail ||
    value?.message ||
    fallback
  );
}

function getRememberedPhone(): string {
  const direct =
    localStorage.getItem(DEVICE_PHONE_KEY) ||
    localStorage.getItem('vita_customer_phone');

  if (direct) return direct;

  try {
    const storedCustomer = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}');
    return storedCustomer.phone || storedCustomer.customer_phone || '+971';
  } catch {
    return '+971';
  }
}

function hasKnownAccountOnDevice(): boolean {
  return Boolean(
    localStorage.getItem(DEVICE_ACCOUNT_KEY) === '1' ||
      localStorage.getItem(TOKEN_KEY) ||
      localStorage.getItem(CUSTOMER_KEY),
  );
}

function getStoredCustomer(): CustomerData | null {
  const raw = localStorage.getItem(CUSTOMER_KEY) || sessionStorage.getItem(CUSTOMER_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as CustomerData;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function clearCustomerSession(): void {
  const keys = [TOKEN_KEY, CUSTOMER_KEY, 'customer_token', 'customer_auth_token'];
  keys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  window.dispatchEvent(new Event('customer-auth-changed'));
}

function rememberAccount(phone: string): void {
  localStorage.setItem(DEVICE_ACCOUNT_KEY, '1');
  localStorage.setItem(DEVICE_PHONE_KEY, phone);
  localStorage.setItem('vita_customer_phone', phone);
}

function saveCustomerSession(
  data: AuthResponse,
  fallbackPhone: string,
  fallbackName = '',
): CustomerData {
  const token = String(data.access_token || data.token || '').trim();
  const customer = data.customer || data.user || {
    name: fallbackName,
    phone: fallbackPhone,
    customer_phone: fallbackPhone,
  };

  if (token) {
    [TOKEN_KEY, 'customer_token', 'customer_auth_token'].forEach((key) => {
      localStorage.setItem(key, token);
      sessionStorage.setItem(key, token);
    });
  }

  const customerJson = JSON.stringify(customer);
  localStorage.setItem(CUSTOMER_KEY, customerJson);
  sessionStorage.setItem(CUSTOMER_KEY, customerJson);

  rememberAccount(fallbackPhone);

  const customerName = String(
    customer.name || customer.customer_name || fallbackName || '',
  ).trim();
  if (customerName) {
    localStorage.setItem('vita_customer_name', customerName);
  }

  window.dispatchEvent(new Event('customer-auth-changed'));
  return customer;
}

async function postCustomerAuth<T>(
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const response = await axios.post<T>(`${getAPIBaseURL()}${path}`, data, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return response.data;
}

function PinInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <Input
      id={id}
      type="password"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChange={(event) =>
        onChange(event.target.value.replace(/\D/g, '').slice(0, 4))
      }
      placeholder="••••"
      className="mt-2 h-14 border-slate-700 bg-slate-900 text-center text-xl tracking-[0.7em] text-white"
      autoComplete={autoComplete}
    />
  );
}

export default function CustomerAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const manageMode = searchParams.get('manage') === '1';
  const rememberedPhone = useMemo(getRememberedPhone, []);

  const [registeredOnThisDevice, setRegisteredOnThisDevice] = useState(
    hasKnownAccountOnDevice,
  );
  const [mode, setMode] = useState<ScreenMode>(() =>
    hasKnownAccountOnDevice() ? 'login' : 'signup',
  );
  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(
    Boolean(localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)),
  );
  const [activeCustomer, setActiveCustomer] = useState<CustomerData | null>(null);

  const [loginPhone, setLoginPhone] = useState(rememberedPhone);
  const [loginPin, setLoginPin] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState(
    rememberedPhone === '+971' ? '+971' : rememberedPhone,
  );
  const [signupPin, setSignupPin] = useState('');
  const [signupConfirmPin, setSignupConfirmPin] = useState('');

  const [changePhone, setChangePhone] = useState(rememberedPhone);
  const [currentPin, setCurrentPin] = useState('');
  const [changeNewPin, setChangeNewPin] = useState('');
  const [changeConfirmPin, setChangeConfirmPin] = useState('');

  useEffect(() => {
    const token =
      localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';

    if (!token) {
      setActiveCustomer(null);
      setSessionChecking(false);
      return;
    }

    let cancelled = false;

    axios
      .get<AuthResponse>(`${getAPIBaseURL()}/api/v1/customer-auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      })
      .then((response) => {
        if (cancelled) return;
        const result = response.data;
        const customer = saveCustomerSession(result, rememberedPhone);
        setActiveCustomer(customer || getStoredCustomer());
        setRegisteredOnThisDevice(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearCustomerSession();
        setActiveCustomer(null);
      })
      .finally(() => {
        if (!cancelled) setSessionChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rememberedPhone]);

  useEffect(() => {
    if (isValidPhone(rememberedPhone)) {
      void checkAccountStatus(rememberedPhone);
    }
    // Run only once for the remembered number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Customer already logged in ho to /account screen par na roko.
  // Installed app agar purane /account start URL se khule tab bhi seedha Home khulega.
  useEffect(() => {
    if (
      !manageMode &&
      !sessionChecking &&
      activeCustomer &&
      mode !== 'changePin'
    ) {
      const timer = window.setTimeout(() => {
        window.location.replace('/');
      }, 50);

      return () => window.clearTimeout(timer);
    }
  }, [manageMode, sessionChecking, activeCustomer, mode]);

  async function checkAccountStatus(phoneValue: string): Promise<void> {
    if (!isValidPhone(phoneValue)) return;

    try {
      const phone = normalizePhone(phoneValue);
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/account-status',
        { phone },
      );

      if (result.secure_pin_active || result.exists) {
        rememberAccount(phone);
        setRegisteredOnThisDevice(true);
        setLoginPhone(phone);
        setChangePhone(phone);
        if (mode === 'signup') setMode('login');
      }
    } catch {
      // This check only controls the Login/Sign Up tabs.
    }
  }

  function validatePhoneOrShow(value: string): string | null {
    const phone = normalizePhone(value);
    if (!isValidPhone(phone)) {
      toast.error('Enter mobile number with country code, for example +971501234567.');
      return null;
    }
    return phone;
  }

  async function finishCustomerPushAfterAuth(
    permissionPromise: Promise<NotificationPermission | 'unsupported'>,
  ): Promise<void> {
    try {
      const permission = await permissionPromise;
      if (permission === 'granted') {
        await enableCustomerPush();
      }
    } catch {
      // Push setup must never block login/signup.
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const phone = validatePhoneOrShow(loginPhone);
    if (!phone) return;

    if (!isValidPin(loginPin)) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }

    const notificationPermission = requestCustomerPushPermissionOnLogin();

    setLoading(true);
    try {
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/login',
        { phone, customer_phone: phone, pin: loginPin },
      );
      const customer = saveCustomerSession(result, phone);
      setRegisteredOnThisDevice(true);
      setActiveCustomer(customer);
      setLoginPin('');
      await finishCustomerPushAfterAuth(notificationPermission);
      toast.success('Login successful');
      window.location.replace('/');
    } catch (error) {
      const message = getErrorMessage(error, 'Login failed');
      toast.error(message);

      if (message.toLowerCase().includes('sign up once')) {
        setRegisteredOnThisDevice(false);
        setSignupPhone(phone);
        setMode('signup');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    const name = signupName.trim();
    const phone = validatePhoneOrShow(signupPhone);
    if (!phone) return;

    if (name.length < 2) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!isValidPin(signupPin)) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }
    if (signupPin !== signupConfirmPin) {
      toast.error('PIN and Confirm PIN do not match.');
      return;
    }

    const notificationPermission = requestCustomerPushPermissionOnLogin();

    setLoading(true);
    try {
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/signup',
        {
          name,
          customer_name: name,
          phone,
          customer_phone: phone,
          pin: signupPin,
        },
      );
      const customer = saveCustomerSession(result, phone, name);
      setRegisteredOnThisDevice(true);
      setActiveCustomer(customer);
      setSignupPin('');
      setSignupConfirmPin('');
      await finishCustomerPushAfterAuth(notificationPermission);
      toast.success('Account created successfully');
      window.location.replace('/');
    } catch (error) {
      const message = getErrorMessage(error, 'Could not create account');
      toast.error(message);
      if (message.toLowerCase().includes('already exists')) {
        rememberAccount(phone);
        setRegisteredOnThisDevice(true);
        setLoginPhone(phone);
        setMode('login');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePin(event: FormEvent) {
    event.preventDefault();
    const phone = validatePhoneOrShow(changePhone);
    if (!phone) return;

    if (!isValidPin(currentPin)) {
      toast.error('Current PIN must be exactly 4 digits.');
      return;
    }
    if (!isValidPin(changeNewPin)) {
      toast.error('New PIN must be exactly 4 digits.');
      return;
    }
    if (currentPin === changeNewPin) {
      toast.error('New PIN must be different from current PIN.');
      return;
    }
    if (changeNewPin !== changeConfirmPin) {
      toast.error('New PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      await postCustomerAuth<AuthResponse>('/api/v1/customer-auth/change-pin', {
        phone,
        customer_phone: phone,
        current_pin: currentPin,
        old_pin: currentPin,
        new_pin: changeNewPin,
      });
      setCurrentPin('');
      setChangeNewPin('');
      setChangeConfirmPin('');
      setMode('login');
      toast.success('PIN changed successfully');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not change PIN'));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearCustomerSession();
    setActiveCustomer(null);
    setMode('login');
    setLoginPin('');
    toast.success('Logged out');
  }

  function openWhatsApp() {
    const phone = normalizePhone(loginPhone);
    const message = encodeURIComponent(
      `Hello Fai Fai Juice, I forgot my customer PIN. My registered mobile number is ${
        isValidPhone(phone) ? phone : '________'
      }. Please help me reset it.`,
    );
    window.open(`https://wa.me/${RESTAURANT_WHATSAPP}?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  const cardClass =
    'space-y-5 rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl';
  const normalInputClass =
    'mt-2 h-14 border-slate-700 bg-slate-900 text-white placeholder:text-slate-500';

  // A valid saved session must go straight to the Customer Home.
  // Show only a tiny redirect loader so the old "Account logged in" card never flashes.
  if (
    !manageMode &&
    !sessionChecking &&
    activeCustomer &&
    mode !== 'changePin'
  ) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-3xl font-black">
            <span className="text-white">Fai Fai</span>{' '}
            <span className="text-red-600">Juice</span>
          </div>
          <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mt-4" />
        </div>
      </div>
    );
  }

  const activeName = String(
    activeCustomer?.name || activeCustomer?.customer_name || 'Customer',
  );
  const activePhone = String(
    activeCustomer?.phone || activeCustomer?.customer_phone || rememberedPhone,
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold">
            Fai Fai <span className="text-red-600">Juice</span>
          </h1>
          <p className="mt-2 text-gray-500">Customer Account</p>
        </div>

        {sessionChecking && (
          <div className={cardClass}>
            <p className="text-center text-gray-400">Checking customer session…</p>
          </div>
        )}

        {!sessionChecking && activeCustomer && mode !== 'changePin' && (
          <div className={cardClass}>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600/15">
                <ShieldCheck className="h-9 w-9 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold">Account logged in</h2>
              <p className="mt-2 text-lg text-white">{activeName}</p>
              <p className="text-sm text-gray-400">{activePhone}</p>
            </div>

            <Button
              type="button"
              onClick={() => navigate('/')}
              className="h-12 w-full bg-red-600 hover:bg-red-700"
            >
              <Home className="mr-2 h-4 w-4" />
              Open Customer App
            </Button>

            <Button
              type="button"
              onClick={() => navigate('/my-orders')}
              variant="outline"
              className="h-12 w-full border-slate-700 bg-slate-900 text-white hover:bg-slate-800"
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              My Orders
            </Button>

            <Button
              type="button"
              onClick={() => {
                setChangePhone(activePhone);
                setMode('changePin');
              }}
              variant="outline"
              className="h-12 w-full border-slate-700 bg-slate-900 text-white hover:bg-slate-800"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change PIN
            </Button>

            <Button
              type="button"
              onClick={handleLogout}
              variant="ghost"
              className="h-12 w-full text-red-400 hover:bg-red-600/10 hover:text-red-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        )}

        {!sessionChecking && !activeCustomer && (mode === 'login' || mode === 'signup') && !registeredOnThisDevice && (
          <div className="mb-7 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-lg px-4 py-4 font-semibold ${
                mode === 'login' ? 'bg-red-600 text-white' : 'text-gray-400'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-lg px-4 py-4 font-semibold ${
                mode === 'signup' ? 'bg-red-600 text-white' : 'text-gray-400'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {!sessionChecking && !activeCustomer && mode === 'login' && (
          <form onSubmit={handleLogin} className={cardClass}>
            <div>
              <Label htmlFor="login-phone">Mobile Number</Label>
              <Input
                id="login-phone"
                inputMode="tel"
                value={loginPhone}
                onChange={(event) => setLoginPhone(event.target.value)}
                onBlur={() => void checkAccountStatus(loginPhone)}
                placeholder="+971501234567"
                className={normalInputClass}
                autoComplete="tel"
              />
              <p className="mt-2 text-xs text-gray-600">
                Include country code, for example +971501234567
              </p>
            </div>

            <div>
              <Label htmlFor="login-pin">4-Digit PIN</Label>
              <PinInput
                id="login-pin"
                value={loginPin}
                onChange={setLoginPin}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Logging in…' : 'Login'}
            </Button>

            <button
              type="button"
              onClick={() => setMode('forgotPin')}
              className="w-full text-sm text-red-400 hover:text-red-300"
            >
              Forgot PIN?
            </button>

            <button
              type="button"
              onClick={() => {
                setChangePhone(loginPhone);
                setMode('changePin');
              }}
              className="w-full text-sm text-gray-400 hover:text-white"
            >
              Change PIN
            </button>

            {registeredOnThisDevice && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(DEVICE_ACCOUNT_KEY);
                  localStorage.removeItem(DEVICE_PHONE_KEY);
                  localStorage.removeItem('vita_customer_phone');
                  setRegisteredOnThisDevice(false);
                  setSignupPhone('+971');
                  setMode('signup');
                }}
                className="w-full text-xs text-gray-600 hover:text-gray-400"
              >
                This is a different/new mobile number
              </button>
            )}
          </form>
        )}

        {!sessionChecking && !activeCustomer && mode === 'signup' && !registeredOnThisDevice && (
          <form onSubmit={handleSignup} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Create Customer Account</h2>
              <p className="mt-2 text-sm text-gray-400">
                Enter your mobile number and create a private 4-digit PIN.
              </p>
            </div>

            <div>
              <Label htmlFor="signup-name">Full Name</Label>
              <Input
                id="signup-name"
                value={signupName}
                onChange={(event) => setSignupName(event.target.value)}
                placeholder="Your full name"
                className={normalInputClass}
                autoComplete="name"
              />
            </div>

            <div>
              <Label htmlFor="signup-phone">Mobile Number</Label>
              <Input
                id="signup-phone"
                inputMode="tel"
                value={signupPhone}
                onChange={(event) => setSignupPhone(event.target.value)}
                onBlur={() => void checkAccountStatus(signupPhone)}
                placeholder="+971501234567"
                className={normalInputClass}
                autoComplete="tel"
              />
            </div>

            <div>
              <Label htmlFor="signup-pin">Create 4-Digit PIN</Label>
              <PinInput
                id="signup-pin"
                value={signupPin}
                onChange={setSignupPin}
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label htmlFor="signup-confirm-pin">Confirm PIN</Label>
              <PinInput
                id="signup-confirm-pin"
                value={signupConfirmPin}
                onChange={setSignupConfirmPin}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>
          </form>
        )}

        {!sessionChecking && !activeCustomer && mode === 'forgotPin' && (
          <div className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Forgot PIN</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                OTP has been removed. For security, contact Fai Fai Juice and ask the shop to reset your PIN.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
              Tell the restaurant your registered mobile number. Do not share any old PIN.
            </div>

            <Button
              type="button"
              onClick={openWhatsApp}
              className="h-13 w-full bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              WhatsApp Restaurant
            </Button>

            <a
              href={`tel:${RESTAURANT_PHONE_TEL}`}
              className="flex h-13 w-full items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-medium text-white hover:bg-slate-800"
            >
              <Phone className="mr-2 h-5 w-5" />
              Call {RESTAURANT_PHONE_DISPLAY}
            </a>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-sm text-gray-400 hover:text-white"
            >
              Back to Login
            </button>
          </div>
        )}

        {!sessionChecking && mode === 'changePin' && (
          <form onSubmit={handleChangePin} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Change PIN</h2>
              <p className="mt-2 text-sm text-gray-400">
                Use this option when you remember your current PIN.
              </p>
            </div>

            <div>
              <Label htmlFor="change-phone">Mobile Number</Label>
              <Input
                id="change-phone"
                inputMode="tel"
                value={changePhone}
                onChange={(event) => setChangePhone(event.target.value)}
                placeholder="+971501234567"
                className={normalInputClass}
                autoComplete="tel"
              />
            </div>

            <div>
              <Label htmlFor="current-pin">Current PIN</Label>
              <PinInput
                id="current-pin"
                value={currentPin}
                onChange={setCurrentPin}
                autoComplete="current-password"
              />
            </div>

            <div>
              <Label htmlFor="change-new-pin">New 4-Digit PIN</Label>
              <PinInput
                id="change-new-pin"
                value={changeNewPin}
                onChange={setChangeNewPin}
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label htmlFor="change-confirm-pin">Confirm New PIN</Label>
              <PinInput
                id="change-confirm-pin"
                value={changeConfirmPin}
                onChange={setChangeConfirmPin}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Saving…' : 'Change PIN'}
            </Button>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-sm text-gray-400 hover:text-white"
            >
              Back to Login
            </button>
          </form>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-700">
          <KeyRound className="h-3.5 w-3.5" />
          Never share your PIN with anyone.
        </div>
      </div>
    </div>
  );
}
