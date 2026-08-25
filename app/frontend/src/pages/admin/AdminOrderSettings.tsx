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
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
  integerValue,
} from '@/lib/admin-settings-store';

export default function AdminOrderSettings() {
  const local = readExtendedSettings();
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [form, setForm] = useState({
    order_accept_timeout_minutes: local.order_accept_timeout_minutes,
    order_expire_timeout_minutes: local.order_expire_timeout_minutes,
    allow_cancel_preparing: false,
    allow_cancel_ready: false,
    allow_modify_preparing: local.allow_modify_preparing,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;
      setSettingsId(Number(settings.id));
      setForm(current => ({
        order_accept_timeout_minutes: String(
          settings.order_accept_timeout_minutes ||
            current.order_accept_timeout_minutes,
        ),
        order_expire_timeout_minutes: String(
          settings.order_expire_timeout_minutes ||
            current.order_expire_timeout_minutes,
        ),
        allow_cancel_preparing: false,
        allow_cancel_ready: false,
        allow_modify_preparing:
          settings.allow_modify_preparing === true,
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
        ...form,
        allow_cancel_preparing: false,
        allow_cancel_ready: false,
        order_accept_timeout_minutes: integerValue(
          form.order_accept_timeout_minutes,
          5,
        ),
        order_expire_timeout_minutes: integerValue(
          form.order_expire_timeout_minutes,
          15,
        ),
      });
      saveExtendedSettings(form);
      toast.success('Order controls saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save order controls');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Order Timer & Cancellation"
      subtitle="Control expiry, cancellation and order modification"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">
                Accept Timeout (minutes)
              </Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={form.order_accept_timeout_minutes}
                onChange={event =>
                  setForm({
                    ...form,
                    order_accept_timeout_minutes: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
              <p className="text-gray-500 text-xs mt-1">
                Auto-expire when not accepted
              </p>
            </div>

            <div>
              <Label className="text-gray-300">
                Total Lifetime (minutes)
              </Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={form.order_expire_timeout_minutes}
                onChange={event =>
                  setForm({
                    ...form,
                    order_expire_timeout_minutes: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
              <p className="text-gray-500 text-xs mt-1">
                Maximum total order lifetime
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-green-600/10 border border-green-600/30">
              <Label className="text-green-300">Customer cancellation is locked after Accept</Label>
              <p className="text-green-300/70 text-xs mt-1">
                Customer can cancel only while the order is New/payment pending. Accepted, Preparing and Ready orders can only be cancelled by staff/Admin.
              </p>
            </div>

            {[
              {
                key: 'allow_modify_preparing',
                title: 'Allow Modify During Preparing',
                description:
                  'Customer may modify items while preparing',
              },
            ].map(item => (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700"
              >
                <div>
                  <Label className="text-gray-200">{item.title}</Label>
                  <p className="text-gray-500 text-xs mt-1">
                    {item.description}
                  </p>
                </div>

                <Switch
                  checked={Boolean(
                    form[item.key as keyof typeof form],
                  )}
                  onCheckedChange={checked =>
                    setForm({
                      ...form,
                      [item.key]: checked,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Order Controls'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
