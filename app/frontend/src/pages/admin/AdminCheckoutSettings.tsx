import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  loadRestaurantSettings,
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
} from '@/lib/admin-settings-store';

export default function AdminCheckoutSettings() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [checkoutFlow, setCheckoutFlow] = useState<
    'two_step' | 'direct'
  >(() => readExtendedSettings().checkout_flow);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;
      setSettingsId(Number(settings.id));
      setCheckoutFlow(settings.checkout_flow || checkoutFlow);
    } catch (error) {
      console.error(error);
    }
  }

  async function save() {
    if (!settingsId) {
      toast.error('Restaurant settings record was not found');
      return;
    }

    setSaving(true);
    try {
      await updateRestaurantSettings(settingsId, {
        checkout_flow: checkoutFlow,
      });
      saveExtendedSettings({ checkout_flow: checkoutFlow });
      toast.success('Checkout flow saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save checkout flow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Checkout Flow"
      subtitle="Choose how customers move from cart to placing an order"
    >
      <div className="space-y-4">
        <Card
          onClick={() => setCheckoutFlow('two_step')}
          className={`p-6 cursor-pointer transition-all ${
            checkoutFlow === 'two_step'
              ? 'bg-red-950/25 border-red-600'
              : 'bg-gray-900 border-gray-800 hover:border-gray-600'
          }`}
        >
          <h2 className="text-white font-semibold">
            📋 Two-Step: Cart → Checkout
          </h2>
          <p className="text-gray-400 text-sm mt-2">
            Customer checks cart items first, then opens the checkout form.
          </p>
        </Card>

        <Card
          onClick={() => setCheckoutFlow('direct')}
          className={`p-6 cursor-pointer transition-all ${
            checkoutFlow === 'direct'
              ? 'bg-red-950/25 border-red-600'
              : 'bg-gray-900 border-gray-800 hover:border-gray-600'
          }`}
        >
          <h2 className="text-white font-semibold">
            ⚡ Direct: Cart + Checkout Together
          </h2>
          <p className="text-gray-400 text-sm mt-2">
            Cart items and customer details appear on the same screen.
          </p>
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Checkout Flow'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
