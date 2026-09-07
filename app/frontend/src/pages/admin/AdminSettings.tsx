import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CreditCard,
  Database,
  Home,
  Gift,
  KeyRound,
  MapPinned,
  Megaphone,
  PackageCheck,
  Percent,
  Printer,
  Settings2,
  Shield,
  Store,
  Truck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const SETTINGS = [
  {
    path: '/admin/settings/branches',
    title: 'Branches',
    description:
      'Add Fujairah, Dubai, Dibba and future branches with GPS locations.',
    icon: MapPinned,
    color: 'text-teal-400',
  },
  {
    path: '/admin/settings/brand',
    title: 'Brand & App Settings',
    description:
      'Shop name, logos, app names, phone, address, colors and Fai Fai menu replacement.',
    icon: Store,
    color: 'text-green-400',
  },
  {
    path: '/admin/settings/restaurant',
    title: 'Restaurant Settings',
    description:
      'Opening hours, status, shop information and location.',
    icon: Building2,
    color: 'text-blue-400',
  },
  {
    path: '/admin/settings/homepage',
    title: 'Homepage Settings',
    description:
      'Customer home sections, banner, popular items and visibility.',
    icon: Home,
    color: 'text-cyan-400',
  },
  {
    path: '/admin/settings/checkout',
    title: 'Checkout & Payment',
    description:
      'Checkout flow, cash/card methods and country codes.',
    icon: CreditCard,
    color: 'text-indigo-400',
  },
  {
    path: '/admin/settings/orders',
    title: 'Order Settings',
    description:
      'Order timers, cancellation and modification rules.',
    icon: PackageCheck,
    color: 'text-yellow-400',
  },
  {
    path: '/admin/settings/delivery',
    title: 'Delivery Settings',
    description:
      'Delivery ON/OFF, zones, charges and estimated time.',
    icon: Truck,
    color: 'text-orange-400',
  },
  {
    path: '/admin/settings/fees',
    title: 'Fees & VAT',
    description:
      'Service fee, small-order fee, VAT and thresholds.',
    icon: Percent,
    color: 'text-emerald-400',
  },
  {
    path: '/admin/settings/rewards',
    title: 'Customer Rewards',
    description:
      'Turn Surprise Box and Golden Rewards ON or OFF for customers.',
    icon: Gift,
    color: 'text-yellow-400',
  },
  {
    path: '/admin/settings/promotions',
    title: 'Promotion Settings',
    description:
      'Promo code, banner text and promotion defaults.',
    icon: Megaphone,
    color: 'text-pink-400',
  },
  {
    path: '/admin/settings/receipt',
    title: 'Receipt & Printer',
    description:
      'Printer IP, paper width, receipt logo and automatic print.',
    icon: Printer,
    color: 'text-purple-400',
  },
  {
    path: '/admin/settings/security',
    title: 'Admin & Kitchen Security',
    description:
      'Admin credentials, Kitchen PIN and security controls.',
    icon: KeyRound,
    color: 'text-red-400',
  },
  {
    path: '/admin/settings/data-reset',
    title: 'Data Reset',
    description:
      'Reset selected data carefully without changing app code.',
    icon: Database,
    color: 'text-rose-400',
  },
];

export default function AdminSettings() {
  const navigate = useNavigate();

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');

    try {
      if (!auth || !JSON.parse(auth).loggedIn) {
        navigate('/admin');
      }
    } catch {
      navigate('/admin');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/dashboard')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="w-6 h-6 text-green-400" />
              <h1 className="text-white text-2xl font-bold">
                Settings
              </h1>
            </div>
            <p className="text-gray-400 text-sm">
              Har setting apne separate page par manage karo.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {SETTINGS.map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.path}
                onClick={() => navigate(item.path)}
                className="bg-gray-900 border-gray-800 p-4 cursor-pointer hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${item.color}`} />
                  </div>

                  <div className="flex-1">
                    <h2 className="text-white font-semibold">
                      {item.title}
                    </h2>
                    <p className="text-gray-400 text-xs mt-1">
                      {item.description}
                    </p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
