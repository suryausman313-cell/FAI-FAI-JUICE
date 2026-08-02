import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  loadRestaurantSettings,
  numberValue,
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
} from '@/lib/admin-settings-store';

export default function AdminFeesSettings() {
  const local = readExtendedSettings();
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cash_enabled_pickup: local.cash_enabled_pickup,
    card_enabled_pickup: local.card_enabled_pickup,
    cash_enabled_delivery: local.cash_enabled_delivery,
    card_enabled_delivery: local.card_enabled_delivery,
    service_fee_enabled: local.service_fee_enabled,
    service_fee_amount: local.service_fee_amount,
    service_fee_type: local.service_fee_type,
    service_fee_applies_to: local.service_fee_applies_to,
    small_order_fee_enabled: local.small_order_fee_enabled,
    small_order_fee_amount: local.small_order_fee_amount,
    small_order_fee_threshold: local.small_order_fee_threshold,
    tax_percent: local.tax_percent,
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;

      setSettingsId(Number(settings.id));
      setForm(current => ({
        ...current,
        cash_enabled_pickup: settings.cash_enabled_pickup !== false,
        card_enabled_pickup: settings.card_enabled_pickup !== false,
        cash_enabled_delivery: settings.cash_enabled_delivery !== false,
        card_enabled_delivery: settings.card_enabled_delivery !== false,
        service_fee_enabled: settings.service_fee_enabled === true,
        service_fee_amount: String(settings.service_fee_amount || 0),
        service_fee_type: settings.service_fee_type || 'fixed',
        service_fee_applies_to:
          settings.service_fee_applies_to || 'both',
        small_order_fee_enabled:
          settings.small_order_fee_enabled === true,
        small_order_fee_amount: String(
          settings.small_order_fee_amount || 0,
        ),
        small_order_fee_threshold: String(
          settings.small_order_fee_threshold || 20,
        ),
        tax_percent: String(settings.tax_percent ?? current.tax_percent),
      }));
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
        cash_enabled_pickup: form.cash_enabled_pickup,
        card_enabled_pickup: form.card_enabled_pickup,
        cash_enabled_delivery: form.cash_enabled_delivery,
        card_enabled_delivery: form.card_enabled_delivery,
        service_fee_enabled: form.service_fee_enabled,
        service_fee_amount: numberValue(form.service_fee_amount),
        service_fee_type: form.service_fee_type,
        service_fee_applies_to: form.service_fee_applies_to,
        small_order_fee_enabled: form.small_order_fee_enabled,
        small_order_fee_amount: numberValue(
          form.small_order_fee_amount,
        ),
        small_order_fee_threshold: numberValue(
          form.small_order_fee_threshold,
          20,
        ),
        tax_percent: Math.max(0, Math.min(100, numberValue(form.tax_percent))),
      });

      saveExtendedSettings(form);
      toast.success('Fees, payment and tax settings saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save fees');
    } finally {
      setSaving(false);
    }
  }

  const paymentRow = (
    title: string,
    key:
      | 'cash_enabled_pickup'
      | 'card_enabled_pickup'
      | 'cash_enabled_delivery'
      | 'card_enabled_delivery',
  ) => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
      <Label className="text-gray-200">{title}</Label>
      <Switch
        checked={form[key]}
        onCheckedChange={checked =>
          setForm({ ...form, [key]: checked })
        }
      />
    </div>
  );

  return (
    <AdminSettingsPageLayout
      title="Fees, Payment & Tax"
      subtitle="Discount remains limited to menu items only"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-4">
            Payment Methods
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paymentRow('Cash on Pickup', 'cash_enabled_pickup')}
            {paymentRow('Card on Pickup', 'card_enabled_pickup')}
            {paymentRow('Cash on Delivery', 'cash_enabled_delivery')}
            {paymentRow('Card on Delivery', 'card_enabled_delivery')}
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Service Fee</h2>
              <p className="text-gray-500 text-sm mt-1">
                Developer fee; never discounted
              </p>
            </div>
            <Switch
              checked={form.service_fee_enabled}
              onCheckedChange={checked =>
                setForm({ ...form, service_fee_enabled: checked })
              }
            />
          </div>

          {form.service_fee_enabled && (
            <div className="space-y-4 mt-5">
              <div className="grid grid-cols-2 gap-3">
                {(['fixed', 'percentage'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, service_fee_type: type })
                    }
                    className={`p-3 rounded-lg border-2 text-sm ${
                      form.service_fee_type === type
                        ? 'border-red-600 bg-red-600/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}
                  >
                    {type === 'fixed'
                      ? 'Fixed AED'
                      : 'Percentage %'}
                  </button>
                ))}
              </div>

              <div>
                <Label className="text-gray-300">
                  {form.service_fee_type === 'fixed'
                    ? 'Amount (AED)'
                    : 'Percentage (%)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.service_fee_amount}
                  onChange={event =>
                    setForm({
                      ...form,
                      service_fee_amount: event.target.value,
                    })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['pickup', 'delivery', 'both'] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        service_fee_applies_to: value,
                      })
                    }
                    className={`p-3 rounded-lg border-2 text-sm capitalize ${
                      form.service_fee_applies_to === value
                        ? 'border-red-600 bg-red-600/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">
                Small-Order Fee
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Applied only below the food subtotal threshold
              </p>
            </div>
            <Switch
              checked={form.small_order_fee_enabled}
              onCheckedChange={checked =>
                setForm({
                  ...form,
                  small_order_fee_enabled: checked,
                })
              }
            />
          </div>

          {form.small_order_fee_enabled && (
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <Label className="text-gray-300">
                  Fee Amount (AED)
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.small_order_fee_amount}
                  onChange={event =>
                    setForm({
                      ...form,
                      small_order_fee_amount: event.target.value,
                    })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">
                  Minimum Food Order
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.small_order_fee_threshold}
                  onChange={event =>
                    setForm({
                      ...form,
                      small_order_fee_threshold: event.target.value,
                    })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <Label className="text-gray-300">Tax / VAT %</Label>
          <Input
            type="number"
            min="0"
            value={form.tax_percent}
            onChange={event =>
              setForm({ ...form, tax_percent: event.target.value })
            }
            className="bg-gray-800 border-gray-700 text-white mt-1 w-32"
          />
          <p className="text-gray-500 text-xs mt-2">
            This percentage is now shown and calculated in customer checkout.
          </p>
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Fees & Payment'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
