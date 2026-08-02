import { useEffect, useState } from 'react';
import { Megaphone, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  loadRestaurantSettings,
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
} from '@/lib/admin-settings-store';

export default function AdminPromotionSettings() {
  const navigate = useNavigate();
  const current = readExtendedSettings();
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    banner_text: current.banner_text,
    offer_text: current.offer_text,
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;
      setSettingsId(Number(settings.id));
      setForm({
        banner_text: String(settings.banner_text || ''),
        offer_text: String(settings.offer_text || ''),
      });
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
      await updateRestaurantSettings(settingsId, form);
      saveExtendedSettings(form);
      localStorage.removeItem('vita_home_cache_v2');
      localStorage.removeItem('vita_menu_cache');
      toast.success('Customer banner and menu message saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save promotion text');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Promotion Display"
      subtitle="Set customer-facing messages here; create real discount codes in Offers"
    >
      <Card className="bg-gray-900 border-gray-800 p-6">
        <div className="space-y-4">
          <div>
            <Label className="text-gray-300">Homepage Banner Text</Label>
            <Textarea
              value={form.banner_text}
              onChange={event => setForm({ ...form, banner_text: event.target.value })}
              rows={3}
              placeholder="Example: Fresh juice delivered every day"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-gray-300">Menu Offer Text</Label>
            <Input
              value={form.offer_text}
              onChange={event => setForm({ ...form, offer_text: event.target.value })}
              placeholder="Example: Today only — selected items on offer"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-3 mt-5 sm:grid-cols-2">
        <Button
          onClick={() => void save()}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Display Text'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/admin/offers')}
          className="border-gray-700 text-gray-200 py-6"
        >
          <Megaphone className="w-4 h-4 mr-2" />
          Open Discount & Promo Offers
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
