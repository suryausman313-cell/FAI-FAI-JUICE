import { useEffect, useState } from 'react';
import { Gift, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { getAdminRewardSettings, updateAdminRewardSettings } from '@/lib/rewards';

export default function AdminRewardsSettings() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getAdminRewardSettings()
      .then(data => { if (active) setEnabled(data.enabled); })
      .catch((error: any) => toast.error(error?.message || 'Could not load reward settings'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const result = await updateAdminRewardSettings(enabled);
      setEnabled(result.enabled);
      localStorage.removeItem('fai_fai_selected_reward_id');
      toast.success(result.enabled ? 'Customer Rewards are ON' : 'Customer Rewards are OFF');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save reward settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Customer Rewards"
      subtitle="Turn the entire Surprise Box and Golden Reward system ON or OFF"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-yellow-400" />
                <h2 className="font-semibold text-white">Customer Reward System</h2>
              </div>
              <p className="mt-2 text-sm text-gray-400">
                OFF hides Rewards from customers and blocks earning or using rewards. Existing unused rewards stay saved and can be used again when you turn it ON.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading || saving} />
          </div>

          <div className={`mt-5 rounded-xl border p-4 ${enabled ? 'border-green-700/40 bg-green-900/10' : 'border-red-800/40 bg-red-900/10'}`}>
            <p className={`font-bold ${enabled ? 'text-green-400' : 'text-red-400'}`}>
              {loading ? 'Checking…' : enabled ? 'REWARDS ON' : 'REWARDS OFF'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Normal rewards expire in 7 days. Golden rewards expire in 30 days.
            </p>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-400" />
            <div className="text-sm text-gray-400">
              <p className="font-semibold text-gray-200">Safe OFF behavior</p>
              <p className="mt-1">Turning rewards OFF does not delete customer rewards or affect normal orders, promo codes, login, menu, kitchen, rider or payments.</p>
            </div>
          </div>
        </Card>

        <Button onClick={() => void save()} disabled={loading || saving} className="w-full bg-red-600 py-6 text-white hover:bg-red-700">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save Reward Setting'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
