import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAPIBaseURL } from '@/lib/config';

type ScreenMode =
  | 'login'
  | 'signup'
  | 'signupOtp'
  | 'forgotPhone'
  | 'forgotOtp'
  | 'changePin';

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
  [key: string]: unknown;
}

const DEVICE_ACCOUNT_KEY = 'vita_customer_registered_on_device';
const DEVICE_PHONE_KEY = 'vita_customer_registered_phone';
const TOKEN_KEY = 'vita_customer_token';
const CUSTOMER_KEY = 'vita_customer';

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

function rememberAccount(phone: string): void {
  localStorage.setItem(DEVICE_ACCOUNT_KEY, '1');
  localStorage.setItem(DEVICE_PHONE_KEY, phone);
  localStorage.setItem('vita_customer_phone', phone);
}

function saveCustomerSession(
  data: AuthResponse,
  fallbackPhone: string,
  fallbackName = '',
): void {
  const token = String(data.access_token || data.token || '').trim();
  const customer = data.customer || data.user || {
    name: fallbackName,
    phone: fallbackPhone,
  };

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_KEY, token);
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
  const rememberedPhone = useMemo(getRememberedPhone, []);

  const [registeredOnThisDevice, setRegisteredOnThisDevice] = useState(
    hasKnownAccountOnDevice,
  );
  const [mode, setMode] = useState<ScreenMode>('login');
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const [loginPhone, setLoginPhone] = useState(rememberedPhone);
  const [loginPin, setLoginPin] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState(
    rememberedPhone === '+971' ? '+971' : rememberedPhone,
  );
  const [signupPin, setSignupPin] = useState('');
  const [signupConfirmPin, setSignupConfirmPin] = useState('');
  const [signupOtp, setSignupOtp] = useState('');

  const [forgotPhone, setForgotPhone] = useState(rememberedPhone);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');

  const [changePhone, setChangePhone] = useState(rememberedPhone);
  const [currentPin, setCurrentPin] = useState('');
  const [changeNewPin, setChangeNewPin] = useState('');
  const [changeConfirmPin, setChangeConfirmPin] = useState('');

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (!isValidPhone(rememberedPhone)) return;
    void checkAccountStatus(rememberedPhone);
    // Run only once for the remembered number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAccountStatus(phoneValue: string): Promise<void> {
    if (!isValidPhone(phoneValue)) return;

    try {
      const phone = normalizePhone(phoneValue);
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/account-status',
        { phone },
      );

      if (result.exists) {
        rememberAccount(phone);
        setRegisteredOnThisDevice(true);
        setLoginPhone(phone);
        setForgotPhone(phone);
        setChangePhone(phone);
        if (mode === 'signup') setMode('login');
      }
    } catch {
      // Status check is only for UI convenience. Login/signup still work normally.
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

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const phone = validatePhoneOrShow(loginPhone);
    if (!phone) return;
    if (!isValidPin(loginPin)) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }

    setLoading(true);
    try {
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/login',
        { phone, customer_phone: phone, pin: loginPin },
      );
      saveCustomerSession(result, phone);
      setRegisteredOnThisDevice(true);
      toast.success('Login successful');
      navigate('/');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Invalid mobile number or PIN.'));
    } finally {
      setLoading(false);
    }
  }

  async function sendSignupOtp(event?: FormEvent) {
    event?.preventDefault();
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
      toast.error('PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await postCustomerAuth('/api/v1/customer-auth/send-otp', {
        phone,
        purpose: 'signup',
      });
      setSignupPhone(phone);
      setSignupOtp('');
      setMode('signupOtp');
      setResendSeconds(30);
      toast.success('OTP sent to your mobile');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send OTP.'));
    } finally {
      setLoading(false);
    }
  }

  async function verifySignupOtp(event: FormEvent) {
    event.preventDefault();
    if (signupOtp.replace(/\D/g, '').length < 4) {
      toast.error('Enter the OTP sent to your mobile.');
      return;
    }

    setLoading(true);
    try {
      const result = await postCustomerAuth<AuthResponse>(
        '/api/v1/customer-auth/signup-verify',
        {
          name: signupName.trim(),
          customer_name: signupName.trim(),
          phone: normalizePhone(signupPhone),
          customer_phone: normalizePhone(signupPhone),
          pin: signupPin,
          code: signupOtp,
        },
      );
      saveCustomerSession(result, normalizePhone(signupPhone), signupName.trim());
      setRegisteredOnThisDevice(true);
      toast.success('Mobile verified and account created');
      navigate('/');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Incorrect or expired OTP.'));
    } finally {
      setLoading(false);
    }
  }

  async function sendForgotOtp(event?: FormEvent) {
    event?.preventDefault();
    const phone = validatePhoneOrShow(forgotPhone);
    if (!phone) return;

    setLoading(true);
    try {
      await postCustomerAuth('/api/v1/customer-auth/send-otp', {
        phone,
        purpose: 'forgot_pin',
      });
      setForgotPhone(phone);
      setForgotOtp('');
      setMode('forgotOtp');
      setResendSeconds(30);
      toast.success('OTP sent to your registered mobile');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not send OTP.'));
    } finally {
      setLoading(false);
    }
  }

  async function resetForgotPin(event: FormEvent) {
    event.preventDefault();
    if (forgotOtp.replace(/\D/g, '').length < 4) {
      toast.error('Enter the OTP sent to your mobile.');
      return;
    }
    if (!isValidPin(forgotNewPin)) {
      toast.error('New PIN must be exactly 4 digits.');
      return;
    }
    if (forgotNewPin !== forgotConfirmPin) {
      toast.error('New PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await postCustomerAuth('/api/v1/customer-auth/forgot-pin-reset', {
        phone: normalizePhone(forgotPhone),
        customer_phone: normalizePhone(forgotPhone),
        code: forgotOtp,
        new_pin: forgotNewPin,
      });

      const phone = normalizePhone(forgotPhone);
      rememberAccount(phone);
      setRegisteredOnThisDevice(true);
      setLoginPhone(phone);
      setLoginPin('');
      setForgotOtp('');
      setForgotNewPin('');
      setForgotConfirmPin('');
      setMode('login');
      toast.success('PIN reset successfully. Login with your new PIN.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not reset PIN.'));
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
      toast.error('New PIN confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await postCustomerAuth('/api/v1/customer-auth/change-pin', {
        phone,
        customer_phone: phone,
        current_pin: currentPin,
        old_pin: currentPin,
        new_pin: changeNewPin,
      });
      rememberAccount(phone);
      setRegisteredOnThisDevice(true);
      setLoginPhone(phone);
      setLoginPin('');
      setCurrentPin('');
      setChangeNewPin('');
      setChangeConfirmPin('');
      setMode('login');
      toast.success('PIN changed successfully. Login with your new PIN.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Current PIN is incorrect.'));
    } finally {
      setLoading(false);
    }
  }

  const cardClass =
    'space-y-5 rounded-2xl border border-slate-800 bg-slate-950 p-6';
  const normalInputClass =
    'mt-2 h-14 border-slate-700 bg-slate-900 text-white';

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mb-9 text-center">
          <h1 className="text-4xl font-black tracking-tight">
            <span className="text-white">Vita</span>{' '}
            <span className="text-red-600">Napoli</span>
          </h1>
          <p className="mt-2 text-gray-500">Customer Account</p>
        </div>

        {(mode === 'login' || mode === 'signup') && !registeredOnThisDevice && (
          <div className="mb-7 grid grid-cols-2 rounded-xl bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-lg px-4 py-3 font-semibold transition ${
                mode === 'login'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-lg px-4 py-3 font-semibold transition ${
                mode === 'signup'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {mode === 'login' && (
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
              {loading ? 'Please wait…' : 'Login'}
            </Button>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setForgotPhone(loginPhone);
                  setMode('forgotPhone');
                }}
                className="rounded-lg border border-red-900/60 px-3 py-3 text-sm font-medium text-red-400 hover:bg-red-950/30"
              >
                Forgot PIN?
              </button>
              <button
                type="button"
                onClick={() => {
                  setChangePhone(loginPhone);
                  setMode('changePin');
                }}
                className="rounded-lg border border-slate-700 px-3 py-3 text-sm font-medium text-gray-300 hover:bg-slate-900"
              >
                Change PIN
              </button>
            </div>
          </form>
        )}

        {mode === 'signup' && !registeredOnThisDevice && (
          <form onSubmit={sendSignupOtp} className={cardClass}>
            <div className="flex items-start gap-3 rounded-xl border border-blue-900/50 bg-blue-950/20 p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-400" />
              <p className="text-sm text-blue-200">
                We will send an OTP to verify your mobile before creating the account.
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
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </Button>
          </form>
        )}

        {mode === 'signupOtp' && (
          <form onSubmit={verifySignupOtp} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Verify Mobile Number</h2>
              <p className="mt-2 text-sm text-gray-400">
                Enter the OTP sent to {normalizePhone(signupPhone)}.
              </p>
            </div>

            <div>
              <Label htmlFor="signup-otp">OTP Code</Label>
              <Input
                id="signup-otp"
                inputMode="numeric"
                maxLength={10}
                value={signupOtp}
                onChange={(event) =>
                  setSignupOtp(event.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="Enter OTP"
                className={`${normalInputClass} text-center text-xl tracking-[0.35em]`}
                autoComplete="one-time-code"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Verifying…' : 'Verify & Create Account'}
            </Button>

            <button
              type="button"
              disabled={loading || resendSeconds > 0}
              onClick={() => void sendSignupOtp()}
              className="w-full text-sm text-red-400 disabled:text-gray-600"
            >
              {resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : 'Resend OTP'}
            </button>

            <button
              type="button"
              onClick={() => setMode('signup')}
              className="w-full text-sm text-gray-400 hover:text-white"
            >
              Change mobile number
            </button>
          </form>
        )}

        {mode === 'forgotPhone' && (
          <form onSubmit={sendForgotOtp} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Forgot PIN</h2>
              <p className="mt-2 text-sm text-gray-400">
                No current PIN is needed. We will verify your registered mobile by OTP.
              </p>
            </div>

            <div>
              <Label htmlFor="forgot-phone">Registered Mobile Number</Label>
              <Input
                id="forgot-phone"
                inputMode="tel"
                value={forgotPhone}
                onChange={(event) => setForgotPhone(event.target.value)}
                placeholder="+971501234567"
                className={normalInputClass}
                autoComplete="tel"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Sending OTP…' : 'Send OTP'}
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

        {mode === 'forgotOtp' && (
          <form onSubmit={resetForgotPin} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Create New PIN</h2>
              <p className="mt-2 text-sm text-gray-400">
                Enter the OTP sent to {normalizePhone(forgotPhone)} and choose a new PIN.
              </p>
            </div>

            <div>
              <Label htmlFor="forgot-otp">OTP Code</Label>
              <Input
                id="forgot-otp"
                inputMode="numeric"
                maxLength={10}
                value={forgotOtp}
                onChange={(event) =>
                  setForgotOtp(event.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="Enter OTP"
                className={`${normalInputClass} text-center text-xl tracking-[0.35em]`}
                autoComplete="one-time-code"
              />
            </div>

            <div>
              <Label htmlFor="forgot-new-pin">New 4-Digit PIN</Label>
              <PinInput
                id="forgot-new-pin"
                value={forgotNewPin}
                onChange={setForgotNewPin}
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label htmlFor="forgot-confirm-pin">Confirm New PIN</Label>
              <PinInput
                id="forgot-confirm-pin"
                value={forgotConfirmPin}
                onChange={setForgotConfirmPin}
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-14 w-full bg-red-600 text-lg font-bold hover:bg-red-700"
            >
              {loading ? 'Saving…' : 'Verify OTP & Reset PIN'}
            </Button>

            <button
              type="button"
              disabled={loading || resendSeconds > 0}
              onClick={() => void sendForgotOtp()}
              className="w-full text-sm text-red-400 disabled:text-gray-600"
            >
              {resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : 'Resend OTP'}
            </button>
          </form>
        )}

        {mode === 'changePin' && (
          <form onSubmit={handleChangePin} className={cardClass}>
            <div>
              <h2 className="text-xl font-bold">Change PIN</h2>
              <p className="mt-2 text-sm text-gray-400">
                Use this only when you remember your current PIN.
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
          Never share your PIN or OTP with anyone.
        </div>
      </div>
    </div>
  );
}
