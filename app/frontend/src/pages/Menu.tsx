import { useEffect, useState, useRef } from 'react';
import { Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import CustomerLayout from '@/components/CustomerLayout';
import { Category, MenuItem, Extra, RestaurantSettings, getItemSizes } from '@/lib/api';
import { getItemPriceBreakdown } from '@/lib/discounts';
import { addToCart } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';

const MENU_CACHE_KEY = 'fai_fai_menu_direct_a1';
const MENU_CACHE_TTL = 120000; // 2 minutes

interface MenuCache {
  categories: Category[];
  menuItems: MenuItem[];
  extras: Extra[];
  timestamp: number;
}

function getMenuCache(): MenuCache | null {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MenuCache;
  } catch { return null; }
}

function setMenuCache(data: Omit<MenuCache, 'timestamp'>) {
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch { /* storage full */ }
}

const API_BASE = 'https://vita-napoli-backend-usman.onrender.com';

const FAI_FAI_IMAGE_MAP: Record<string, string> = {
  "watermelon": "watermelon.webp",
  "watermelon with cheese": "watermelon.webp",
  "fai fai special": "fai-fai-special.webp",
  "shining": "shining.webp",
  "cocktail": "cocktail.webp",
  "orange": "orange.webp",
  "orange passion fruit": "orange-passion-fruit.webp",
  "strawberry smoothie": "strawberry-smoothie.webp",
  "fadeetk": "fadeetk.webp",
  "tamer hindi": "tamer-hindi.webp",
  "grapefruit": "grapefruit.webp",
  "qamar al deen": "qamar-al-deen.webp",
  "avocado": "avocado.webp",
  "melon": "melon.webp",
  "hibiscus": "hibiscus.webp",
  "pomegranate": "pomegranate.webp",
  "beetroot": "beetroot.webp",
  "lemon mint": "lemon-mint.webp",
  "einstein": "einstein.webp",
  "lotus": "lotus.webp",
  "nutella": "nutella.webp",
  "cerelac": "cerelac.webp",
  "strawberry milkshake": "strawberry-milkshake.webp",
  "chocolate milkshake": "chocolate-milkshake.webp",
  "oreo milkshake": "oreo-milkshake.webp",
  "passion fruit mojito": "passion-fruit-mojito.webp",
  "lemon mojito": "lemon-mojito.webp",
  "green apple mojito": "green-apple-mojito.webp",
  "blue mojito": "blue-mojito.webp",
  "strawberry mojito": "strawberry-mojito.webp",
  "acai": "acai.webp",
  "smoothie acai": "smoothie-acai.webp",
  "juice box": "juice-box.webp",
  "hambana box 20 pcs": "juice-box.webp",
  "mini juice box": "mini-juice-box.webp",
  "hot chocolate": "hot-chocolate.webp",
  "shorkhama": "shorkhama.webp",
  "sahlab": "sahlab.webp",
  "mahallabiyah": "mahallabiyah.webp",
  "passion fruit ice cream": "passion-fruit-ice-cream.webp",
  "vanilla ice cream": "vanilla-ice-cream.webp",
  "coconut ice cream": "coconut-ice-cream.webp",
  "mango ice cream": "mango-ice-cream.webp",
  "oreo ice cream": "oreo-ice-cream.webp",
  "caramel ice cream": "caramel-ice-cream.webp",
  "lemon mint ice cream": "lemon-mint-ice-cream.webp",
  "mix berry ice cream": "mix-berry-ice-cream.webp",
  "strawberry cheesecake ice cream": "strawberry-cheesecake-ice-cream.webp"
};

function normalItemName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMenuItemImage(item: MenuItem): string {
  const localFile = FAI_FAI_IMAGE_MAP[normalItemName(item.name)];
  if (localFile) return `/menu/fai-fai-v1/${localFile}`;

  const saved = String(item.image_url || '').trim();
  if (!saved) return '/icon-customer-192.png';
  if (saved.startsWith('http://') || saved.startsWith('https://') || saved.startsWith('/')) {
    return saved;
  }
  return `/${saved.replace(/^\/+/, '')}`;
}

async function fetchEntityList<T>(
  path: string,
  options: { query?: Record<string, unknown>; sort?: string; limit?: number } = {},
): Promise<T[]> {
  const params = new URLSearchParams();
  if (options.query) params.set('query', JSON.stringify(options.query));
  if (options.sort) params.set('sort', options.sort);
  params.set('limit', String(options.limit ?? 200));

  const response = await fetch(`${API_BASE}${path}?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}

export default function Menu() {
  const { t } = useTranslation();
  const cached = getMenuCache();
  const [categories, setCategories] = useState<Category[]>(cached?.categories || []);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(cached?.menuItems || []);
  const [extras, setExtras] = useState<Extra[]>(cached?.extras || []);
  const [activeCategory, setActiveCategory] = useState<number | null>(cached?.categories?.[0]?.id || null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // If cache is fresh, defer the API refresh
    if (cached && Date.now() - cached.timestamp < MENU_CACHE_TTL) {
      const timer = setTimeout(loadData, 2000);
      return () => clearTimeout(timer);
    } else {
      loadData();
    }
  }, []);

  async function loadData() {
    try {
      const [cats, items, ext, settingsRows] = await Promise.all([
        fetchEntityList<Category>('/api/v1/entities/categories', {
          query: { is_active: true },
          sort: 'sort_order',
          limit: 50,
        }),
        fetchEntityList<MenuItem>('/api/v1/entities/menu_items', {
          query: { is_active: true },
          sort: 'sort_order',
          limit: 500,
        }),
        fetchEntityList<Extra>('/api/v1/entities/extras', {
          query: { is_active: true },
          limit: 100,
        }),
        fetchEntityList<RestaurantSettings>('/api/v1/entities/restaurant_settings', {
          limit: 1,
        }),
      ]);

      setSettings(settingsRows[0] || null);
      setCategories(cats);
      setMenuItems(items);
      setExtras(ext);
      if (cats.length > 0) {
        setActiveCategory(current =>
          current && cats.some(cat => cat.id === current) ? current : cats[0].id
        );
      }
      setMenuCache({ categories: cats, menuItems: items, extras: ext });
    } catch (error) {
      console.error('Direct menu load failed:', error);
      toast.error('Menu load nahi hua. Internet check karke Refresh karein.');
    }
  }

  const filteredItems = menuItems.filter(item => item.category_id === activeCategory);

  function openItemDialog(item: MenuItem) {
    setSelectedItem(item);
    const sizes = getItemSizes(item);
    setSelectedSize(sizes[0]?.name || '');
    setSelectedExtras([]);
    setQuantity(1);
    setDialogOpen(true);
  }

  function toggleExtra(extra: Extra) {
    setSelectedExtras(prev =>
      prev.find(e => e.id === extra.id)
        ? prev.filter(e => e.id !== extra.id)
        : [...prev, extra]
    );
  }

  function calculatePrice(): number {
    if (!selectedItem) return 0;
    const sizes = getItemSizes(selectedItem);
    const sizeObj = sizes.find(s => s.name === selectedSize) || sizes[0];
    const base = sizeObj?.price || 0;
    const discountedBase = getItemPriceBreakdown(selectedItem, base).finalPrice;
    const extrasTotal = selectedExtras.reduce((sum, e) => sum + e.price, 0);
    return (discountedBase + extrasTotal) * quantity;
  }

  function handleAddToCart() {
    if (!selectedItem) return;
    addToCart(selectedItem, selectedSize, selectedExtras, quantity);
    setDialogOpen(false);
    toast.success(t('menu.added'));
    window.dispatchEvent(new Event('cart-updated'));
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen">
        <div className="sr-only">MENU DIRECT A1</div>
        {settings?.offer_text && (
          <div className="max-w-4xl mx-auto px-4 pt-4">
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-center text-sm font-medium text-orange-200">
              {settings.offer_text}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="sticky top-[60px] z-40 bg-black border-b border-gray-800">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 px-4 py-3 min-w-max">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    activeCategory === cat.id
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="px-4 py-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map(item => {
              const sizes = getItemSizes(item);
              return (
                <Card
                  key={item.id}
                  className="bg-gray-900 border-gray-800 overflow-hidden cursor-pointer hover:border-red-600/50 transition-all"
                  onClick={() => openItemDialog(item)}
                >
                  <div className="flex gap-4 p-4">
                    {getMenuItemImage(item) && (
                      <img
                        src={getMenuItemImage(item)}
                        alt={item.name}
                        className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = '/icon-customer-192.png';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold text-lg truncate">{item.name}</h3>
                      {item.description && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">{item.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {sizes.map((size, idx) => {
                          const price = getItemPriceBreakdown(item, size.price);
                          return (
                            <Badge key={idx} variant="secondary" className="bg-gray-800 text-gray-200">
                              {sizes.length > 1 ? `${size.name}: ` : ''}
                              {price.discountActive ? (
                                <>
                                  <span className="line-through text-gray-500 mr-1">AED {price.originalPrice.toFixed(2)}</span>
                                  <span className="text-green-400">AED {price.finalPrice.toFixed(2)}</span>
                                </>
                              ) : (
                                <>AED {price.finalPrice.toFixed(2)}</>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredItems.length === 0 && categories.length > 0 && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">{t('menu.no_items')}</p>
            </div>
          )}

          {categories.length === 0 && (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm mt-3">{t('common.loading')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Item Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedItem?.name}</DialogTitle>
          </DialogHeader>

          {selectedItem && (() => {
            const sizes = getItemSizes(selectedItem);
            return (
              <div className="space-y-6">
                {getMenuItemImage(selectedItem) && (
                  <img
                    src={getMenuItemImage(selectedItem)}
                    alt={selectedItem.name}
                    className="w-full h-48 object-cover rounded-xl"
                    onError={(event) => {
                      event.currentTarget.src = '/icon-customer-192.png';
                    }}
                  />
                )}

                {selectedItem.description && (
                  <p className="text-gray-400">{selectedItem.description}</p>
                )}

                {(() => {
                  const firstSize = sizes[0];
                  if (!firstSize) return null;
                  const price = getItemPriceBreakdown(selectedItem, firstSize.price);
                  if (!price.discountActive) return null;
                  return (
                    <div className="rounded-xl bg-green-950/30 border border-green-700/40 p-3">
                      <p className="text-green-400 font-semibold text-sm">{price.discountLabel}</p>
                      <p className="text-green-300/70 text-xs mt-1">Item discount applies automatically. Extras are not discounted.</p>
                    </div>
                  );
                })()}

                {/* Size Selection */}
                {sizes.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">
                      {t('menu.select_size')}
                    </h4>
                    <div className={`grid gap-3 ${sizes.length === 1 ? 'grid-cols-1' : sizes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {sizes.map((size, idx) => {
                        const price = getItemPriceBreakdown(selectedItem, size.price);
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedSize(size.name)}
                            className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                              selectedSize === size.name
                                ? 'border-red-500 bg-red-600/10'
                                : 'border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            <div className="font-medium">{size.name}</div>
                            {price.discountActive ? (
                              <div className="mt-1">
                                <div className="text-gray-500 text-xs line-through">AED {price.originalPrice.toFixed(2)}</div>
                                <div className="text-green-400 font-bold">AED {price.finalPrice.toFixed(2)}</div>
                                <div className="text-green-500 text-[10px]">Save AED {price.saving.toFixed(2)}</div>
                              </div>
                            ) : (
                              <div className="text-red-400 font-bold">AED {price.finalPrice.toFixed(2)}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Extras */}
                {extras.length > 0 && selectedItem.has_extras !== false && (
                  <div>
                    <h4 className="font-semibold mb-3">{t('menu.extras')}</h4>
                    <div className="space-y-2">
                      {extras.map(extra => (
                        <label
                          key={extra.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-700 hover:border-gray-500 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={selectedExtras.some(e => e.id === extra.id)}
                              onCheckedChange={() => toggleExtra(extra)}
                            />
                            <span>{extra.name}</span>
                          </div>
                          <span className="text-red-400 font-medium">+AED {extra.price}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity */}
                <div>
                  <h4 className="font-semibold mb-3">Quantity</h4>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-bold w-8 text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <Button
                  onClick={handleAddToCart}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer"
                >
                  {t('menu.add_to_cart')} — {t('common.aed')} {calculatePrice().toFixed(2)}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
