import {
  lazy,
  ReactElement,
  Suspense,
} from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import { I18nProvider } from '@/lib/i18n';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import { CustomerHeartbeatProvider } from '@/components/CustomerHeartbeatProvider';
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

// Customer pages
const Index = lazy(() => import('./pages/Index'));
const Menu = lazy(() => import('./pages/Menu'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));

const OrderConfirmation = lazy(
  () => import('./pages/OrderConfirmation')
);

const MyOrders = lazy(() => import('./pages/MyOrders'));
const Contact = lazy(() => import('./pages/Contact'));
const Deals = lazy(() => import('./pages/Deals'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Reviews = lazy(() => import('./pages/Reviews'));

const CustomerAuth = lazy(
  () => import('./pages/CustomerAuth')
);

const RiderPanel = lazy(
  () => import('./pages/RiderPanel')
);

const DeliveryTracking = lazy(
  () => import('./pages/DeliveryTracking')
);

const BlogRoutes = lazy(
  () => import('./blog-routes')
);

// Admin pages
const AdminLogin = lazy(
  () => import('./pages/admin/AdminLogin')
);

const AdminDashboard = lazy(
  () => import('./pages/admin/AdminDashboard')
);

const AdminOrders = lazy(
  () => import('./pages/admin/AdminOrders')
);

const AdminMenu = lazy(
  () => import('./pages/admin/AdminMenu')
);

const AdminCustomers = lazy(
  () => import('./pages/admin/AdminCustomers')
);

const AdminSettings = lazy(
  () => import('./pages/admin/AdminSettings')
);

const AdminRestaurantSettings = lazy(
  () => import('./pages/admin/AdminRestaurantSettings')
);

const AdminHomepageSettings = lazy(
  () => import('./pages/admin/AdminHomepageSettings')
);

const AdminCheckoutSettings = lazy(
  () => import('./pages/admin/AdminCheckoutSettings')
);

const AdminOrderSettings = lazy(
  () => import('./pages/admin/AdminOrderSettings')
);

const AdminDeliverySettings = lazy(
  () => import('./pages/admin/AdminDeliverySettings')
);

const AdminFeesSettings = lazy(
  () => import('./pages/admin/AdminFeesSettings')
);

const AdminPromotionSettings = lazy(
  () => import('./pages/admin/AdminPromotionSettings')
);

const AdminSecuritySettings = lazy(
  () => import('./pages/admin/AdminSecuritySettings')
);

const AdminDataReset = lazy(
  () => import('./pages/admin/AdminDataReset')
);

const AdminFinance = lazy(
  () => import('./pages/admin/AdminFinance')
);

const AdminSales = lazy(
  () => import('./pages/admin/AdminSales')
);

const AdminOffers = lazy(
  () => import('./pages/admin/AdminOffers')
);

const AdminFeedback = lazy(
  () => import('./pages/admin/AdminFeedback')
);

// Kitchen page with Live Orders, Today, Yesterday and Menu
const KitchenShell = lazy(
  () => import('./pages/admin/KitchenShell')
);

const AdminLanguages = lazy(
  () => import('./pages/admin/AdminLanguages')
);

const AdminDeals = lazy(
  () => import('./pages/admin/AdminDeals')
);

const AdminNotifications = lazy(
  () => import('./pages/admin/AdminNotifications')
);

const AdminActivityLogs = lazy(
  () => import('./pages/admin/AdminActivityLogs')
);

const AdminAccounts = lazy(
  () => import('./pages/admin/AdminAccounts')
);

const AdminRiders = lazy(
  () => import('./pages/admin/AdminRiders')
);

// Old auth pages
const AuthCallback = lazy(
  () => import('./pages/AuthCallback')
);

const AuthError = lazy(
  () => import('./pages/AuthError')
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      gcTime: 300000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-black mb-1">
          <span className="text-white">
            Fai Fai
          </span>{' '}
          <span className="text-red-600">
            Juice
          </span>
        </div>

        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
      </div>
    </div>
  );
}

interface ProtectedCustomerRouteProps {
  children: ReactElement;
}

function ProtectedCustomerRoute({
  children,
}: ProtectedCustomerRouteProps) {
  const {
    isLoggedIn,
    loading,
  } = useCustomerAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!isLoggedIn) {
    return (
      <Navigate
        to="/account"
        replace
      />
    );
  }

  return children;
}

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route
        path="/account"
        element={<CustomerAuth />}
      />

      <Route
        path="/"
        element={
          <ProtectedCustomerRoute>
            <Index />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/menu"
        element={
          <ProtectedCustomerRoute>
            <Menu />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/cart"
        element={
          <ProtectedCustomerRoute>
            <Cart />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/checkout"
        element={
          <ProtectedCustomerRoute>
            <Checkout />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/order-confirmation"
        element={
          <ProtectedCustomerRoute>
            <OrderConfirmation />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/my-orders"
        element={
          <ProtectedCustomerRoute>
            <MyOrders />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/contact"
        element={
          <ProtectedCustomerRoute>
            <Contact />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/deals"
        element={
          <ProtectedCustomerRoute>
            <Deals />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/feedback"
        element={
          <ProtectedCustomerRoute>
            <Feedback />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/reviews"
        element={
          <ProtectedCustomerRoute>
            <Reviews />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/blog/*"
        element={
          <ProtectedCustomerRoute>
            <BlogRoutes />
          </ProtectedCustomerRoute>
        }
      />

      <Route
        path="/rider"
        element={<RiderPanel />}
      />

      <Route
        path="/track/:orderId"
        element={<DeliveryTracking />}
      />

      <Route
        path="/admin"
        element={<AdminLogin />}
      />

      <Route
        path="/admin/dashboard"
        element={<AdminDashboard />}
      />

      <Route
        path="/admin/orders"
        element={<AdminOrders />}
      />

      <Route
        path="/admin/menu"
        element={<AdminMenu />}
      />

      <Route
        path="/admin/customers"
        element={<AdminCustomers />}
      />

      <Route
        path="/admin/settings"
        element={<AdminSettings />}
      />

      <Route
        path="/admin/settings/restaurant"
        element={<AdminRestaurantSettings />}
      />

      <Route
        path="/admin/settings/homepage"
        element={<AdminHomepageSettings />}
      />

      <Route
        path="/admin/settings/checkout"
        element={<AdminCheckoutSettings />}
      />

      <Route
        path="/admin/settings/orders"
        element={<AdminOrderSettings />}
      />

      <Route
        path="/admin/settings/delivery"
        element={<AdminDeliverySettings />}
      />

      <Route
        path="/admin/settings/fees"
        element={<AdminFeesSettings />}
      />

      <Route
        path="/admin/settings/promotions"
        element={<AdminPromotionSettings />}
      />

      <Route
        path="/admin/settings/security"
        element={<AdminSecuritySettings />}
      />

      <Route
        path="/admin/settings/data-reset"
        element={<AdminDataReset />}
      />

      <Route
        path="/admin/finance"
        element={<AdminFinance />}
      />

      <Route
        path="/admin/sales"
        element={<AdminSales />}
      />

      <Route
        path="/admin/offers"
        element={<AdminOffers />}
      />

      <Route
        path="/admin/feedback"
        element={<AdminFeedback />}
      />

      <Route
        path="/admin/languages"
        element={<AdminLanguages />}
      />

      <Route
        path="/admin/deals"
        element={<AdminDeals />}
      />

      <Route
        path="/admin/notifications"
        element={<AdminNotifications />}
      />

      <Route
        path="/admin/activity-logs"
        element={<AdminActivityLogs />}
      />

      <Route
        path="/admin/accounts"
        element={<AdminAccounts />}
      />

      <Route
        path="/admin/riders"
        element={<AdminRiders />}
      />

      <Route
        path="/kitchen"
        element={<KitchenShell />}
      />

      <Route
        path="/auth/callback"
        element={<AuthCallback />}
      />

      <Route
        path="/auth/error"
        element={<AuthError />}
      />
    </Routes>
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <TooltipProvider>
        <Toaster />
        <LanguagePickerModal />

        <BrowserRouter>
          <CustomerAuthProvider>
            <CustomerHeartbeatProvider>
              <AppRoutes />
            </CustomerHeartbeatProvider>
          </CustomerAuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };
