import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  Edit2,
  Image as ImageIcon,
  Loader2,
  Plus,
  Star,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Coffee,
  IceCream,
  GlassWater,
  CakeSlice,
  Salad,
  Sparkles,
} from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import {
  Category,
  Extra,
  getItemSizes,
  MenuItem,
  SizeOption,
} from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';
import { getItemPriceBreakdown } from '@/lib/discounts';
import { uploadMenuImage } from '@/lib/image-upload';

type EntityList<T> = {
  items?: T[];
  total?: number;
};

type DiscountType = 'percentage' | 'fixed';

type ItemExtraOption = {
  name: string;
  name_ar: string;
  price: number;
  choice_group: string;
  required: boolean;
};

type ItemForm = {
  name: string;
  name_ar: string;
  description: string;
  description_ar: string;
  category_id: number;
  image_url: string;
  has_extras: boolean;
  is_popular: boolean;
  discount_enabled: boolean;
  discount_type: DiscountType;
  discount_value: number;
  discount_start_at: string;
  discount_end_at: string;
};

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: unknown,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await axios.request<T>({
    url: `${apiBase()}${path}`,
    method,
    data,
    params,
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('fai_fai_admin_token')
        ? {
            Authorization: `Bearer ${localStorage.getItem('fai_fai_admin_token')}`,
          }
        : {}),
    },
  });

  return response.data;
}

function errorText(error: unknown, fallback: string): string {
  const value = error as any;
  return String(
    value?.response?.data?.detail ||
      value?.response?.data?.message ||
      value?.message ||
      fallback,
  );
}

function emptyItemForm(categoryId = 0): ItemForm {
  return {
    name: '',
    name_ar: '',
    description: '',
    description_ar: '',
    category_id: categoryId,
    image_url: '',
    has_extras: true,
    is_popular: false,
    discount_enabled: false,
    discount_type: 'percentage',
    discount_value: 0,
    discount_start_at: '',
    discount_end_at: '',
  };
}

function parseItemExtras(
  item: MenuItem,
  legacyExtras: Extra[],
): ItemExtraOption[] {
  const raw = item.extras_json;

  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    try {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) {
        return parsed
          .map((extra: any) => ({
            name: String(extra?.name || '').trim(),
            name_ar: String(extra?.name_ar || '').trim(),
            price: Math.max(0, Number(extra?.price || 0)),
            choice_group: String(extra?.choice_group || '').trim(),
            required: Boolean(extra?.required),
          }))
          .filter((extra: ItemExtraOption) => extra.name);
      }
    } catch {
      // Malformed old data: use legacy extras below.
    }
  }

  // Fai Fai uses extras saved directly under each menu item.
  // Never copy the old global Pizza/Jalapeno extras into an item while editing.
  return [];
}

function dateInputValue(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length >= 16 ? text.slice(0, 16) : text;
}

function clearCustomerMenuCache() {
  localStorage.removeItem('vita_menu_cache');
  window.dispatchEvent(new Event('menu-updated'));
}


function categoryIcon(index: number) {
  const icons = [Coffee, GlassWater, IceCream, CakeSlice, Salad, Sparkles];
  return icons[index % icons.length];
}

function itemDiscountText(item: MenuItem): string {
  if (!item.discount_enabled || Number(item.discount_value || 0) <= 0) {
    return '';
  }

  return item.discount_type === 'fixed'
    ? `AED ${Number(item.discount_value).toFixed(2)} OFF`
    : `${Number(item.discount_value).toFixed(
        Number(item.discount_value) % 1 === 0 ? 0 : 2,
      )}% OFF`;
}

export default function AdminMenu() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);

  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([
    { name: 'Medium', price: 0 },
    { name: 'Large', price: 0 },
  ]);
  const [itemExtraOptions, setItemExtraOptions] = useState<ItemExtraOption[]>([]);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    name_ar: '',
    sort_order: 0,
  });
  const [extraForm, setExtraForm] = useState({
    name: '',
    price: 0,
  });

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');

    if (!auth) {
      navigate('/admin');
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) {
        navigate('/admin');
        setLoading(false);
        return;
      }
    } catch {
      navigate('/admin');
      setLoading(false);
      return;
    }

    await loadData();
    setLoading(false);
  }

  async function loadData() {
    try {
      const [categoryData, itemData, extraData] = await Promise.all([
        request<EntityList<Category>>(
          '/api/v1/entities/categories',
          'GET',
          undefined,
          { sort: 'sort_order', limit: 100 },
        ),
        request<EntityList<MenuItem>>(
          '/api/v1/entities/menu_items',
          'GET',
          undefined,
          { sort: 'sort_order', limit: 500 },
        ),
        request<EntityList<Extra>>(
          '/api/v1/entities/extras',
          'GET',
          undefined,
          { sort: 'id', limit: 200 },
        ),
      ]);

      setCategories(categoryData.items || []);
      setMenuItems(itemData.items || []);
      setExtras(extraData.items || []);
    } catch (error) {
      console.error('Admin Menu load failed:', error);
      toast.error(errorText(error, 'Menu load nahi hua'));
    }
  }

  async function refreshAfterChange(message?: string) {
    clearCustomerMenuCache();
    await loadData();
    if (message) toast.success(message);
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const imageUrl = await uploadMenuImage(file);
      setItemForm((current) => ({
        ...current,
        image_url: imageUrl,
      }));
      toast.success('Image ready');
    } catch (error) {
      toast.error(errorText(error, 'Image upload failed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openCategoryDialog(category?: Category) {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        name_ar: String((category as any).name_ar || ''),
        sort_order: Number(category.sort_order || 0),
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        name_ar: '',
        sort_order: categories.length + 1,
      });
    }

    setCategoryDialogOpen(true);
  }

  async function saveCategory() {
    if (!categoryForm.name.trim()) {
      toast.error('Category name enter karein');
      return;
    }

    try {
      if (editingCategory) {
        await request(
          `/api/v1/entities/categories/${editingCategory.id}`,
          'PUT',
          categoryForm,
        );
        setCategoryDialogOpen(false);
        await refreshAfterChange('Category updated');
      } else {
        await request('/api/v1/entities/categories', 'POST', {
          ...categoryForm,
          is_active: true,
        });
        setCategoryDialogOpen(false);
        await refreshAfterChange('Category created');
      }
    } catch (error) {
      toast.error(errorText(error, 'Category save failed'));
    }
  }

  async function deleteCategory(id: number) {
    if (!window.confirm('Delete this category?')) return;

    try {
      await request(`/api/v1/entities/categories/${id}`, 'DELETE');
      await refreshAfterChange('Category deleted');
    } catch (error) {
      toast.error(errorText(error, 'Category delete failed'));
    }
  }

  function openItemDialog(item?: MenuItem) {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name || '',
        name_ar: String((item as any).name_ar || ''),
        description: item.description || '',
        description_ar: String((item as any).description_ar || ''),
        category_id: Number(item.category_id || 0),
        image_url: item.image_url || '',
        has_extras: item.has_extras !== false,
        is_popular: item.is_popular === true,
        discount_enabled: item.discount_enabled === true,
        discount_type:
          item.discount_type === 'fixed' ? 'fixed' : 'percentage',
        discount_value: Number(item.discount_value || 0),
        discount_start_at: dateInputValue(item.discount_start_at),
        discount_end_at: dateInputValue(item.discount_end_at),
      });
      setSizeOptions(getItemSizes(item));
      setItemExtraOptions(parseItemExtras(item, extras));
    } else {
      setEditingItem(null);
      setItemForm(emptyItemForm(categories[0]?.id || 0));
      setSizeOptions([
        { name: 'Small', price: 0 },
        { name: 'Medium', price: 0 },
        { name: 'Large', price: 0 },
      ]);
      setItemExtraOptions([]);
    }

    setItemDialogOpen(true);
  }

  function addSizeOption() {
    setSizeOptions((current) => [
      ...current,
      { name: '', name_ar: '', price: 0 },
    ]);
  }

  function removeSizeOption(index: number) {
    if (sizeOptions.length <= 1) {
      toast.error('Kam az kam ek size zaroori hai');
      return;
    }

    setSizeOptions((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function updateSizeOption(
    index: number,
    field: 'name' | 'name_ar' | 'price',
    value: string | number,
  ) {
    setSizeOptions((current) =>
      current.map((size, itemIndex) =>
        itemIndex === index
          ? {
              ...size,
              [field]: value,
            }
          : size,
      ),
    );
  }

  function addItemExtraOption() {
    setItemExtraOptions(current => [
      ...current,
      { name: '', name_ar: '', price: 0, choice_group: 'Flavour', required: true },
    ]);
  }

  function removeItemExtraOption(index: number) {
    setItemExtraOptions(current =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function updateItemExtraOption(
    index: number,
    field: 'name' | 'name_ar' | 'price' | 'choice_group' | 'required',
    value: string | number | boolean,
  ) {
    setItemExtraOptions(current =>
      current.map((extra, itemIndex) =>
        itemIndex === index
          ? {
              ...extra,
              [field]: value,
            }
          : extra,
      ),
    );
  }

  function validateItem(validSizes: SizeOption[]): boolean {
    if (!itemForm.name.trim()) {
      toast.error('Item name enter karein');
      return false;
    }

    if (!itemForm.category_id) {
      toast.error('Category select karein');
      return false;
    }

    if (validSizes.length === 0) {
      toast.error('Kam az kam ek size aur price add karein');
      return false;
    }

    if (itemForm.discount_enabled) {
      const value = Number(itemForm.discount_value || 0);

      if (value <= 0) {
        toast.error('Discount value 0 se zyada honi chahiye');
        return false;
      }

      if (
        itemForm.discount_type === 'percentage' &&
        value > 100
      ) {
        toast.error('Percentage discount 100% se zyada nahi ho sakta');
        return false;
      }

      const start = itemForm.discount_start_at
        ? new Date(itemForm.discount_start_at)
        : null;
      const end = itemForm.discount_end_at
        ? new Date(itemForm.discount_end_at)
        : null;

      if (
        start &&
        end &&
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        end.getTime() <= start.getTime()
      ) {
        toast.error('Discount end time start time ke baad honi chahiye');
        return false;
      }
    }

    return true;
  }

  async function saveItem() {
    const validSizes = sizeOptions
      .map((size) => ({
        name: String(size.name || '').trim(),
        price: Number(size.price || 0),
      }))
      .filter((size) => size.name && size.price > 0);

    if (!validateItem(validSizes)) return;

    const invalidExtraPrice = itemExtraOptions.some(
      extra => Number(extra.price || 0) < 0,
    );
    if (invalidExtraPrice) {
      toast.error('Extra price 0 se kam nahi ho sakti');
      return;
    }

    const validItemExtras = itemExtraOptions
      .map(extra => ({
        name: String(extra.name || '').trim(),
        name_ar: String(extra.name_ar || '').trim(),
        price: Math.max(0, Number(extra.price || 0)),
        choice_group: String(extra.choice_group || '').trim(),
        required: Boolean(extra.required),
      }))
      .filter(extra => extra.name);

    const priceMedium = validSizes[0]?.price || 0;
    const priceLarge =
      validSizes.length > 1
        ? validSizes[validSizes.length - 1].price
        : priceMedium;

    const saveData = {
      name: itemForm.name.trim(),
      name_ar: itemForm.name_ar.trim(),
      description: itemForm.description.trim(),
      description_ar: itemForm.description_ar.trim(),
      category_id: itemForm.category_id,
      price_medium: priceMedium,
      price_large: priceLarge,
      sizes_json: JSON.stringify(validSizes),
      extras_json: itemForm.has_extras ? JSON.stringify(validItemExtras) : '[]',
      image_url: itemForm.image_url.trim(),
      has_extras: itemForm.has_extras,
      is_popular: itemForm.is_popular,
      discount_enabled: itemForm.discount_enabled,
      discount_type: itemForm.discount_type,
      discount_value: itemForm.discount_enabled
        ? Number(itemForm.discount_value || 0)
        : 0,
      discount_start_at: itemForm.discount_enabled
        ? itemForm.discount_start_at
        : '',
      discount_end_at: itemForm.discount_enabled
        ? itemForm.discount_end_at
        : '',
    };

    setSavingItem(true);

    try {
      if (editingItem) {
        await request(
          `/api/v1/entities/menu_items/${editingItem.id}`,
          'PUT',
          saveData,
        );
        setItemDialogOpen(false);
        await refreshAfterChange('Item aur discount updated');
      } else {
        await request('/api/v1/entities/menu_items', 'POST', {
          ...saveData,
          is_active: true,
          sort_order: menuItems.length + 1,
        });
        setItemDialogOpen(false);
        await refreshAfterChange('Item created');
      }
    } catch (error) {
      toast.error(errorText(error, 'Item save failed'));
    } finally {
      setSavingItem(false);
    }
  }

  async function toggleItemActive(item: MenuItem) {
    try {
      await request(
        `/api/v1/entities/menu_items/${item.id}`,
        'PUT',
        { is_active: !item.is_active },
      );
      await refreshAfterChange(
        `${item.name}: ${item.is_active ? 'Sold Out' : 'Available'}`,
      );
    } catch (error) {
      toast.error(errorText(error, 'Availability update failed'));
    }
  }

  async function togglePopular(item: MenuItem) {
    try {
      await request(
        `/api/v1/entities/menu_items/${item.id}`,
        'PUT',
        { is_popular: !item.is_popular },
      );
      await refreshAfterChange(
        `${item.name}: ${item.is_popular ? 'Popular OFF' : 'Popular ON'}`,
      );
    } catch (error) {
      toast.error(errorText(error, 'Popular update failed'));
    }
  }

  async function deleteItem(id: number) {
    if (!window.confirm('Delete this item?')) return;

    try {
      await request(`/api/v1/entities/menu_items/${id}`, 'DELETE');
      await refreshAfterChange('Item deleted');
    } catch (error) {
      toast.error(errorText(error, 'Item delete failed'));
    }
  }

  function openExtraDialog(extra?: Extra) {
    if (extra) {
      setEditingExtra(extra);
      setExtraForm({
        name: extra.name,
        price: Number(extra.price || 0),
      });
    } else {
      setEditingExtra(null);
      setExtraForm({
        name: '',
        price: 0,
      });
    }

    setExtraDialogOpen(true);
  }

  async function saveExtra() {
    if (!extraForm.name.trim()) {
      toast.error('Extra name enter karein');
      return;
    }

    try {
      if (editingExtra) {
        await request(
          `/api/v1/entities/extras/${editingExtra.id}`,
          'PUT',
          extraForm,
        );
        setExtraDialogOpen(false);
        await refreshAfterChange('Extra updated');
      } else {
        await request('/api/v1/entities/extras', 'POST', {
          ...extraForm,
          is_active: true,
        });
        setExtraDialogOpen(false);
        await refreshAfterChange('Extra created');
      }
    } catch (error) {
      toast.error(errorText(error, 'Extra save failed'));
    }
  }

  async function deleteExtra(id: number) {
    if (!window.confirm('Delete this extra?')) return;

    try {
      await request(`/api/v1/entities/extras/${id}`, 'DELETE');
      await refreshAfterChange('Extra deleted');
    } catch (error) {
      toast.error(errorText(error, 'Extra delete failed'));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/dashboard')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-white text-2xl font-bold">
              Menu Management
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Availability, Popular aur Item Discount yahin se control karein.
            </p>
          </div>
        </div>

        <Tabs defaultValue="items" className="space-y-4">
          <TabsList className="bg-gray-900 border-gray-700">
            <TabsTrigger value="items">Menu Items</TabsTrigger>
            <TabsTrigger value="popular">⭐ Popular</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="extras">Extras</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            <Button
              onClick={() => openItemDialog()}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>

            <div className="space-y-3">
              {menuItems.map((item) => {
                const sizes = getItemSizes(item);
                const discountText = itemDiscountText(item);
                const firstPrice = sizes[0]?.price || 0;
                const price = getItemPriceBreakdown(item, firstPrice);

                return (
                  <Card
                    key={item.id}
                    className={`bg-gray-900 border-gray-800 p-4 ${
                      !item.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-14 h-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-600" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold">
                          {item.name}
                        </h3>
                        <p className="text-gray-400 text-sm truncate">
                          {categories.find(
                            (category) =>
                              category.id === item.category_id,
                          )?.name || 'No Category'}
                          {' • '}
                          {sizes
                            .map(
                              (size) =>
                                `${size.name}: AED ${Number(
                                  size.price,
                                ).toFixed(0)}`,
                            )
                            .join(' / ')}
                        </p>

                        {discountText && (
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="rounded-full bg-green-600/15 border border-green-600/30 text-green-400 px-2 py-0.5">
                              {discountText}
                            </span>
                            {price.discountActive && (
                              <span className="text-gray-500">
                                AED {price.originalPrice.toFixed(2)}
                                {' → '}
                                <span className="text-green-400">
                                  AED {price.finalPrice.toFixed(2)}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => void togglePopular(item)}
                          title={
                            item.is_popular
                              ? 'Remove from Popular'
                              : 'Mark as Popular'
                          }
                        >
                          <Star
                            className={`w-5 h-5 ${
                              item.is_popular
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-600'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleItemActive(item)}
                          title={
                            item.is_active
                              ? 'Mark Sold Out'
                              : 'Mark Available'
                          }
                        >
                          {item.is_active ? (
                            <ToggleRight className="w-6 h-6 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-500" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => openItemDialog(item)}
                          className="text-gray-400 hover:text-white"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteItem(item.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="popular" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <p className="text-white font-semibold">
                ⭐ Customer Homepage Popular Items
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Card dabakar Popular ON/OFF karein.
              </p>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {menuItems
                .filter((item) => item.is_active)
                .map((item) => (
                  <Card
                    key={item.id}
                    onClick={() => void togglePopular(item)}
                    className={`cursor-pointer overflow-hidden border-2 ${
                      item.is_popular
                        ? 'bg-yellow-900/10 border-yellow-500/60'
                        : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gray-800 rounded-lg flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-gray-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">
                          {item.name}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {categories.find(
                            (category) =>
                              category.id === item.category_id,
                          )?.name || ''}
                        </p>
                      </div>
                      <Star
                        className={`w-6 h-6 ${
                          item.is_popular
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-600'
                        }`}
                      />
                    </div>
                  </Card>
                ))}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Button
              onClick={() => openCategoryDialog()}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((category, index) => {
              const Icon = categoryIcon(index);
              const count = menuItems.filter((item) => item.category_id === category.id).length;
              return (
              <Card
                key={category.id}
                className="bg-gradient-to-br from-gray-900 to-gray-950 border-gray-800 p-4 hover:border-green-700/60 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{category.name}</p>
                    <p className="text-gray-500 text-xs mt-1">{count} items • Sort {category.sort_order}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openCategoryDialog(category)}
                      className="text-gray-400 hover:text-white"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteCategory(category.id)
                      }
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </Card>
              );
            })}
            </div>
          </TabsContent>

          <TabsContent value="extras" className="space-y-4">
            <Button
              onClick={() => openExtraDialog()}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Extra
            </Button>

            {extras.map((extra) => (
              <Card
                key={extra.id}
                className="bg-gray-900 border-gray-800 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">
                      {extra.name}
                    </p>
                    <p className="text-gray-500 text-sm">
                      +AED {Number(extra.price || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => openExtraDialog(extra)}
                      className="text-gray-400 hover:text-white"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteExtra(extra.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Item' : 'Add Item'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Item Name *</Label>
              <Input
                value={itemForm.name}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            <div>
              <Label>Arabic Item Name</Label>
              <Input
                value={itemForm.name_ar}
                dir="rtl"
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    name_ar: event.target.value,
                  }))
                }
                placeholder="مثال: عصير مانجو"
                className="bg-gray-800 border-gray-700 mt-1 text-right"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label>Arabic Description</Label>
              <Textarea
                value={itemForm.description_ar}
                dir="rtl"
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    description_ar: event.target.value,
                  }))
                }
                placeholder="وصف عربي اختياري"
                className="bg-gray-800 border-gray-700 mt-1 text-right"
              />
            </div>

            <div>
              <Label>Item Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImageUpload(file);
                }}
              />

              <div className="mt-2 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="border-gray-700 text-gray-300"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? 'Processing...' : 'Upload Image'}
                </Button>

                {itemForm.image_url && (
                  <img
                    src={itemForm.image_url}
                    alt="Preview"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                )}
              </div>

              <Input
                value={itemForm.image_url}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    image_url: event.target.value,
                  }))
                }
                placeholder="Ya image URL paste karein"
                className="bg-gray-800 border-gray-700 mt-2 text-xs"
              />

              <p className="text-gray-500 text-xs mt-1">
                Cloudinary set na ho tab bhi image compress hokar save hogi.
              </p>
            </div>

            <div>
              <Label>Category</Label>
              <Select
                value={String(itemForm.category_id)}
                onValueChange={(value) =>
                  setItemForm((current) => ({
                    ...current,
                    category_id: Number(value),
                  }))
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  {categories.map((category) => (
                    <SelectItem
                      key={category.id}
                      value={String(category.id)}
                    >
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div>
                  <Label>Flavours / Choices</Label>
                  <p className="text-gray-500 text-xs">
                    Is item ke liye bottle ke flavours / choices aur unki price set karein.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setItemForm((current) => ({
                      ...current,
                      has_extras: !current.has_extras,
                    }))
                  }
                >
                  {itemForm.has_extras ? (
                    <ToggleRight className="w-7 h-7 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-gray-500" />
                  )}
                </button>
              </div>

              {itemForm.has_extras && (
                <div className="border-t border-gray-700 p-3 bg-gray-950/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Flavours / Choices for this item
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Customer ko isi item ke andar ye flavours / choices dikhengi.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addItemExtraOption}
                      className="border-green-700 text-green-400 hover:bg-green-950/40 shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Flavour
                    </Button>
                  </div>

                  {itemExtraOptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center">
                      <p className="text-gray-500 text-xs">
                        Abhi koi flavour nahi. “Add Flavour” dabakar flavour name aur price add karein.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {itemExtraOptions.map((extra, index) => (
                        <div
                          key={`item-extra-${index}`}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_90px_110px_42px] gap-2 items-center"
                        >
                          <Input
                            value={extra.name}
                            onChange={(event) =>
                              updateItemExtraOption(
                                index,
                                'name',
                                event.target.value,
                              )
                            }
                            placeholder="Flavour name"
                            className="bg-gray-800 border-gray-700"
                          />
                          <Input
                            value={extra.name_ar}
                            dir="rtl"
                            onChange={(event) =>
                              updateItemExtraOption(
                                index,
                                'name_ar',
                                event.target.value,
                              )
                            }
                            placeholder="Flavour Arabic"
                            className="bg-gray-800 border-gray-700 text-right"
                          />
                          <Input
                            value={extra.choice_group}
                            onChange={(event) =>
                              updateItemExtraOption(
                                index,
                                'choice_group',
                                event.target.value,
                              )
                            }
                            placeholder="Choice group"
                            className="bg-gray-800 border-gray-700"
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={extra.price === 0 ? '' : extra.price}
                            onChange={(event) =>
                              updateItemExtraOption(
                                index,
                                'price',
                                Number(event.target.value || 0),
                              )
                            }
                            placeholder="AED"
                            className="bg-gray-800 border-gray-700"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateItemExtraOption(
                                index,
                                'required',
                                !extra.required,
                              )
                            }
                            className={`h-10 rounded-lg border px-2 text-xs font-semibold ${extra.required ? 'border-green-500 bg-green-500/10 text-green-300' : 'border-gray-700 text-gray-500'}`}
                          >
                            {extra.required ? 'Required' : 'Optional'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItemExtraOption(index)}
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-950/30"
                            aria-label="Remove extra"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-gray-600 text-[11px]">
                    Example: Mango → Ice Cream AED 2, Avocado AED 3. Dusre item ke extras alag ho sakte hain.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-700">
              <div>
                <Label>⭐ Popular Item</Label>
                <p className="text-gray-500 text-xs">
                  Customer homepage par show hoga.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setItemForm((current) => ({
                    ...current,
                    is_popular: !current.is_popular,
                  }))
                }
              >
                {itemForm.is_popular ? (
                  <ToggleRight className="w-7 h-7 text-yellow-500" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-gray-500" />
                )}
              </button>
            </div>

            <div className="rounded-xl border-2 border-green-500 bg-green-950/30 p-4 space-y-4 shadow-lg shadow-green-950/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2 text-green-300">
                    <Tag className="w-4 h-4" />
                    ITEM DISCOUNT — ON / OFF
                  </Label>
                  <p className="text-green-300/60 text-xs mt-1">
                    Sirf food price par lagega. Extras aur fees discount nahi hongi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setItemForm((current) => ({
                      ...current,
                      discount_enabled:
                        !current.discount_enabled,
                    }))
                  }
                >
                  {itemForm.discount_enabled ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-500" />
                  )}
                </button>
              </div>

              {itemForm.discount_enabled && (
                <>
                  <div>
                    <Label>Discount Type</Label>
                    <Select
                      value={itemForm.discount_type}
                      onValueChange={(value: DiscountType) =>
                        setItemForm((current) => ({
                          ...current,
                          discount_type: value,
                        }))
                      }
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="percentage">
                          Percentage %
                        </SelectItem>
                        <SelectItem value="fixed">
                          Fixed AED
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>
                      {itemForm.discount_type === 'fixed'
                        ? 'Discount AED'
                        : 'Discount Percentage'}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max={
                        itemForm.discount_type === 'percentage'
                          ? 100
                          : undefined
                      }
                      step="0.01"
                      value={itemForm.discount_value || ''}
                      onChange={(event) =>
                        setItemForm((current) => ({
                          ...current,
                          discount_value: Number(
                            event.target.value,
                          ),
                        }))
                      }
                      placeholder={
                        itemForm.discount_type === 'fixed'
                          ? 'Example: 3'
                          : 'Example: 10'
                      }
                      className="bg-gray-800 border-gray-700 mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Start (optional)</Label>
                      <Input
                        type="datetime-local"
                        value={itemForm.discount_start_at}
                        onChange={(event) =>
                          setItemForm((current) => ({
                            ...current,
                            discount_start_at:
                              event.target.value,
                          }))
                        }
                        className="bg-gray-800 border-gray-700 mt-1"
                      />
                    </div>
                    <div>
                      <Label>End (optional)</Label>
                      <Input
                        type="datetime-local"
                        value={itemForm.discount_end_at}
                        onChange={(event) =>
                          setItemForm((current) => ({
                            ...current,
                            discount_end_at:
                              event.target.value,
                          }))
                        }
                        className="bg-gray-800 border-gray-700 mt-1"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-900 border border-gray-700 p-3 text-xs">
                    <p className="text-gray-400">
                      Customer ko old price cut, new price aur saving show hogi.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Sizes & Prices *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={addSizeOption}
                  className="text-green-400"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Size
                </Button>
              </div>

              <div className="space-y-2">
                {sizeOptions.map((size, index) => (
                  <div
                    key={`${index}-${size.name}`}
                    className="flex items-center gap-2"
                  >
                    <Input
                      value={size.name}
                      onChange={(event) =>
                        updateSizeOption(
                          index,
                          'name',
                          event.target.value,
                        )
                      }
                      placeholder="Small / Medium / Large"
                      className="bg-gray-800 border-gray-700 flex-1"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={size.price || ''}
                      onChange={(event) =>
                        updateSizeOption(
                          index,
                          'price',
                          Number(event.target.value),
                        )
                      }
                      placeholder="AED"
                      className="bg-gray-800 border-gray-700 w-24"
                    />
                    <button
                      type="button"
                      onClick={() => removeSizeOption(index)}
                      className="text-red-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>


            <Button
              type="button"
              onClick={() => void saveItem()}
              disabled={savingItem}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {savingItem
                ? 'Saving...'
                : editingItem
                  ? 'Update Item'
                  : 'Add Item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      >
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            <div>
              <Label>Arabic Category Name</Label>
              <Input
                value={categoryForm.name_ar}
                dir="rtl"
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name_ar: event.target.value,
                  }))
                }
                placeholder="مثال: العصائر"
                className="bg-gray-800 border-gray-700 mt-1 text-right"
              />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={categoryForm.sort_order}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    sort_order: Number(event.target.value),
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            <Button
              type="button"
              onClick={() => void saveCategory()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Save Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {editingExtra ? 'Edit Extra' : 'Add Extra'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={extraForm.name}
                onChange={(event) =>
                  setExtraForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            <div>
              <Label>Price AED</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={extraForm.price || ''}
                onChange={(event) =>
                  setExtraForm((current) => ({
                    ...current,
                    price: Number(event.target.value),
                  }))
                }
                className="bg-gray-800 border-gray-700 mt-1"
              />
            </div>
            <Button
              type="button"
              onClick={() => void saveExtra()}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Save Extra
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
