import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Image as ImageIcon, Upload, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { client, Category, MenuItem, Extra, SizeOption, getItemSizes } from '@/lib/api';
import { uploadMenuImage } from '@/lib/image-upload';

export default function AdminMenu() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);

  // Form states
  const [itemForm, setItemForm] = useState({ name: '', description: '', category_id: 0, image_url: '', has_extras: true, is_popular: false });
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([{ name: 'Medium', price: 0 }, { name: 'Large', price: 0 }]);
  const [categoryForm, setCategoryForm] = useState({ name: '', sort_order: 0 });
  const [extraForm, setExtraForm] = useState({ name: '', price: 0 });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); setLoading(false); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); setLoading(false); return; }
    } catch { navigate('/admin'); setLoading(false); return; }
    await loadData();
    setLoading(false);
  }

  async function loadData() {
    try {
      const [catRes, itemRes, extrasRes] = await Promise.all([
        client.entities.categories.query({ query: {}, sort: 'sort_order', limit: 50 }),
        client.entities.menu_items.query({ query: {}, sort: 'sort_order', limit: 200 }),
        client.entities.extras.query({ query: {}, limit: 50 }),
      ]);
      setCategories(catRes?.data?.items || []);
      setMenuItems(itemRes?.data?.items || []);
      setExtras(extrasRes?.data?.items || []);
    } catch (e) { console.error('Failed to load data:', e); }
  }

  // Image upload
  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const imageUrl = await uploadMenuImage(file);
      setItemForm(prev => ({ ...prev, image_url: imageUrl }));
      toast.success('Image uploaded successfully!');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // Category CRUD
  function openCategoryDialog(cat?: Category) {
    if (cat) {
      setEditingCategory(cat);
      setCategoryForm({ name: cat.name, sort_order: cat.sort_order });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', sort_order: categories.length + 1 });
    }
    setCategoryDialogOpen(true);
  }

  async function saveCategory() {
    try {
      if (editingCategory) {
        await client.entities.categories.update({ id: String(editingCategory.id), data: categoryForm });
        toast.success('Category updated');
      } else {
        await client.entities.categories.create({ data: { ...categoryForm, is_active: true } });
        toast.success('Category created');
      }
      setCategoryDialogOpen(false);
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to save category'); }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category?')) return;
    try {
      await client.entities.categories.delete({ id: String(id) });
      toast.success('Category deleted');
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to delete'); }
  }

  // Menu Item CRUD with custom sizes
  function openItemDialog(item?: MenuItem) {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name,
        description: item.description,
        category_id: item.category_id,
        image_url: item.image_url || '',
        has_extras: item.has_extras !== false,
        is_popular: (item as any).is_popular === true,
      });
      // Load sizes from sizes_json or fallback
      const sizes = getItemSizes(item);
      setSizeOptions(sizes);
    } else {
      setEditingItem(null);
      setItemForm({ name: '', description: '', category_id: categories[0]?.id || 0, image_url: '', has_extras: true, is_popular: false });
      setSizeOptions([{ name: 'Medium', price: 0 }, { name: 'Large', price: 0 }]);
    }
    setItemDialogOpen(true);
  }

  function addSizeOption() {
    setSizeOptions([...sizeOptions, { name: '', price: 0 }]);
  }

  function removeSizeOption(idx: number) {
    if (sizeOptions.length <= 1) {
      toast.error('At least one size is required');
      return;
    }
    setSizeOptions(sizeOptions.filter((_, i) => i !== idx));
  }

  function updateSizeOption(idx: number, field: 'name' | 'price', value: string | number) {
    const updated = [...sizeOptions];
    if (field === 'name') updated[idx].name = value as string;
    else updated[idx].price = value as number;
    setSizeOptions(updated);
  }

  async function saveItem() {
    // Validate sizes
    const validSizes = sizeOptions.filter(s => s.name.trim() && s.price > 0);
    if (validSizes.length === 0) {
      toast.error('Please add at least one size with a name and price');
      return;
    }

    // Store sizes as JSON and also keep legacy price_medium/price_large for backward compat
    const sizesJson = JSON.stringify(validSizes);
    const priceMedium = validSizes[0]?.price || 0;
    const priceLarge = validSizes.length > 1 ? validSizes[validSizes.length - 1].price : validSizes[0]?.price || 0;

    const saveData = {
      name: itemForm.name,
      description: itemForm.description,
      category_id: itemForm.category_id,
      price_medium: priceMedium,
      price_large: priceLarge,
      sizes_json: sizesJson,
      image_url: itemForm.image_url,
      has_extras: itemForm.has_extras,
      is_popular: itemForm.is_popular,
    };

    try {
      if (editingItem) {
        await client.entities.menu_items.update({ id: String(editingItem.id), data: saveData });
        toast.success('Item updated');
      } else {
        await client.entities.menu_items.create({ data: { ...saveData, is_active: true, sort_order: menuItems.length + 1 } });
        toast.success('Item created');
      }
      setItemDialogOpen(false);
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to save item'); }
  }

  async function toggleItemActive(item: MenuItem) {
    try {
      await client.entities.menu_items.update({ id: String(item.id), data: { is_active: !item.is_active } });
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to toggle'); }
  }

  async function togglePopular(item: MenuItem) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/admin/menu/${item.id}/toggle-popular`,
        method: 'PUT',
      });
      await loadData();
      toast.success(`${item.name} ${item.is_popular ? 'removed from' : 'marked as'} popular`);
    } catch (e: any) { toast.error(e?.message || 'Failed to toggle popular'); }
  }

  async function deleteItem(id: number) {
    if (!confirm('Delete this item?')) return;
    try {
      await client.entities.menu_items.delete({ id: String(id) });
      toast.success('Item deleted');
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to delete'); }
  }

  // Extra CRUD
  function openExtraDialog(extra?: Extra) {
    if (extra) {
      setEditingExtra(extra);
      setExtraForm({ name: extra.name, price: extra.price });
    } else {
      setEditingExtra(null);
      setExtraForm({ name: '', price: 0 });
    }
    setExtraDialogOpen(true);
  }

  async function saveExtra() {
    try {
      if (editingExtra) {
        await client.entities.extras.update({ id: String(editingExtra.id), data: extraForm });
        toast.success('Extra updated');
      } else {
        await client.entities.extras.create({ data: { ...extraForm, is_active: true } });
        toast.success('Extra created');
      }
      setExtraDialogOpen(false);
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to save extra'); }
  }

  async function deleteExtra(id: number) {
    if (!confirm('Delete this extra?')) return;
    try {
      await client.entities.extras.delete({ id: String(id) });
      toast.success('Extra deleted');
      await loadData();
    } catch (e: any) { toast.error(e?.message || 'Failed to delete'); }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-white text-2xl font-bold">Menu Management</h1>
        </div>

        <Tabs defaultValue="items" className="space-y-4">
          <TabsList className="bg-gray-900 border-gray-700">
            <TabsTrigger value="items">Menu Items</TabsTrigger>
            <TabsTrigger value="popular">⭐ Popular</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="extras">Extras/Toppings</TabsTrigger>
          </TabsList>

          {/* Menu Items Tab */}
          <TabsContent value="items" className="space-y-4">
            <Button onClick={() => openItemDialog()} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
            <div className="space-y-3">
              {menuItems.map(item => {
                const sizes = getItemSizes(item);
                return (
                  <Card key={item.id} className={`bg-gray-900 border-gray-800 p-4 ${!item.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      {item.image_url && (
                        <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
                      )}
                      {!item.image_url && (
                        <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold">{item.name}</h3>
                        <p className="text-gray-400 text-sm truncate">
                          {categories.find(c => c.id === item.category_id)?.name} • {sizes.map(s => `${s.name}: AED ${s.price}`).join(' / ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => togglePopular(item)} className="cursor-pointer" title={item.is_popular ? 'Remove from Popular' : 'Mark as Popular'}>
                          <Star className={`w-4 h-4 ${item.is_popular ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`} />
                        </button>
                        <button onClick={() => toggleItemActive(item)} className="cursor-pointer text-gray-400 hover:text-white">
                          {item.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button onClick={() => openItemDialog(item)} className="cursor-pointer text-gray-400 hover:text-white">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteItem(item.id)} className="cursor-pointer text-gray-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Popular Items Tab - Visual Toggle with Images */}
          <TabsContent value="popular" className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
              <h3 className="text-white font-semibold mb-1">⭐ Popular Items on Homepage</h3>
              <p className="text-gray-500 text-xs">Toggle ON/OFF which items appear in the "Popular Items" section on the customer homepage. Items with the star ON will show on homepage.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {menuItems.filter(i => i.is_active).map(item => {
                const sizes = getItemSizes(item);
                const lowestPrice = Math.min(...sizes.map(s => s.price));
                return (
                  <Card
                    key={item.id}
                    className={`bg-gray-900 border-2 overflow-hidden transition-all cursor-pointer ${
                      item.is_popular ? 'border-yellow-500/60 bg-yellow-900/10' : 'border-gray-800 hover:border-gray-700'
                    }`}
                    onClick={() => togglePopular(item)}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl">🍕</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold text-sm truncate">{item.name}</h4>
                        <p className="text-gray-500 text-xs">{categories.find(c => c.id === item.category_id)?.name}</p>
                        <p className="text-red-400 text-xs font-bold mt-0.5">AED {lowestPrice}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <Star className={`w-6 h-6 transition-all ${item.is_popular ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {menuItems.filter(i => i.is_active && i.is_popular).length > 0 && (
              <div className="bg-green-900/20 border border-green-600/30 rounded-xl p-3 mt-4">
                <p className="text-green-400 text-sm font-medium">
                  ✅ {menuItems.filter(i => i.is_active && i.is_popular).length} items marked as popular
                </p>
              </div>
            )}
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <Button onClick={() => openCategoryDialog()} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Add Category
            </Button>
            <div className="space-y-3">
              {categories.map(cat => (
                <Card key={cat.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{cat.name}</h3>
                      <p className="text-gray-400 text-sm">Order: {cat.sort_order} • {menuItems.filter(i => i.category_id === cat.id).length} items</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openCategoryDialog(cat)} className="cursor-pointer text-gray-400 hover:text-white">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteCategory(cat.id)} className="cursor-pointer text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Extras Tab */}
          <TabsContent value="extras" className="space-y-4">
            <Button onClick={() => openExtraDialog()} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Add Extra/Topping
            </Button>
            <div className="space-y-3">
              {extras.map(extra => (
                <Card key={extra.id} className="bg-gray-900 border-gray-800 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-semibold">{extra.name}</h3>
                      <p className="text-gray-400 text-sm">+AED {extra.price}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openExtraDialog(extra)} className="cursor-pointer text-gray-400 hover:text-white">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteExtra(extra.id)} className="cursor-pointer text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Item Dialog - Enhanced with Custom Sizes */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Name *</Label>
              <Input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">Description</Label>
              <Textarea value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-gray-300">Item Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
              <div className="mt-1 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="border-gray-700 text-gray-300 hover:text-white cursor-pointer"
                >
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {uploading ? 'Uploading...' : 'Upload Image'}
                </Button>
                {itemForm.image_url && (
                  <img src={itemForm.image_url} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
                )}
              </div>
              <Input
                value={itemForm.image_url}
                onChange={e => setItemForm({ ...itemForm, image_url: e.target.value })}
                placeholder="Or paste image URL here"
                className="bg-gray-800 border-gray-700 text-white mt-2 text-xs"
              />
            </div>
            <div>
              <Label className="text-gray-300">Category</Label>
              <Select value={String(itemForm.category_id)} onValueChange={v => setItemForm({ ...itemForm, category_id: Number(v) })}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Has Extras Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-700">
              <div>
                <Label className="text-gray-300">Allow Extra Toppings</Label>
                <p className="text-gray-500 text-xs mt-0.5">Show extras/toppings selection for this item</p>
              </div>
              <button
                type="button"
                onClick={() => setItemForm({ ...itemForm, has_extras: !itemForm.has_extras })}
                className="cursor-pointer"
              >
                {itemForm.has_extras
                  ? <ToggleRight className="w-6 h-6 text-green-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-500" />
                }
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
              <div>
                <Label className="text-gray-300">⭐ Mark as Popular</Label>
                <p className="text-gray-500 text-xs mt-0.5">Show this item in Popular section on homepage</p>
              </div>
              <button
                type="button"
                onClick={() => setItemForm({ ...itemForm, is_popular: !itemForm.is_popular })}
                className="cursor-pointer"
              >
                {itemForm.is_popular
                  ? <ToggleRight className="w-6 h-6 text-orange-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-500" />
                }
              </button>
            </div>

            {/* Custom Size Options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-300">Size Options & Prices *</Label>
                <Button size="sm" variant="ghost" onClick={addSizeOption} className="text-green-400 hover:text-green-300 text-xs cursor-pointer">
                  <Plus className="w-3 h-3 mr-1" /> Add Size
                </Button>
              </div>
              <p className="text-gray-500 text-xs mb-2">Add one or more sizes. Even if item has only one size, add it here (e.g. "Regular" with its price).</p>
              <div className="space-y-2">
                {sizeOptions.map((size, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={size.name}
                      onChange={e => updateSizeOption(idx, 'name', e.target.value)}
                      placeholder="Size name (e.g. Small, Medium, Large, Family)"
                      className="bg-gray-800 border-gray-700 text-white flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-xs">AED</span>
                      <Input
                        type="number"
                        value={size.price || ''}
                        onChange={e => updateSizeOption(idx, 'price', Number(e.target.value))}
                        placeholder="0"
                        className="bg-gray-800 border-gray-700 text-white w-20"
                      />
                    </div>
                    <button onClick={() => removeSizeOption(idx)} className="text-red-400 hover:text-red-300 cursor-pointer p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={saveItem} className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {editingItem ? 'Update Item' : 'Add Item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Name</Label>
              <Input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">Sort Order</Label>
              <Input type="number" value={categoryForm.sort_order} onChange={e => setCategoryForm({ ...categoryForm, sort_order: Number(e.target.value) })} className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
            <Button onClick={saveCategory} className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {editingCategory ? 'Update Category' : 'Add Category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extra Dialog */}
      <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{editingExtra ? 'Edit Extra/Topping' : 'Add Extra/Topping'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300">Name</Label>
              <Input value={extraForm.name} onChange={e => setExtraForm({ ...extraForm, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">Price (AED)</Label>
              <Input type="number" value={extraForm.price} onChange={e => setExtraForm({ ...extraForm, price: Number(e.target.value) })} className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
            <Button onClick={saveExtra} className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {editingExtra ? 'Update Extra' : 'Add Extra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
