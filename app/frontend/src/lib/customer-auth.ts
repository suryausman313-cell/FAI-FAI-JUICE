import axios from 'axios';
import { getAPIBaseURL } from './config';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  last_login?: string | null;
}

interface AuthResponse {
  token?: string;
  access_token?: string;
  token_type: string;
  customer: Customer;
}

const TOKEN_KEY = 'vita_customer_token';
const CUSTOMER_KEY = 'vita_customer';

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

function getAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem(TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

function saveSession(data: AuthResponse) {
  const token = String(data.access_token || data.token || '').trim();
  const customer = JSON.stringify(data.customer);

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  localStorage.setItem(CUSTOMER_KEY, customer);
  sessionStorage.setItem(CUSTOMER_KEY, customer);
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(CUSTOMER_KEY);

  // Purana permanent login bhi remove kar do
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
}

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === 'string') {
      return detail;
    }
  }

  return fallback;
}

export const customerAuthApi = {
  async signup(
    name: string,
    phone: string,
    pin: string
  ) {
    try {
      const response = await api.post<AuthResponse>(
        `${getAPIBaseURL()}/api/v1/customer-auth/signup`,
        {
          name,
          phone,
          pin,
        }
      );

      saveSession(response.data);

      return response.data.customer;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, 'Sign up failed')
      );
    }
  },

  async login(phone: string, pin: string) {
    try {
      const response = await api.post<AuthResponse>(
        `${getAPIBaseURL()}/api/v1/customer-auth/login`,
        {
          phone,
          pin,
        }
      );

      saveSession(response.data);

      return response.data.customer;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, 'Login failed')
      );
    }
  },

  async getCurrentCustomer() {
    const token =
      localStorage.getItem(TOKEN_KEY) ||
      sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      clearSession();
      return null;
    }

    try {
      const response = await api.get<AuthResponse>(
        `${getAPIBaseURL()}/api/v1/customer-auth/me`,
        {
          headers: getAuthHeaders(),
        }
      );

      saveSession(response.data);
      return response.data.customer;
    } catch {
      clearSession();
      return null;
    }
  },

  async changePin(
    oldPin: string,
    newPin: string
  ) {
    try {
      const response = await api.post(
        `${getAPIBaseURL()}/api/v1/customer-auth/change-pin`,
        {
          old_pin: oldPin,
          new_pin: newPin,
        },
        {
          headers: getAuthHeaders(),
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, 'PIN change failed')
      );
    }
  },

  getSavedCustomer(): Customer | null {
    const saved =
      localStorage.getItem(CUSTOMER_KEY) ||
      sessionStorage.getItem(CUSTOMER_KEY);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved) as Customer;
    } catch {
      clearSession();
      return null;
    }
  },

  getToken() {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      sessionStorage.getItem(TOKEN_KEY)
    );
  },

  logout() {
    clearSession();
  },
};
