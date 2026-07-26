import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { client, Offer } from '@/lib/api';

export default function AdminOffers() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    discount_percent: 0,
    promo_code: '',
    banner_image_url: '',
    is_active: true,
    start_date: '',
    end_date: '',
    first_order_only: false,
    usage_limit_per_customer: 1,
  });

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    loadOffers();
  }, []);

  async function loadOffers() {
    try {
      const res = await client.entities.offers.query({ query: {}, sort: '-created_at', limit: 50 });
      setOffers(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load offers:', e);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingOffer(null);
    setForm({
      title: '',
      description: '',
      discount_percent: 0,
      promo_code: '',
      banner_image_url: '',
      is_active: true,
      start_date: '',
      end_date: '',
      first_order_only: false,
      usage_limit_per_customer: 1,
    });
    setDialogOpen(true);
  }

  function openEditDialog(offer: Offer) {
    setEditingOffer(offer);
    setForm({
      title: offer.title,
      description: offer.description || '',
      discount_percent: offer.discount_percent || 0,
      promo_code: offer.promo_code || '',
      banner_image_url: offer.banner_image_url || '',
      is_active: offer.is_active,
      start_date: offer.start_date || '',
      end_date: offer.end_date || '',
      first_order_only: (offer as any).first_order_only || false,
      usage_limit_per_customer: (offer as any).usage_limit_per_customer ?? 1,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title) {
      toast.error('Title is required');
      return;
    }
    try {
      if (editingOffer) {
        await client.entities.offers.update({
          id: String(editingOffer.id),
          data: form,
        });
        toast.success('Offer updated');
      } else {
        await client.entities.offers.create({ data: form });
        toast.success('Offer created');
      }
      setDialogOpen(false);
      loadOffers();
    } catch (e) {
      toast.error('Failed to save offer');
    }
  }

  async function toggleActive(offer: Offer) {
    try {
      await client.entities.offers.update({
        id: String(offer.id),
        data: { is_active: !offer.is_active },
      });
      toast.success(offer.is_active ? 'Offer deactivated' : 'Offer activated');
      loadOffers();
    } catch {
      toast.error('Failed to update offer');
    }
  }

  async function deleteOffer(offer: Offer) {
    if (!confirm(`Delete offer "${offer.title}"?`)) return;
    try {
      await client.entities.offers.delete({ id: String(offer.id) });
      toast.success('Offer deleted');
      loadOffers();
    } catch {
      toast.error('Failed to delete offer');
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin/dashboard')} className="text-gray-400 hover:text-white cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-white text-xl font-bold">Offers & Promotions</h1>
          </div>
          <Button onClick={openCreateDialog} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
            <Plus className="w-4 h-4 mr-2" /> New Offer
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : offers.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-4">No offers yet</p>
            <Button onClick={openCreateDialog} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              Create First Offer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map(offer => (
              <Card key={offer.id} className="bg-gray-900 border-gray-800 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {offer.banner_image_url && (
                      <img
                        src={offer.banner_image_url}
                        alt={offer.title}
                        className="w-16 h-16 object-cover rounded-lg border border-gray-700 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-semibold">{offer.title}</h3>
                      <Badge className={offer.is_active ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}>
                        {offer.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {offer.discount_percent > 0 && (
                        <Badge className="bg-red-600 text-white">{offer.discount_percent}% OFF</Badge>
                      )}
                      {offer.first_order_only && (
                        <Badge className="bg-purple-600 text-white">1st Order Only</Badge>
                      )}
                    </div>
                    {offer.description && (
                      <p className="text-gray-400 text-sm">{offer.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {offer.promo_code && <span>Code: <span className="text-orange-400 font-mono">{offer.promo_code}</span></span>}
                      {offer.start_date && <span>From: {offer.start_date}</span>}
                      {offer.end_date && <span>To: {offer.end_date}</span>}
                    </div>
                  </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => toggleActive(offer)} className="text-gray-400 hover:text-white cursor-pointer p-1">
                      {offer.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => openEditDialog(offer)} className="text-gray-400 hover:text-blue-400 cursor-pointer p-1">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteOffer(offer)} className="text-gray-400 hover:text-red-400 cursor-pointer p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'Edit Offer' : 'Create New Offer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Weekend Special"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Offer details..."
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Discount %</Label>
                <Input
                  type="number"
                  value={form.discount_percent}
                  onChange={e => setForm({ ...form, discount_percent: Number(e.target.value) })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">Promo Code</Label>
                <Input
                  value={form.promo_code}
                  onChange={e => setForm({ ...form, promo_code: e.target.value.toUpperCase() })}
                  placeholder="e.g. PIZZA20"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Start Date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-gray-300">End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-300">Offer Image</Label>
              {form.banner_image_url && (
                <div className="mt-2 mb-2 relative">
                  <img
                    src={form.banner_image_url}
                    alt="Offer"
                    className="w-full h-32 object-cover rounded-lg border border-gray-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_image_url: '' })}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs cursor-pointer hover:bg-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors">
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400 text-sm">Upload Image</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('Image must be under 5MB');
                        return;
                      }
                      toast.info('Uploading image...');
                      try {
                        const ext = file.name.split('.').pop() || 'jpg';
                        const objectKey = `offers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                        
                        // Get upload URL
                        const uploadRes = await client.storage.getUploadUrl({
                          bucket_name: 'offer-images',
                          object_key: objectKey,
                        });
                        const uploadUrl = uploadRes?.data?.upload_url;
                        if (!uploadUrl) throw new Error('Failed to get upload URL');

                        // Upload file
                        await fetch(uploadUrl, {
                          method: 'PUT',
                          body: file,
                          headers: { 'Content-Type': file.type },
                        });

                        // Get download URL
                        const downloadRes = await client.storage.getDownloadUrl({
                          bucket_name: 'offer-images',
                          object_key: objectKey,
                        });
                        const downloadUrl = downloadRes?.data?.download_url;
                        
                        if (downloadUrl) {
                          setForm({ ...form, banner_image_url: downloadUrl });
                          toast.success('Image uploaded!');
                        } else {
                          setForm({ ...form, banner_image_url: objectKey });
                          toast.success('Image uploaded!');
                        }
                      } catch (err: any) {
                        console.error('Upload error:', err);
                        toast.error('Failed to upload image');
                      }
                    }}
                  />
                </label>
              </div>
              <div className="mt-2">
                <Label className="text-gray-400 text-xs">Or paste image URL:</Label>
                <Input
                  value={form.banner_image_url}
                  onChange={e => setForm({ ...form, banner_image_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-gray-800 border-gray-700 text-white mt-1 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
              <div>
                <Label className="text-gray-300">First Order Only</Label>
                <p className="text-gray-500 text-xs mt-0.5">Only applies to customers with no previous orders</p>
              </div>
              <Switch
                checked={form.first_order_only}
                onCheckedChange={(checked) => setForm({ ...form, first_order_only: checked })}
              />
            </div>
            {/* Usage Limit Per Customer */}
            <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
              <Label className="text-gray-300">Usage Limit Per Customer</Label>
              <p className="text-gray-500 text-xs mt-0.5 mb-2">How many times each customer can use this promo (0 = unlimited)</p>
              <Input
                type="number"
                min="0"
                value={form.usage_limit_per_customer}
                onChange={e => setForm({ ...form, usage_limit_per_customer: Number(e.target.value) })}
                className="bg-gray-900 border-gray-700 text-white w-24"
                placeholder="1"
              />
            </div>
            <Button onClick={handleSave} className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {editingOffer ? 'Update Offer' : 'Create Offer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}