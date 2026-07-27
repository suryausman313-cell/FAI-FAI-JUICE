import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/lib/i18n';
import { LanguagePickerModal } from '@/components/LanguagePicker';
import { CustomerHeartbeatProvider } from '@/components/CustomerHeartbeatProvider';
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext';

// Lazy load all pages for code splitting
const Index = lazy(() => import('./pages/Index'));
const Menu = lazy(() => import('./pages/Menu'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const Contact = lazy(() => import('./pages/Contact'));
const Deals = lazy(() => import('./pages/Deals'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Reviews = lazy(() => import('./pages/Reviews'));
const CustomerAuth = lazy(() => import('./pages/CustomerAuth'));
const RiderPanel = lazy(() => import('./pages/RiderPanel'));
const DeliveryTracking = lazy(() => import('./pages/DeliveryTracking'));
const BlogRoutes = lazy(() => import('./blog-routes'));

// Admin pages - lazy loaded
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminMenu = lazy(() => import('./pages/admin/AdminMenu'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminSales = lazy(() => import('./pages/admin/AdminSales'));
const AdminOffers = lazy(() => import('./pages/admin/AdminOffers'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const KitchenOrders = lazy(() => import('./pages/admin/KitchenOrders'));
const AdminLanguages = lazy(() => import('./pages/admin/AdminLanguages'));
const AdminDeals = lazy(() => import('./pages/admin/AdminDeals'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminActivityLogs = lazy(() => import('./pages/admin/AdminActivityLogs'));
const AdminAccounts = lazy(() => import('./pages/admin/AdminAccounts'));
const AdminRiders = lazy(() => import('./pages/admin/AdminRiders'));

// Old Auth pages
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const AuthError = lazy(() => import('./pages/AuthError'));

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
          <span className="text-white">Vita</span>{' '}
          <span className="text-red-600">Napoli</span>
        </div>

        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
      </div>
    </div>
  );
}

const AppRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Customer Routes */}
      <Route path="/" element={<Index />} />
      <Route path="/menu" element={<Menu />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/order-confirmation" element={<OrderConfirmation />} />
      <Route path="/my-orders" element={<MyOrders />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/deals" element={<Deals />} />
      <Route path="/feedback" element={<Feedback />} />
      <Route path="/reviews" element={<Reviews />} />

      {/* Customer Login and Sign Up */}
      <Route path="/account" element={<CustomerAuth />} />

      {/* Blog Routes */}
      <Route path="/blog/*" element={<BlogRoutes />} />

      {/* Rider Routes */}
      <Route path="/rider" element={<RiderPanel />} />
      <Route path="/track/:orderId" element={<DeliveryTracking />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/orders" element={<AdminOrders />} />
      <Route path="/admin/menu" element={<AdminMenu />} />
      <Route path="/admin/customers" element={<AdminCustomers />} />
      <Route path="/admin/settings" element={<AdminSettings />} />
      <Route path="/admin/sales" element={<AdminSales />} />
      <Route path="/admin/offers" element={<AdminOffers />} />
      <Route path="/admin/feedback" element={<AdminFeedback />} />
      <Route path="/admin/languages" element={<AdminLanguages />} />
      <Route path="/admin/deals" element={<AdminDeals />} />
      <Route path="/admin/notifications" element={<AdminNotifications />} />
      <Route path="/admin/activity-logs" element={<AdminActivityLogs />} />
      <Route path="/admin/accounts" element={<AdminAccounts />} />
      <Route path="/admin/riders" element={<AdminRiders />} />
      <Route path="/kitchen" element={<KitchenOrders />} />

      {/* Old Auth Routes */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/error" element={<AuthError />} />
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
