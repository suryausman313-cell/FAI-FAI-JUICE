import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  ImageOff,
  PackageOpen,
  RefreshCw,
  Search,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAPIBaseURL } from '@/lib/config';

interface KitchenCategory {
  id: number;
  name: string;
  sort_order?: number | null;
  is_active?: boolean;
}

interface KitchenMenuItem {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
  price_medium?: number;
  price_large?: number;
  sizes_json?: unknown;
  sort_order?: number | null;
}

interface KitchenMenuResponse {
  success: boolean;
  categories: KitchenCategory[];
  items: KitchenMenuItem[];
  total: number;
  available: number;
  sold_out: number;
}

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

function getKitchenPin(): string {
  return localStorage.getItem('kitchen_pin') || '';
}

function errorMessage(error: unknown): string {
  const value = error as any;
  return (
    value?.response?.data?.detail ||
    value?.response?.data?.message ||
    value?.message ||
    'Menu update failed'
  );
}

function parsePrices(item: KitchenMenuItem): number[] {
  const prices: number[] = [];

  const add = (value: unknown) => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0 && !prices.includes(number)) {
      prices.push(number);
    }
  };

  add(item.price_medium);
  add(item.price_large);

  let sizes: unknown = item.sizes_json;
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = [];
    }
  }

  if (Array.isArray(sizes)) {
    sizes.forEach((size: any) => {
      add(size?.price);
      add(size?.amount);
      add(size?.value);
    });
  } else if (sizes && typeof sizes === 'object') {
    Object.values(sizes as Record<string, unknown>).forEach((value: any) => {
      if (value && typeof value === 'object') {
        add(value.price);
        add(value.amount);
      } else {
        add(value);
      }
    });
  }

  return prices.sort((a, b) => a - b);
}

function priceText(item: KitchenMenuItem): string {
  const prices = parsePrices(item);
  if (prices.length === 0) return 'Price not set';
  return prices.map((price) => `AED ${price.toFixed(0)}`).join(' / ');
}

export default function KitchenMenuPanel({ embedded = false }: { embedded?: boolean }) {
  const [categories, setCategories] = useState<KitchenCategory[]>([]);
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [authError, setAuthError] = useState(false);

  const loadMenu = useCallback(async (manual = false) => {
    const pin = getKitchenPin();

    if (!pin) {
      setAuthError(true);
      setLoading(false);
      return;
    }

    if (manual) setRefreshing(true);

    try {
      const response = await axios.get<KitchenMenuResponse>(
        `${apiBase()}/api/v1/kitchen/menu`,
        {
          headers: {
            'X-Kitchen-Pin': pin,
            ...(Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0) > 0
              ? { 'X-Branch-Id': String(Number(localStorage.getItem('fai_fai_kitchen_branch_id'))) }
              : {}),
          },
          timeout: 20000,
        },
      );

      setCategories(response.data?.categories || []);
      setItems(response.data?.items || []);
      setAuthError(false);
    } catch (error) {
      if ((error as any)?.response?.status === 401) {
        setAuthError(true);
      }
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const categoryName = useMemo(() => {
    const values = new Map<number, string>();
    categories.forEach((category) => {
      values.set(category.id, category.name);
    });
    return values;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      const category = categoryName.get(item.category_id) || '';
      return (
        item.name.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query)
      );
    });
  }, [categoryName, items, search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<number, KitchenMenuItem[]>();

    filteredItems.forEach((item) => {
      const current = groups.get(item.category_id) || [];
      current.push(item);
      groups.set(item.category_id, current);
    });

    return Array.from(groups.entries()).sort(([firstId], [secondId]) => {
      const firstCategory = categories.find((category) => category.id === firstId);
      const secondCategory = categories.find((category) => category.id === secondId);

      const firstOrder = firstCategory?.sort_order ?? 999999;
      const secondOrder = secondCategory?.sort_order ?? 999999;

      if (firstOrder !== secondOrder) return firstOrder - secondOrder;

      return (firstCategory?.name || '').localeCompare(secondCategory?.name || '');
    });
  }, [categories, filteredItems]);

  const availableCount = items.filter((item) => item.is_active).length;
  const soldOutCount = items.length - availableCount;

  async function toggleAvailability(item: KitchenMenuItem) {
    const pin = getKitchenPin();

    if (!pin) {
      setAuthError(true);
      toast.error('Open Live Orders and login with the Kitchen PIN first.');
      return;
    }

    const nextValue = !item.is_active;
    setSavingId(item.id);

    try {
      const response = await axios.post(
        `${apiBase()}/api/v1/kitchen/menu/${item.id}/availability`,
        { is_active: nextValue },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Kitchen-Pin': pin,
            ...(Number(localStorage.getItem('fai_fai_kitchen_branch_id') || 0) > 0
              ? { 'X-Branch-Id': String(Number(localStorage.getItem('fai_fai_kitchen_branch_id'))) }
              : {}),
          },
          timeout: 20000,
        },
      );

      const updated = response.data?.item as KitchenMenuItem | undefined;

      setItems((current) =>
        current.map((menuItem) =>
          menuItem.id === item.id
            ? {
                ...menuItem,
                ...(updated || {}),
                is_active: nextValue,
              }
            : menuItem,
        ),
      );

      toast.success(
        `${item.name}: ${nextValue ? 'Available' : 'Sold Out'}`,
      );
    } catch (error) {
      if ((error as any)?.response?.status === 401) {
        setAuthError(true);
      }
      toast.error(errorMessage(error));
    } finally {
      setSavingId(null);
    }
  }

  if (authError) {
    return (
      <div className="min-h-[70vh] bg-gray-950 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md bg-gray-900 border-gray-800 p-6 text-center">
          <UtensilsCrossed className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <h2 className="text-white font-bold text-lg">Kitchen Login Required</h2>
          <p className="text-gray-400 text-sm mt-2">
            Open the <strong>Live Orders</strong> tab and login with the Kitchen
            PIN first. Then open the Menu tab again.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? 'bg-gray-950 py-2' : 'min-h-screen bg-gray-950 px-3 py-4 md:px-6'}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-yellow-400" />
              Kitchen Menu
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Mark an unavailable item as Sold Out. Mark it Available when it is back.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadMenu(true)}
            disabled={refreshing}
            className="border-gray-700 text-gray-300"
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Card className="bg-gray-900 border-gray-800 p-3 text-center">
            <p className="text-white font-bold text-lg">{items.length}</p>
            <p className="text-gray-500 text-[11px]">Total</p>
          </Card>
          <Card className="bg-green-600/10 border-green-600/30 p-3 text-center">
            <p className="text-green-400 font-bold text-lg">{availableCount}</p>
            <p className="text-green-400/70 text-[11px]">Available</p>
          </Card>
          <Card className="bg-red-600/10 border-red-600/30 p-3 text-center">
            <p className="text-red-400 font-bold text-lg">{soldOutCount}</p>
            <p className="text-red-400/70 text-[11px]">Sold Out</p>
          </Card>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item or category..."
            className="bg-gray-900 border-gray-800 text-white pl-10 h-10"
          />
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-3" />
            Loading menu...
          </div>
        ) : groupedItems.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <PackageOpen className="w-12 h-12 mx-auto mb-3 text-gray-700" />
            No menu items found
          </div>
        ) : (
          <div className="space-y-6">
            {groupedItems.map(([categoryId, categoryItems]) => (
              <section key={categoryId}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-gray-200 font-semibold">
                    {categoryName.get(categoryId) || `Category ${categoryId}`}
                  </h2>
                  <Badge className="bg-gray-800 text-gray-400 border-gray-700">
                    {categoryItems.length} items
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categoryItems.map((item) => {
                    const saving = savingId === item.id;

                    return (
                      <Card
                        key={item.id}
                        className={`bg-gray-900 p-3 transition-colors ${
                          item.is_active
                            ? 'border-gray-800'
                            : 'border-red-600/40 bg-red-950/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-16 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className={`w-full h-full object-cover ${
                                  item.is_active ? '' : 'grayscale opacity-60'
                                }`}
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageOff className="w-5 h-5 text-gray-600" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold truncate">
                              {item.name}
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                              {priceText(item)}
                            </p>
                            <div className="mt-2">
                              {item.is_active ? (
                                <Badge className="bg-green-600/15 text-green-400 border-green-600/30">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Available
                                </Badge>
                              ) : (
                                <Badge className="bg-red-600/15 text-red-400 border-red-600/30">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Sold Out
                                </Badge>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void toggleAvailability(item)}
                            disabled={saving}
                            aria-label={`Mark ${item.name} ${
                              item.is_active ? 'sold out' : 'available'
                            }`}
                            className={`relative w-14 h-8 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${
                              item.is_active ? 'bg-green-600' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                                item.is_active
                                  ? 'translate-x-7'
                                  : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
