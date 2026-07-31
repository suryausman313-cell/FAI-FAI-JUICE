import { useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  readExtendedSettings,
  saveExtendedSettings,
} from '@/lib/admin-settings-store';

export default function AdminPromotionSettings() {
  const current = readExtendedSettings();
  const [form, setForm] = useState({
    banner_text: current.banner_text,
    offer_text: current.offer_text,
    promo_code: current.promo_code,
    promo_discount: current.promo_discount,
  });

  function save() {
    saveExtendedSettings(form);
    toast.success('Promo and banner settings saved');
  }

  return (
    <AdminSettingsPageLayout
      title="Promo Code & Banner"
      subtitle="Legacy banner and promo controls kept on their own page"
    >
      <Card className="bg-gray-900 border-gray-800 p-6">
        <div className="space-y-4">
          <div>
            <Label className="text-gray-300">
              Homepage Banner Text
            </Label>
            <Textarea
              value={form.banner_text}
              onChange={event =>
                setForm({ ...form, banner_text: event.target.value })
              }
              rows={3}
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-gray-300">Menu Offer Text</Label>
            <Input
              value={form.offer_text}
              onChange={event =>
                setForm({ ...form, offer_text: event.target.value })
              }
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Promo Code</Label>
              <Input
                value={form.promo_code}
                onChange={event =>
                  setForm({
                    ...form,
                    promo_code: event.target.value.toUpperCase(),
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Discount %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={form.promo_discount}
                onChange={event =>
                  setForm({
                    ...form,
                    promo_discount: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
          </div>
        </div>
      </Card>

      <Button
        onClick={save}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-6 mt-5"
      >
        <Save className="w-4 h-4 mr-2" />
        Save Promo Settings
      </Button>
    </AdminSettingsPageLayout>
  );
}
