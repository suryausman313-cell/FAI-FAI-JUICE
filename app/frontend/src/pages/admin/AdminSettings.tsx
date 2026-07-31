import {
  Bike,
  Calculator,
  ChevronRight,
  Clock3,
  Code2,
  CreditCard,
  Database,
  Globe2,
  Home,
  KeyRound,
  MapPin,
  Percent,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Store,
  Tag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';

const sections = [
  {
    path: '/admin/settings/restaurant',
    title: 'Restaurant Information',
    description: 'Shop name, phone, address, hours and schedule',
    icon: Store,
    color: 'text-blue-400',
  },
  {
    path: '/admin/settings/homepage',
    title: 'Homepage Control',
    description: 'Show or hide homepage sections and popular items',
    icon: Home,
    color: 'text-green-400',
  },
  {
    path: '/admin/settings/checkout',
    title: 'Checkout Flow',
    description: 'Two-step or direct customer checkout',
    icon: ShoppingCart,
    color: 'text-orange-400',
  },
  {
    path: '/admin/settings/orders',
    title: 'Order Timer & Cancellation',
    description: 'Timeouts, cancel and modification controls',
    icon: Clock3,
    color: 'text-yellow-400',
  },
  {
    path: '/admin/settings/delivery',
    title: 'Delivery & Location',
    description: 'Delivery zones, charges, map and shop pin',
    icon: MapPin,
    color: 'text-cyan-400',
  },
  {
    path: '/admin/settings/fees',
    title: 'Fees, Payment & Tax',
    description: 'Service fee, small-order fee, payment and VAT',
    icon: CreditCard,
    color: 'text-purple-400',
  },
  {
    path: '/admin/settings/promotions',
    title: 'Promo Code & Banner',
    description: 'Legacy promo code, banner and menu offer text',
    icon: Tag,
    color: 'text-pink-400',
  },
  {
    path: '/admin/languages',
    title: 'Language Management',
    description: 'English, Arabic and Urdu controls',
    icon: Globe2,
    color: 'text-sky-400',
  },
  {
    path: '/admin/settings/security',
    title: 'Access & Security',
    description: 'Admin credentials, Kitchen PIN and phone codes',
    icon: KeyRound,
    color: 'text-indigo-400',
  },
  {
    path: '/admin/settings/data-reset',
    title: 'Data Reset',
    description: 'Separate protected reset actions',
    icon: Database,
    color: 'text-red-400',
  },
  {
    path: '/admin/riders',
    title: 'Rider Management',
    description: 'Add, edit, enable and disable riders',
    icon: Bike,
    color: 'text-fuchsia-400',
  },
  {
    path: '/admin/finance',
    title: 'Finance & Rider Cash',
    description: 'Fees reports and cash approval',
    icon: ReceiptText,
    color: 'text-emerald-400',
  },
];

export default function AdminSettings() {
  const navigate = useNavigate();

  return (
    <AdminSettingsPageLayout
      title="Settings"
      subtitle="Every section is now on its own page"
      backTo="/admin/dashboard"
      maxWidth="max-w-5xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(({ path, title, description, icon: Icon, color }) => (
          <Card
            key={path}
            onClick={() => navigate(path)}
            className="bg-gray-900 border-gray-800 p-5 cursor-pointer hover:border-gray-600 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                <Icon className={`w-6 h-6 ${color}`} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-white font-semibold">{title}</h2>
                <p className="text-gray-500 text-sm mt-1">{description}</p>
              </div>

              <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
            </div>
          </Card>
        ))}
      </div>
    </AdminSettingsPageLayout>
  );
}
