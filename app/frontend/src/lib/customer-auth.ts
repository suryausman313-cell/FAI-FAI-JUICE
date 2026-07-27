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
  token: string;
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

function getAuthHeader() {
  const token = localStorage.getItem(TOKEN_KEY);

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

function saveSession(data: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(
    CUSTOMER_KEY,
    JSON.stringify(data.customer)
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === 'string') {
      return detail;
    }
  }

  return fallback;
}

export const customerAuthApi = {
  async signup(name: string, phone: string, pin: string) {
    try {
      const response = await api.post<AuthResponse>(
        `${getAPIBaseURL()}/api/v1/customer-auth/signup`,
        { name, phone, pin }
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
        { phone, pin }
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
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      return null;
    }

    try {
      const response = await api.get<Customer>(
        `${getAPIBaseURL()}/api/v1/customer-auth/me`,
        { headers: getAuthHeader() }
      );

      localStorage.setItem(
        CUSTOMER_KEY,
        JSON.stringify(response.data)
      );

      return response.data;
    } catch {
      this.logout();
      return null;
    }
  },

  async changePin(oldPin: string, newPin: string) {
    try {
      const response = await api.post(
        `${getAPIBaseURL()}/api/v1/customer-auth/change-pin`,
        {
          old_pin: oldPin,
          new_pin: newPin,
        },
        { headers: getAuthHeader() }
      );

      return response.data;
    } catch (error) {
      throw new Error(
        getErrorMessage(error, 'PIN change failed')
      );
    }
  },

  getSavedCustomer(): Customer | null {
    const saved = localStorage.getItem(CUSTOMER_KEY);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved) as Customer;
    } catch {
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
  },
};
