import { useEffect, useState, useRef } from 'react';
import { Plus, Minus, Coffee, GlassWater, IceCream, CakeSlice, Salad, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import CustomerLayout from '@/components/CustomerLayout';
import { client, Category, MenuItem, Extra, RestaurantSettings, getItemSizes, getItemExtras, localizedMenuText, localizedMenuDescription } from '@/lib/api';
import { getItemPriceBreakdown } from '@/lib/discounts';
import { addToCart } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';

const MENU_CACHE_KEY = 'vita_menu_cache';
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


function categoryIcon(index: number) {
  const icons = [Coffee, GlassWater, IceCream, CakeSlice, Salad, Sparkles];
  return icons[index % icons.length];
}

function setMenuCache(data: Omit<MenuCache, 'timestamp'>) {
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch { /* storage full */ }
}

export default function Menu() {
  const { t, language } = useTranslation();
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
  const choiceGroups = selectedItem ? (() => {
    const all = getItemExtras(selectedItem, extras);
    const groups = new Map<string, Extra[]>();
    all.forEach(extra => {
      const key = String(extra.choice_group || '').trim();
      if (!key) return;
      const list = groups.get(key) || [];
      list.push(extra);
      groups.set(key, list);
    });
    return Array.from(groups.entries());
  })() : [];
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
      const [catRes, itemRes, extrasRes, settingsRes] = await Promise.all([
        client.entities.categories.query({ query: { is_active: true }, sort: 'sort_order', limit: 50 }),
        client.entities.menu_items.query({ query: { is_active: true }, sort: 'sort_order', limit: 200 }),
        client.entities.extras.query({ query: { is_active: true }, limit: 50 }),
        client.entities.restaurant_settings.query({ query: {}, limit: 1 }),
      ]);
      
      const cats = catRes?.data?.items || [];
      const items = itemRes?.data?.items || [];
      const ext = extrasRes?.data?.items || [];
      const settingsData = settingsRes?.data?.items?.[0] || null;

      setSettings(settingsData);
      setCategories(cats);
      setMenuItems(items);
      setExtras(ext);
      if (cats.length > 0 && !activeCategory) setActiveCategory(cats[0].id);

      // Update cache
      setMenuCache({ categories: cats, menuItems: items, extras: ext });
    } catch (e) {
      console.error('Failed to load menu:', e);
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
    const group = String(extra.choice_group || '').trim();
    setSelectedExtras(prev => {
      if (group) {
        const withoutGroup = prev.filter(e => String(e.choice_group || '').trim() !== group);
        return [...withoutGroup, extra];
      }
      return prev.find(e => e.id === extra.id)
        ? prev.filter(e => e.id !== extra.id)
        : [...prev, extra];
    });
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
    const missingRequired = choiceGroups.find(([, options]) => options.some(option => option.required) && !selectedExtras.some(extra => String(extra.choice_group || '').trim() === String(options[0]?.choice_group || '').trim()));
    if (missingRequired) {
      window.alert(`Please select ${missingRequired[0]}.`);
      return;
    }
    addToCart(selectedItem, selectedSize, selectedExtras, quantity);
    setDialogOpen(false);
    window.dispatchEvent(new Event('cart-updated'));
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen">
        {settings?.offer_text && (
          <div className="max-w-4xl mx-auto px-4 pt-4">
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-center text-sm font-medium text-orange-200">
              {settings.offer_text}
            </div>
          </div>
        )}

        {/* Modern Category Navigation */}
        <div className="sticky top-[60px] z-40 border-b border-gray-800/80 bg-black/90 backdrop-blur-2xl">
          <div className="max-w-4xl mx-auto px-3 py-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5 snap-x snap-mandatory">
              {categories.map((cat, index) => {
                const Icon = categoryIcon(index);
                const count = menuItems.filter(item => item.category_id === cat.id).length;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    aria-pressed={active}
                    className={`group relative min-w-[88px] snap-start flex-shrink-0 rounded-2xl border px-3 py-2.5 text-center transition-all duration-200 cursor-pointer ${
                      active
                        ? 'border-green-400/80 bg-gradient-to-b from-green-400 to-green-500 text-black shadow-lg shadow-green-500/20 scale-[1.02]'
                        : 'border-gray-800 bg-gray-900/90 text-gray-300 hover:border-gray-600 hover:bg-gray-800/90 active:scale-95'
                    }`}
                  >
                    <span className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl ${
                      active ? 'bg-black/10' : 'bg-gray-800 group-hover:bg-gray-700'
                    }`}>
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span className="block max-w-[78px] truncate text-[11px] font-bold leading-4">
                      {localizedMenuText(cat, language)}
                    </span>
                    <span className={`mt-1 inline-flex min-w-[18px] justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      active ? 'bg-black/10 text-black/70' : 'bg-gray-800 text-gray-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
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
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={localizedMenuText(item, language)}
                        className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold text-lg truncate">{localizedMenuText(item, language)}</h3>
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
            const availableExtras = getItemExtras(selectedItem, extras);
            return (
              <div className="space-y-6">
                {selectedItem.image_url && (
                  <img
                    src={selectedItem.image_url}
                    alt={localizedMenuText(selectedItem, language)}
                    className="w-full h-48 object-cover rounded-xl"
                  />
                )}

                {selectedItem.description && (
                  <p className="text-gray-400">{localizedMenuDescription(selectedItem, language)}</p>
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

                {/* Talabat-style item choices */}
                {availableExtras.length > 0 && selectedItem.has_extras !== false && (
                  <div className="space-y-5">
                    {choiceGroups.map(([groupName, options]) => {
                      const selected = selectedExtras.find(extra => String(extra.choice_group || '').trim() === groupName);
                      const required = options.some(option => option.required);
                      return (
                        <div key={groupName}>
                          <div className="flex items-end justify-between mb-3">
                            <div>
                              <h4 className="font-bold text-lg">{groupName}</h4>
                              <p className="text-gray-500 text-xs mt-1">Choose {required ? '1' : 'any'}</p>
                            </div>
                            {required && <span className="text-[11px] px-2 py-1 rounded-full bg-gray-800 text-gray-400">Required</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {options.map(option => {
                              const active = selected?.id === option.id;
                              return (
                                <button key={option.id} type="button" onClick={() => toggleExtra(option)} className={`relative overflow-hidden rounded-2xl border-2 text-left transition-all ${active ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/10' : 'border-gray-800 bg-gray-950 hover:border-gray-600'}`}>
                                  <div className="h-24 bg-gray-900 flex items-center justify-center">
                                    {selectedItem.image_url ? <img src={selectedItem.image_url} alt="" className="w-full h-full object-cover opacity-90" /> : <GlassWater className="w-8 h-8 text-gray-600" />}
                                  </div>
                                  <div className="p-3">
                                    <div className="font-semibold text-sm">{localizedMenuText(option, language)}</div>
                                    {Number(option.price || 0) > 0 && <div className="text-gray-400 text-xs mt-1">+AED {Number(option.price).toFixed(2)}</div>}
                                  </div>
                                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center ${active ? 'bg-green-500 border-green-500 text-black' : 'bg-black/30 border-white/40'}`}>{active && <Check className="w-4 h-4" />}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {availableExtras.filter(extra => !String(extra.choice_group || '').trim()).length > 0 && (
                      <div>
                        <h4 className="font-bold text-lg mb-3">Extras</h4>
                        <div className="space-y-2">
                          {availableExtras.filter(extra => !String(extra.choice_group || '').trim()).map(extra => (
                            <label key={extra.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-800 bg-gray-950 cursor-pointer">
                              <div className="flex items-center gap-3"><Checkbox checked={selectedExtras.some(e => e.id === extra.id)} onCheckedChange={() => toggleExtra(extra)} /><span>{localizedMenuText(extra, language)}</span></div>
                              <span className="text-green-400 font-medium">+AED {Number(extra.price || 0).toFixed(2)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
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
