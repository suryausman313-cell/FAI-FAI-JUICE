import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, Package, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { client } from '@/lib/api';
import { uploadMenuImage } from '@/lib/image-upload';

interface DealCategory {
  category_id: number;
  category_name: string;
  required_quantity: number;
  display_order: number;
}

interface Deal {
  id: number;
  name: string;
  price: number;
  image_url: string;
  description: string;
  is_active: boolean;
  discount_type: string;
  discount_value: number;
  categories: DealCategory[];
  created_at: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

export default function AdminDeals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formDiscountType, setFormDiscountType] = useState('none');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formCategories, setFormCategories] = useState<DealCategory[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    await loadData();
    setLoading(false);
  }

  async function loadData() {
    try {
      // Load deals via entity SDK
      const dealsRes = await client.entities.deals.query({ query: {}, sort: '-id', limit: 100 });
      const rawDeals = dealsRes?.data?.items || dealsRes?.data || [];
      const dealsList = Array.isArray(rawDeals) ? rawDeals : rawDeals?.items || [];
      setDeals(dealsList.map((d: any) => ({
        ...d,
        categories: d.categories_json ? (typeof d.categories_json === 'string' ? JSON.parse(d.categories_json) : d.categories_json) : [],
      })));

      // Load categories for the dropdown
      const catsRes = await client.entities.categories.query({ query: {}, sort: 'sort_order', limit: 100 });
      const catItems = catsRes?.data?.items || catsRes?.data || [];
      const catsList = Array.isArray(catItems) ? catItems : catItems?.items || [];
      setCategories(catsList.map((c: any) => ({ id: c.id, name: c.name })));
    } catch (e) {
      console.error('Failed to load deals:', e);
      toast.error('Failed to load deals data');
    }
  }

  function openCreateForm() {
    setEditingDeal(null);
    setFormName('');
    setFormPrice('');
    setFormDescription('');
    setFormImageUrl('');
    setFormActive(true);
    setFormDiscountType('none');
    setFormDiscountValue('');
    setFormCategories([]);
    setShowForm(true);
  }

  function openEditForm(deal: Deal) {
    setEditingDeal(deal);
    setFormName(deal.name);
    setFormPrice(String(deal.price));
    setFormDescription(deal.description);
    setFormImageUrl(deal.image_url);
    setFormActive(deal.is_active);
    setFormDiscountType(deal.discount_type || 'none');
    setFormDiscountValue(deal.discount_value ? String(deal.discount_value) : '');
    setFormCategories([...deal.categories]);
    setShowForm(true);
  }

  function addCategory() {
    if (categories.length === 0) return;
    setFormCategories([
      ...formCategories,
      {
        category_id: categories[0].id,
        category_name: categories[0].name,
        required_quantity: 1,
        display_order: formCategories.length,
      },
    ]);
  }

  function updateCategoryField(index: number, field: string, value: any) {
    const updated = [...formCategories];
    if (field === 'category_id') {
      const cat = categories.find(c => c.id === Number(value));
      updated[index] = { ...updated[index], category_id: Number(value), category_name: cat?.name || '' };
    } else if (field === 'required_quantity') {
      updated[index] = { ...updated[index], required_quantity: Math.max(1, Number(value)) };
    }
    setFormCategories(updated);
  }

  function removeCategory(index: number) {
    setFormCategories(formCategories.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!formName || !formPrice || formCategories.length === 0) {
      toast.error('Please fill in name, price, and add at least one category');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName,
        price: parseFloat(formPrice),
        description: formDescription,
        image_url: formImageUrl,
        is_active: formActive,
        discount_type: formDiscountType,
        discount_value: formDiscountType !== 'none' ? parseFloat(formDiscountValue) || 0 : 0,
        categories_json: JSON.stringify(formCategories.map((c, i) => ({ ...c, display_order: i }))),
      };

      if (editingDeal) {
        await client.entities.deals.update({ id: String(editingDeal.id), data: payload });
        toast.success('Deal updated!');
      } else {
        await client.entities.deals.create({ data: payload });
        toast.success('Deal created!');
      }

      setShowForm(false);
      await loadData();
    } catch (e: any) {
      console.error('Deal save error:', e);
      const errorMsg = e?.response?.data?.detail || e?.message || 'Failed to save deal';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dealId: number) {
    if (!confirm('Delete this deal permanently?')) return;
    try {
      await client.entities.deals.delete({ id: String(dealId) });
      toast.success('Deal deleted');
      await loadData();
    } catch (e: any) {
      console.error('Deal delete error:', e);
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to delete');
    }
  }

  async function handleToggleActive(deal: Deal) {
    try {
      await client.entities.deals.update({ id: String(deal.id), data: { is_active: !deal.is_active } });
      toast.success(deal.is_active ? 'Deal disabled' : 'Deal enabled');
      await loadData();
    } catch (e: any) {
      console.error('Deal toggle error:', e);
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to toggle deal');
    }
  }

  if (loading) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen px-4 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/dashboard')} className="text-gray-400 hover:text-white cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white text-xl font-bold">Deal Builder</h1>
        </div>
        <Button onClick={openCreateForm} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> New Deal
        </Button>
      </div>

      {/* Deals List */}
      {deals.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800 p-8 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No deals yet. Create your first deal!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {deals.map(deal => (
            <Card key={deal.id} className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold">{deal.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${deal.is_active ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {deal.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {deal.discount_type && deal.discount_type !== 'none' ? (
                      <>
                        <span className="text-gray-500 line-through text-sm">AED {deal.price.toFixed(2)}</span>
                        <span className="text-green-400 font-bold text-lg">
                          AED {deal.discount_type === 'percentage'
                            ? (deal.price * (1 - (deal.discount_value || 0) / 100)).toFixed(2)
                            : Math.max(0, deal.price - (deal.discount_value || 0)).toFixed(2)
                          }
                        </span>
                        <span className="text-green-500 text-xs bg-green-900/40 px-1.5 py-0.5 rounded">
                          {deal.discount_type === 'percentage' ? `${deal.discount_value}% OFF` : `AED ${deal.discount_value} OFF`}
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400 font-bold text-lg">AED {deal.price.toFixed(2)}</span>
                    )}
                  </div>
                  {deal.description && <p className="text-gray-400 text-sm mt-1">{deal.description}</p>}
                  <div className="mt-2 space-y-1">
                    {deal.categories.map((cat, i) => (
                      <div key={i} className="text-gray-300 text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Choose {cat.required_quantity} {cat.category_name}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={deal.is_active}
                    onCheckedChange={() => handleToggleActive(deal)}
                  />
                  <button onClick={() => openEditForm(deal)} className="text-gray-400 hover:text-white p-1 cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(deal.id)} className="text-gray-400 hover:text-red-500 p-1 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{editingDeal ? 'Edit Deal' : 'Create New Deal'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Deal Name *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Family Feast"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Deal Price (AED) *</Label>
              <Input
                type="number"
                step="0.5"
                value={formPrice}
                onChange={e => setFormPrice(e.target.value)}
                placeholder="e.g. 99"
                className="bg-gray-800 border-gray-700 text-white mt-1 w-40"
              />
            </div>

            {/* Discount Section */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300">Discount Type</Label>
                <Select value={formDiscountType} onValueChange={setFormDiscountType}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="none" className="text-white">No Discount</SelectItem>
                    <SelectItem value="percentage" className="text-white">Percentage (%)</SelectItem>
                    <SelectItem value="flat" className="text-white">Flat (AED)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formDiscountType !== 'none' && (
                <div>
                  <Label className="text-gray-300">
                    {formDiscountType === 'percentage' ? 'Discount %' : 'Discount AED'}
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={formDiscountValue}
                    onChange={e => setFormDiscountValue(e.target.value)}
                    placeholder={formDiscountType === 'percentage' ? 'e.g. 20' : 'e.g. 10'}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              )}
            </div>
            {formDiscountType !== 'none' && formPrice && formDiscountValue && (
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-2 text-sm">
                <span className="text-gray-400 line-through">AED {parseFloat(formPrice).toFixed(2)}</span>
                <span className="text-green-400 font-bold ml-2">
                  AED {formDiscountType === 'percentage'
                    ? (parseFloat(formPrice) * (1 - parseFloat(formDiscountValue) / 100)).toFixed(2)
                    : Math.max(0, parseFloat(formPrice) - parseFloat(formDiscountValue)).toFixed(2)
                  }
                </span>
                <span className="text-green-500 text-xs ml-2">
                  ({formDiscountType === 'percentage' ? `${formDiscountValue}% off` : `AED ${formDiscountValue} off`})
                </span>
              </div>
            )}

            <div>
              <Label className="text-gray-300">Description (optional)</Label>
              <Textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="e.g. Perfect for the whole family!"
                className="bg-gray-800 border-gray-700 text-white mt-1"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-gray-300">Deal Image</Label>
              {formImageUrl && (
                <div className="mt-2 mb-2 relative">
                  <img
                    src={formImageUrl}
                    alt="Deal"
                    className="w-full h-32 object-cover rounded-lg border border-gray-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormImageUrl('')}
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
                        const imageUrl = await uploadMenuImage(file);
                        setFormImageUrl(imageUrl);
                        toast.success('Image uploaded!');
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
                  value={formImageUrl}
                  onChange={e => setFormImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-gray-800 border-gray-700 text-white mt-1 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <span className="text-gray-300 text-sm">{formActive ? 'Active (visible to customers)' : 'Disabled (hidden)'}</span>
            </div>

            {/* Categories Section */}
            <div className="border-t border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-gray-200 font-semibold">Deal Categories *</Label>
                <Button
                  type="button"
                  onClick={addCategory}
                  size="sm"
                  className="bg-gray-700 hover:bg-gray-600 text-white cursor-pointer"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Category
                </Button>
              </div>

              {formCategories.length === 0 && (
                <p className="text-gray-500 text-sm">Add at least one category (e.g. "Choose 3 Pizzas")</p>
              )}

              <div className="space-y-3">
                {formCategories.map((cat, index) => (
                  <div key={index} className="bg-gray-800 rounded-lg p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <Select
                        value={String(cat.category_id)}
                        onValueChange={(val) => updateCategoryField(index, 'category_id', val)}
                      >
                        <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {categories.map(c => (
                            <SelectItem key={c.id} value={String(c.id)} className="text-white">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min="1"
                        value={cat.required_quantity}
                        onChange={e => updateCategoryField(index, 'required_quantity', e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white text-center"
                      />
                    </div>
                    <span className="text-gray-400 text-xs whitespace-nowrap">items</span>
                    <button onClick={() => removeCategory(index)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {formCategories.length > 0 && (
                <div className="mt-3 p-2 bg-gray-800/50 rounded-lg">
                  <p className="text-gray-400 text-xs">Preview: Customer will choose</p>
                  {formCategories.map((cat, i) => (
                    <p key={i} className="text-gray-200 text-sm">• {cat.required_quantity} {cat.category_name}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-700">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                {saving ? 'Saving...' : (editingDeal ? 'Update Deal' : 'Create Deal')}
              </Button>
              <Button
                onClick={() => setShowForm(false)}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-800 cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
