import { useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  readExtendedSettings,
  saveExtendedSettings,
} from '@/lib/admin-settings-store';

export default function AdminSecuritySettings() {
  const current = readExtendedSettings();
  const [form, setForm] = useState({
    admin_username: current.admin_username,
    admin_password: current.admin_password,
    kitchen_pin: current.kitchen_pin,
    allowed_country_codes: current.allowed_country_codes,
  });

  function save() {
    if (!form.admin_username.trim()) {
      toast.error('Admin username is required');
      return;
    }

    if (form.admin_password.length < 6) {
      toast.error('Admin password must have at least 6 characters');
      return;
    }

    if (!/^\d{4}$/.test(form.kitchen_pin)) {
      toast.error('Kitchen PIN must be exactly 4 digits');
      return;
    }

    saveExtendedSettings(form);
    toast.success('Access and security settings saved');
  }

  return (
    <AdminSettingsPageLayout
      title="Access & Security"
      subtitle="Admin credentials, Kitchen PIN and allowed phone countries"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-4">
            Admin & Kitchen Access
          </h2>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Admin Username</Label>
              <Input
                value={form.admin_username}
                onChange={event =>
                  setForm({
                    ...form,
                    admin_username: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Admin Password</Label>
              <Input
                type="password"
                value={form.admin_password}
                onChange={event =>
                  setForm({
                    ...form,
                    admin_password: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Kitchen PIN</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={form.kitchen_pin}
                onChange={event =>
                  setForm({
                    ...form,
                    kitchen_pin: event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 4),
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1 w-40"
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-2">
            Allowed Customer Country Codes
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Separate codes with commas
          </p>

          <Input
            value={form.allowed_country_codes}
            onChange={event =>
              setForm({
                ...form,
                allowed_country_codes: event.target.value,
              })
            }
            placeholder="+971,+91,+92,+44,+1"
            className="bg-gray-800 border-gray-700 text-white"
          />

          <div className="flex flex-wrap gap-2 mt-3">
            {form.allowed_country_codes
              .split(',')
              .map(code => code.trim())
              .filter(Boolean)
              .map(code => (
                <span
                  key={code}
                  className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-green-400 text-xs"
                >
                  {code}
                </span>
              ))}
          </div>
        </Card>

        <Card className="bg-yellow-950/20 border-yellow-900/50 p-4">
          <p className="text-yellow-300 text-sm">
            Current admin credentials are stored in this browser's local
            storage, matching the existing app behavior. A backend account
            system is required for the same password to sync automatically
            across different devices.
          </p>
        </Card>

        <Button
          onClick={save}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Access Settings
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
