import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

type AuthMode = 'login' | 'signup';

export default function CustomerAuth() {
  const navigate = useNavigate();

  const {
    login,
    signup,
    loading,
    error,
    clearError,
  } = useCustomerAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+971');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState('');

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setLocalError('');
    clearError();
    setPin('');
    setConfirmPin('');
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setLocalError('');
    clearError();

    const cleanName = name.trim();
    const cleanPhone = phone.replace(/\s|-/g, '');
    const cleanPin = pin.trim();

    if (
      mode === 'signup' &&
      cleanName.length < 2
    ) {
      setLocalError('Please enter your name');
      return;
    }

    if (!cleanPhone.startsWith('+')) {
      setLocalError(
        'Enter phone number with country code, for example +971501234567'
      );
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setLocalError('PIN must contain exactly 4 digits');
      return;
    }

    if (
      mode === 'signup' &&
      cleanPin !== confirmPin
    ) {
      setLocalError('PIN and Confirm PIN do not match');
      return;
    }

    try {
      if (mode === 'signup') {
        await signup(
          cleanName,
          cleanPhone,
          cleanPin
        );
      } else {
        await login(cleanPhone, cleanPin);
      }

      navigate('/');
    } catch {
      // Error is displayed from CustomerAuthContext.
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-5 py-10">
      <div className="max-w-md mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-8 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-black">
            Vita{' '}
            <span className="text-red-600">
              Napoli
            </span>
          </h1>

          <p className="text-gray-400 mt-2">
            Customer Account
          </p>
        </div>

        <div className="flex bg-gray-900 rounded-xl p-1 mb-7">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-3 rounded-lg font-bold ${
              mode === 'login'
                ? 'bg-red-600 text-white'
                : 'text-gray-400'
            }`}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 py-3 rounded-lg font-bold ${
              mode === 'signup'
                ? 'bg-red-600 text-white'
                : 'text-gray-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-950 border border-gray-800 rounded-2xl p-6 space-y-5"
        >
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Your name"
                autoComplete="name"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-red-600"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2">
              Mobile Number
            </label>

            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
              placeholder="+971501234567"
              autoComplete="tel"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-red-600"
            />

            <p className="text-xs text-gray-500 mt-2">
              Include country code, for example
              +971501234567
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              4-Digit PIN
            </label>

            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) =>
                setPin(
                  event.target.value.replace(
                    /\D/g,
                    ''
                  )
                )
              }
              placeholder="••••"
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-red-600"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-semibold mb-2">
                Confirm PIN
              </label>

              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(event) =>
                  setConfirmPin(
                    event.target.value.replace(
                      /\D/g,
                      ''
                    )
                  )
                }
                placeholder="••••"
                autoComplete="new-password"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-red-600"
              />
            </div>
          )}

          {(localError || error) && (
            <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl py-4 font-bold text-lg"
          >
            {loading
              ? 'Please wait...'
              : mode === 'signup'
                ? 'Create Account'
                : 'Login'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Never share your PIN with anyone.
        </p>
      </div>
    </div>
  );
}
