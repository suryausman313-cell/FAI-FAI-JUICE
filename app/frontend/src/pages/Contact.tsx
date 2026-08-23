import { useEffect, useState } from 'react';
import { Phone as PhoneIcon, MapPin, Clock } from 'lucide-react';
import CustomerLayout from '@/components/CustomerLayout';
import { client, RestaurantSettings } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function Contact() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
        if (res?.data?.items?.length > 0) {
          setSettings(res.data.items[0]);
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
    loadSettings();
  }, []);

  const phone = settings?.phone || '+971 56 969 7233';
  const address = settings?.address || 'Murbah, Fujairah, UAE';
  const hours = settings?.opening_hours || 'Daily 3:00 PM – 2:00 AM';

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-8 max-w-2xl mx-auto">
        <h1 className="text-white text-3xl font-bold mb-8 text-center">{t('contact.title')}</h1>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center">
                <PhoneIcon className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="text-white font-semibold">{t('contact.phone')}</h3>
                <a href={`tel:${phone}`} className="text-red-400 hover:text-red-300 text-lg">
                  {phone}
                </a>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-white font-semibold">{t('contact.address')}</h3>
                <p className="text-gray-400 text-lg">{address}</p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-yellow-600/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <h3 className="text-white font-semibold">{t('contact.hours')}</h3>
                <p className="text-gray-400 text-lg">{hours}</p>
              </div>
            </div>
          </div>

          {/* Location Map Link */}
          <div className="p-6 rounded-2xl bg-red-600/5 border border-red-600/20 text-center">
            <h3 className="text-white font-semibold mb-2">{t('contact.find_us')}</h3>
            <p className="text-gray-400 mb-3">
              {t('contact.pickup_delivery')}
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=25.2747,56.3450"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <MapPin className="w-4 h-4" /> {t('contact.open_maps')}
            </a>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}