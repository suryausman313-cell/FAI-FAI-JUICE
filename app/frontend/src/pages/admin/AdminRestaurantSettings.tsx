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
} from '@/lib/admin-settings-store';

export default function AdminRestaurantSettings() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    restaurant_name: '',
    phone: '',
    address: '',
    opening_hours: '',
    auto_schedule_enabled: false,
    auto_open_time: '15:00',
    auto_close_time: '02:00',
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      const local = readExtendedSettings();

      if (settings) {
        setSettingsId(Number(settings.id));
        setForm({
          restaurant_name: settings.restaurant_name || '',
          phone: settings.phone || '',
          address: settings.address || '',
          opening_hours: settings.opening_hours || '',
          auto_schedule_enabled:
            settings.auto_schedule_enabled === true,
          auto_open_time:
            settings.auto_open_time || local.auto_open_time,
          auto_close_time:
            settings.auto_close_time || local.auto_close_time,
        });
      }
    } catch (error) {
      console.error(error);
      toast.error('Could not load restaurant settings');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!settingsId) {
      toast.error('Restaurant settings record was not found');
      return;
    }

    setSaving(true);
    try {
      await updateRestaurantSettings(settingsId, form);
      saveExtendedSettings({
        auto_schedule_enabled: form.auto_schedule_enabled,
        auto_open_time: form.auto_open_time,
        auto_close_time: form.auto_close_time,
      });
      toast.success('Restaurant information saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Restaurant Information"
      subtitle="Basic shop details and automatic opening schedule"
    >
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-5">
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Restaurant Name</Label>
                <Input
                  value={form.restaurant_name}
                  onChange={event =>
                    setForm({ ...form, restaurant_name: event.target.value })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">Phone Number</Label>
                <Input
                  value={form.phone}
                  onChange={event =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">Shop Address</Label>
                <Input
                  value={form.address}
                  onChange={event =>
                    setForm({ ...form, address: event.target.value })
                  }
                  placeholder="Murbah, Fujairah, UAE"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">Opening Hours Text</Label>
                <Input
                  value={form.opening_hours}
                  onChange={event =>
                    setForm({ ...form, opening_hours: event.target.value })
                  }
                  placeholder="Daily 3:00 PM – 2:00 AM"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
            </div>
          </Card>

          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold">
                  Auto Open/Close Schedule
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  The restaurant changes status at these times every day
                </p>
              </div>

              <Switch
                checked={form.auto_schedule_enabled}
                onCheckedChange={checked =>
                  setForm({ ...form, auto_schedule_enabled: checked })
                }
              />
            </div>

            {form.auto_schedule_enabled && (
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <Label className="text-gray-300">Open Time</Label>
                  <Input
                    type="time"
                    value={form.auto_open_time}
                    onChange={event =>
                      setForm({ ...form, auto_open_time: event.target.value })
                    }
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>

                <div>
                  <Label className="text-gray-300">Close Time</Label>
                  <Input
                    type="time"
                    value={form.auto_close_time}
                    onChange={event =>
                      setForm({ ...form, auto_close_time: event.target.value })
                    }
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              </div>
            )}
          </Card>

          <Button
            onClick={() => void save()}
            disabled={saving}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Restaurant Settings'}
          </Button>
        </div>
      )}
    </AdminSettingsPageLayout>
  );
}
