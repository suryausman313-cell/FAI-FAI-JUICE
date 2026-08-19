import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { client } from '@/lib/api';
import type { Branch } from '@/contexts/BranchContext';

type FormState = {
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  kitchen_pin: string;
  is_default: boolean;
};

const EMPTY: FormState = { name: '', address: '', phone: '', latitude: '', longitude: '', kitchen_pin: '', is_default: false };

export default function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await client.entities.branches.query({});
    setBranches(response.data?.items || []);
  }

  useEffect(() => { void load(); }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) return toast.error('Location is not supported on this device');
    navigator.geolocation.getCurrentPosition(
      (position) => setForm((current) => ({ ...current, latitude: String(position.coords.latitude), longitude: String(position.coords.longitude) })),
      () => toast.error('Could not get current location'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!form.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Branch name, latitude and longitude are required');
      return;
    }
    if (!form.is_default && !/^\d{4,8}$/.test(form.kitchen_pin.trim())) {
      toast.error('New branch ke liye separate 4-8 digit Kitchen PIN zaroori hai');
      return;
    }
    setSaving(true);
    try {
      await client.entities.branches.create({ data: { name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), latitude: lat, longitude: lng, is_active: true, is_default: form.is_default, ...(form.kitchen_pin.trim() ? { kitchen_pin: form.kitchen_pin.trim() } : {}) } });
      setForm(EMPTY);
      await load();
      toast.success('Branch added');
    } catch (error: any) {
      toast.error(error?.message || 'Could not add branch');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(branch: Branch) {
    await client.entities.branches.update({ id: String(branch.id), data: { is_default: true, is_active: true } });
    await load();
    toast.success(`${branch.name} is now default`);
  }

  async function toggleActive(branch: Branch) {
    await client.entities.branches.update({ id: String(branch.id), data: { is_active: !branch.is_active } });
    await load();
  }

  async function changeKitchenPin(branch: Branch) {
    const nextPin = window.prompt(`Set 4-8 digit Kitchen PIN for ${branch.name}`);
    if (nextPin == null) return;
    if (!/^\d{4,8}$/.test(nextPin.trim())) {
      toast.error('Kitchen PIN must be 4 to 8 digits');
      return;
    }
    try {
      await client.entities.branches.update({ id: String(branch.id), data: { kitchen_pin: nextPin.trim() } });
      await load();
      toast.success(`${branch.name} Kitchen PIN updated`);
    } catch (error: any) {
      toast.error(error?.message || 'Kitchen PIN update failed');
    }
  }

  async function remove(branch: Branch) {
    if (!window.confirm(`Delete ${branch.name}?`)) return;
    try {
      await client.entities.branches.delete({ id: String(branch.id) });
      await load();
      toast.success('Branch deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete branch');
    }
  }

  return (
    <AdminSettingsPageLayout title="Branches" subtitle="Add Fujairah, Dubai, Dibba or any future Fai Fai branch. Customer app can choose the nearest active branch.">
      <div className="space-y-4">
        <Card className="border-gray-800 bg-gray-900 p-4">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <input className="rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" placeholder="Branch name (e.g. Fai Fai Fujairah)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" inputMode="numeric" maxLength={8} placeholder="Kitchen PIN (4-8 digits)" value={form.kitchen_pin} onChange={(e) => setForm({ ...form, kitchen_pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
            <div className="flex items-center text-xs text-gray-500">Default/live branch: blank rakho to current Render KITCHEN_PIN same rahega.</div>
            <input className="md:col-span-2 rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <input className="rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
            <input className="rounded-xl border border-gray-700 bg-gray-950 p-3 text-white" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
            <Button type="button" variant="outline" onClick={useCurrentLocation}><MapPin className="mr-2 h-4 w-4" />Use current location</Button>
            <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Make default branch</label>
            <Button disabled={saving} type="submit" className="md:col-span-2"><Plus className="mr-2 h-4 w-4" />{saving ? 'Adding...' : 'Add Branch'}</Button>
          </form>
        </Card>

        {branches.map((branch) => (
          <Card key={branch.id} className="border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-white font-bold">{branch.name}{branch.is_default && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">Default</span>}</div>
                <div className="mt-1 text-xs text-gray-400">{branch.address || 'No address'} · {Number(branch.latitude).toFixed(5)}, {Number(branch.longitude).toFixed(5)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void changeKitchenPin(branch)}><KeyRound className="mr-1 h-4 w-4" />Kitchen PIN</Button>
                {!branch.is_default && <Button size="sm" variant="outline" onClick={() => void setDefault(branch)}><Star className="mr-1 h-4 w-4" />Default</Button>}
                {branch.is_default ? (
                  <Button size="sm" variant="outline" disabled>Active</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void toggleActive(branch)}>{branch.is_active ? 'Active' : 'Disabled'}</Button>
                )}
                <Button size="sm" variant="destructive" disabled={branch.is_default} title={branch.is_default ? 'Make another branch default before deleting this one' : 'Delete branch'} onClick={() => void remove(branch)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AdminSettingsPageLayout>
  );
}
