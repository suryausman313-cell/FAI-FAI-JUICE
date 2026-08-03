import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Plus,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { client, Offer } from '@/lib/api';
import { uploadMenuImage } from '@/lib/image-upload';

type DiscountType = 'percentage' | 'fixed';

type AdminOffer = Offer & {
  discount_type?: DiscountType;
  fixed_discount_amount?: number;
  minimum_order_amount?: number;
  maximum_discount_amount?: number;
  total_usage_limit?: number;
  created_at?: string;
  updated_at?: string;
};

type OfferForm = {
  title: string;
  description: string;
  discount_type: DiscountType;
  discount_percent: number;
  fixed_discount_amount: number;
  minimum_order_amount: number;
  maximum_discount_amount: number;
  promo_code: string;
  banner_image_url: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  first_order_only: boolean;
  usage_limit_per_customer: number;
  total_usage_limit: number;
};

const emptyForm: OfferForm = {
  title: '',
  description: '',
  discount_type: 'percentage',
  discount_percent: 10,
  fixed_discount_amount: 0,
  minimum_order_amount: 0,
  maximum_discount_amount: 0,
  promo_code: '',
  banner_image_url: '',
  is_active: true,
  start_date: '',
  end_date: '',
  first_order_only: false,
  usage_limit_per_customer: 1,
  total_usage_limit: 0,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong';
}

function money(value?: number): string {
  return `${Number(value || 0).toFixed(2)} AED`;
}

function getOfferStatus(offer: AdminOffer) {
  if (!offer.is_active) {
    return { label: 'Inactive', className: 'bg-gray-700 text-gray-300' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (offer.start_date) {
    const start = new Date(`${offer.start_date}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && now < start) {
      return { label: 'Scheduled', className: 'bg-blue-600 text-white' };
    }
  }

  if (offer.end_date) {
    const end = new Date(`${offer.end_date}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && now > end) {
      return { label: 'Expired', className: 'bg-orange-700 text-white' };
    }
  }

  return { label: 'Active', className: 'bg-green-600 text-white' };
}

export default function AdminOffers() {
  const navigate = useNavigate();

  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<AdminOffer | null>(null);
  const [form, setForm] = useState<OfferForm>({ ...emptyForm });

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');

    if (!auth) {
      navigate('/admin');
      return;
    }

    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) {
        navigate('/admin');
        return;
      }
    } catch {
      navigate('/admin');
      return;
    }

    void loadOffers();
  }, [navigate]);

  const activeOfferCount = useMemo(
    () => offers.filter((offer) => getOfferStatus(offer).label === 'Active').length,
    [offers],
  );

  async function loadOffers() {
    setLoading(true);

    try {
      const response = await client.entities.offers.query({
        query: {},
        sort: '-created_at',
        limit: 200,
      });

      setOffers((response?.data?.items || []) as AdminOffer[]);
    } catch (error) {
      console.error('Failed to load offers:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingOffer(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEditDialog(offer: AdminOffer) {
    setEditingOffer(offer);
    setForm({
      title: offer.title || '',
      description: offer.description || '',
      discount_type: offer.discount_type === 'fixed' ? 'fixed' : 'percentage',
      discount_percent: Number(offer.discount_percent || 0),
      fixed_discount_amount: Number(offer.fixed_discount_amount || 0),
      minimum_order_amount: Number(offer.minimum_order_amount || 0),
      maximum_discount_amount: Number(offer.maximum_discount_amount || 0),
      promo_code: offer.promo_code || '',
      banner_image_url: offer.banner_image_url || '',
      is_active: Boolean(offer.is_active),
      start_date: offer.start_date || '',
      end_date: offer.end_date || '',
      first_order_only: Boolean(offer.first_order_only),
      usage_limit_per_customer: Number(offer.usage_limit_per_customer ?? 1),
      total_usage_limit: Number(offer.total_usage_limit ?? 0),
    });
    setDialogOpen(true);
  }

  function validateForm(): string | null {
    if (!form.title.trim()) return 'Offer title is required';

    if (
      form.discount_type === 'percentage' &&
      (form.discount_percent <= 0 || form.discount_percent > 100)
    ) {
      return 'Percentage discount must be between 1 and 100';
    }

    if (form.discount_type === 'fixed' && form.fixed_discount_amount <= 0) {
      return 'Fixed discount must be greater than 0 AED';
    }

    if (form.minimum_order_amount < 0) return 'Minimum order cannot be negative';
    if (form.maximum_discount_amount < 0) return 'Maximum discount cannot be negative';
    if (form.usage_limit_per_customer < 0) return 'Customer usage limit cannot be negative';
    if (form.total_usage_limit < 0) return 'Total usage limit cannot be negative';

    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      return 'End date cannot be earlier than start date';
    }

    if (form.promo_code.includes(' ')) return 'Promo code cannot contain spaces';

    return null;
  }

  async function handleSave() {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_percent:
        form.discount_type === 'percentage' ? Number(form.discount_percent) : 0,
      fixed_discount_amount:
        form.discount_type === 'fixed' ? Number(form.fixed_discount_amount) : 0,
      minimum_order_amount: Number(form.minimum_order_amount || 0),
      maximum_discount_amount:
        form.discount_type === 'percentage'
          ? Number(form.maximum_discount_amount || 0)
          : 0,
      promo_code: form.promo_code.trim().toUpperCase(),
      banner_image_url: form.banner_image_url.trim(),
      is_active: form.is_active,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      first_order_only: form.first_order_only,
      usage_limit_per_customer: Number(form.usage_limit_per_customer || 0),
      total_usage_limit: Number(form.total_usage_limit || 0),
    };

    setSaving(true);

    try {
      if (editingOffer) {
        await client.entities.offers.update({
          id: String(editingOffer.id),
          data: payload,
        });
        toast.success('Offer updated successfully');
      } else {
        await client.entities.offers.create({ data: payload });
        toast.success('Offer created successfully');
      }

      setDialogOpen(false);
      setEditingOffer(null);
      await loadOffers();
    } catch (error) {
      console.error('Failed to save offer:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(offer: AdminOffer) {
    try {
      await client.entities.offers.update({
        id: String(offer.id),
        data: { is_active: !offer.is_active },
      });
      toast.success(offer.is_active ? 'Offer deactivated' : 'Offer activated');
      await loadOffers();
    } catch (error) {
      console.error('Failed to update offer:', error);
      toast.error(getErrorMessage(error));
    }
  }

  async function deleteOffer(offer: AdminOffer) {
    if (!window.confirm(`Delete offer "${offer.title}"?`)) return;

    try {
      await client.entities.offers.delete({ id: String(offer.id) });
      toast.success('Offer deleted');
      await loadOffers();
    } catch (error) {
      console.error('Failed to delete offer:', error);
      toast.error(getErrorMessage(error));
    }
  }

  async function uploadImage(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    toast.info('Uploading image...');

    try {
      const imageUrl = await uploadMenuImage(file);
      setForm((current) => ({
        ...current,
        banner_image_url: imageUrl,
      }));
      toast.success('Image uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="cursor-pointer text-gray-400 hover:text-white"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Offers & Promotions</h1>
              <p className="text-sm text-gray-400">
                {activeOfferCount} active out of {offers.length} offers
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void loadOffers()}
              disabled={loading}
              className="border-gray-700 bg-gray-900 text-white hover:bg-gray-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={openCreateDialog}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <Plus className="mr-2 h-4 w-4" /> New Offer
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading...</div>
        ) : offers.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-4 text-lg text-gray-500">No offers yet</p>
            <Button onClick={openCreateDialog} className="bg-red-600 text-white hover:bg-red-700">
              Create First Offer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const status = getOfferStatus(offer);
              const isFixed = offer.discount_type === 'fixed';

              return (
                <Card key={offer.id} className="border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {offer.banner_image_url && (
                        <img
                          src={offer.banner_image_url}
                          alt={offer.title}
                          className="h-20 w-20 flex-shrink-0 rounded-lg border border-gray-700 object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-white">{offer.title}</h3>
                          <Badge className={status.className}>{status.label}</Badge>
                          <Badge className="bg-red-600 text-white">
                            {isFixed
                              ? `${money(offer.fixed_discount_amount)} OFF`
                              : `${Number(offer.discount_percent || 0)}% OFF`}
                          </Badge>
                          {offer.first_order_only && (
                            <Badge className="bg-purple-600 text-white">1st Order Only</Badge>
                          )}
                        </div>

                        {offer.description && (
                          <p className="mb-2 text-sm text-gray-400">{offer.description}</p>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {offer.promo_code && (
                            <span>
                              Code:{' '}
                              <span className="font-mono font-semibold text-orange-400">
                                {offer.promo_code}
                              </span>
                            </span>
                          )}
                          {Number(offer.minimum_order_amount || 0) > 0 && (
                            <span>Minimum order: {money(offer.minimum_order_amount)}</span>
                          )}
                          {!isFixed && Number(offer.maximum_discount_amount || 0) > 0 && (
                            <span>Maximum discount: {money(offer.maximum_discount_amount)}</span>
                          )}
                          <span>
                            Per customer:{' '}
                            {Number(offer.usage_limit_per_customer || 0) === 0
                              ? 'Unlimited'
                              : offer.usage_limit_per_customer}
                          </span>
                          <span>
                            Total limit:{' '}
                            {Number(offer.total_usage_limit || 0) === 0
                              ? 'Unlimited'
                              : offer.total_usage_limit}
                          </span>
                          {offer.start_date && <span>From: {offer.start_date}</span>}
                          {offer.end_date && <span>To: {offer.end_date}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        onClick={() => void toggleActive(offer)}
                        className="cursor-pointer p-1 text-gray-400 hover:text-white"
                        aria-label={offer.is_active ? 'Deactivate offer' : 'Activate offer'}
                      >
                        {offer.is_active ? (
                          <ToggleRight className="h-6 w-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditDialog(offer)}
                        className="cursor-pointer p-1 text-gray-400 hover:text-blue-400"
                        aria-label="Edit offer"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void deleteOffer(offer)}
                        className="cursor-pointer p-1 text-gray-400 hover:text-red-400"
                        aria-label="Delete offer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto border-gray-700 bg-gray-900 text-white">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'Edit Offer' : 'Create New Offer'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Title *</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="e.g. Weekend Special"
                className="mt-1 border-gray-700 bg-gray-800 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Offer details..."
                className="mt-1 border-gray-700 bg-gray-800 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">Discount Type</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => setForm({ ...form, discount_type: 'percentage' })}
                  className={
                    form.discount_type === 'percentage'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }
                >
                  Percentage %
                </Button>
                <Button
                  type="button"
                  onClick={() => setForm({ ...form, discount_type: 'fixed' })}
                  className={
                    form.discount_type === 'fixed'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }
                >
                  Fixed AED
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.discount_type === 'percentage' ? (
                <div>
                  <Label className="text-gray-300">Discount Percentage *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={form.discount_percent}
                    onChange={(event) =>
                      setForm({ ...form, discount_percent: Number(event.target.value) })
                    }
                    className="mt-1 border-gray-700 bg-gray-800 text-white"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-gray-300">Fixed Discount (AED) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fixed_discount_amount}
                    onChange={(event) =>
                      setForm({ ...form, fixed_discount_amount: Number(event.target.value) })
                    }
                    className="mt-1 border-gray-700 bg-gray-800 text-white"
                  />
                </div>
              )}

              <div>
                <Label className="text-gray-300">Promo Code</Label>
                <Input
                  value={form.promo_code}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      promo_code: event.target.value.toUpperCase().replace(/\s/g, ''),
                    })
                  }
                  placeholder="e.g. PIZZA20"
                  className="mt-1 border-gray-700 bg-gray-800 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-gray-300">Minimum Order (AED)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimum_order_amount}
                  onChange={(event) =>
                    setForm({ ...form, minimum_order_amount: Number(event.target.value) })
                  }
                  className="mt-1 border-gray-700 bg-gray-800 text-white"
                />
                <p className="mt-1 text-xs text-gray-500">0 means no minimum order.</p>
              </div>

              {form.discount_type === 'percentage' && (
                <div>
                  <Label className="text-gray-300">Maximum Discount (AED)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maximum_discount_amount}
                    onChange={(event) =>
                      setForm({ ...form, maximum_discount_amount: Number(event.target.value) })
                    }
                    className="mt-1 border-gray-700 bg-gray-800 text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500">0 means no maximum limit.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-gray-300">Start Date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                  className="mt-1 border-gray-700 bg-gray-800 text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm({ ...form, end_date: event.target.value })}
                  className="mt-1 border-gray-700 bg-gray-800 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Offer Image</Label>
              {form.banner_image_url && (
                <div className="relative mb-2 mt-2">
                  <img
                    src={form.banner_image_url}
                    alt="Offer preview"
                    className="h-36 w-full rounded-lg border border-gray-700 object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, banner_image_url: '' })}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
                  >
                    ×
                  </button>
                </div>
              )}

              <label className="mt-1 block cursor-pointer">
                <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 transition-colors hover:border-gray-500">
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-400">
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>

              <Label className="mt-2 block text-xs text-gray-400">Or paste image URL</Label>
              <Input
                value={form.banner_image_url}
                onChange={(event) => setForm({ ...form, banner_image_url: event.target.value })}
                placeholder="https://..."
                className="mt-1 border-gray-700 bg-gray-800 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                <Label className="text-gray-300">Usage Per Customer</Label>
                <p className="mb-2 mt-1 text-xs text-gray-500">0 = unlimited</p>
                <Input
                  type="number"
                  min="0"
                  value={form.usage_limit_per_customer}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      usage_limit_per_customer: Number(event.target.value),
                    })
                  }
                  className="border-gray-700 bg-gray-900 text-white"
                />
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
                <Label className="text-gray-300">Total Usage Limit</Label>
                <p className="mb-2 mt-1 text-xs text-gray-500">0 = unlimited</p>
                <Input
                  type="number"
                  min="0"
                  value={form.total_usage_limit}
                  onChange={(event) =>
                    setForm({ ...form, total_usage_limit: Number(event.target.value) })
                  }
                  className="border-gray-700 bg-gray-900 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-3">
              <div>
                <Label className="text-gray-300">First Order Only</Label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Only customers with no previous orders can use it.
                </p>
              </div>
              <Switch
                checked={form.first_order_only}
                onCheckedChange={(checked) =>
                  setForm({ ...form, first_order_only: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 p-3">
              <div>
                <Label className="text-gray-300">Offer Active</Label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Turn this offer on or off.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>

            <Button
              onClick={() => void handleSave()}
              disabled={saving || uploading}
              className="w-full bg-red-600 text-white hover:bg-red-700"
            >
              {saving
                ? 'Saving...'
                : editingOffer
                  ? 'Update Offer'
                  : 'Create Offer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
