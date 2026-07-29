import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

import CustomerLayout from '@/components/CustomerLayout';
import {
  client,
  Category,
  MenuItem,
  Extra,
  getItemSizes,
} from '@/lib/api';
import { addToCart } from '@/lib/cart-store';
import { Language, useTranslation } from '@/lib/i18n';

const MENU_CACHE_KEY = 'vita_menu_cache';
const MENU_CACHE_TTL = 120000;

interface MenuCache {
  categories: Category[];
  menuItems: MenuItem[];
  extras: Extra[];
  timestamp: number;
}

function getMenuCache(): MenuCache | null {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as MenuCache;
  } catch {
    return null;
  }
}

function setMenuCache(data: Omit<MenuCache, 'timestamp'>) {
  try {
    localStorage.setItem(
      MENU_CACHE_KEY,
      JSON.stringify({
        ...data,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore localStorage errors.
  }
}

const PIZZA_IMAGES: Record<string, string> = {
  Margherita:
    'https://mgx-backend-cdn.metadl.com/generate/images/1435502/2026-07-16/sti5jqycaiya/pizza-margherita.png',
  Pepperoni:
    'https://mgx-backend-cdn.metadl.com/generate/images/1435502/2026-07-16/sti5j7qcaiza/pizza-pepperoni.png',
  Truffle:
    'https://mgx-backend-cdn.metadl.com/generate/images/1435502/2026-07-16/sti5kmicai2q/pizza-truffle.png',
  'Chicken Calzone':
    'https://mgx-backend-cdn.metadl.com/generate/images/1435502/2026-07-16/sti5kzacai2a/calzone-chicken.png',
};

function translatedField(
  item: Record<string, unknown>,
  field: 'name' | 'description',
  language: Language
): string {
  const languageField =
    language === 'ar'
      ? `${field}_ar`
      : language === 'ur'
        ? `${field}_ur`
        : `${field}_en`;

  const translatedValue = item[languageField];
  const defaultValue = item[field];

  if (
    typeof translatedValue === 'string' &&
    translatedValue.trim()
  ) {
    return translatedValue.trim();
  }

  return typeof defaultValue === 'string'
    ? defaultValue
    : '';
}

export default function Menu() {
  const { t, language, dir } = useTranslation();
  const cached = getMenuCache();

  const [categories, setCategories] = useState<Category[]>(
    cached?.categories || []
  );
  const [menuItems, setMenuItems] = useState<MenuItem[]>(
    cached?.menuItems || []
  );
  const [extras, setExtras] = useState<Extra[]>(
    cached?.extras || []
  );
  const [activeCategory, setActiveCategory] = useState<
    number | null
  >(cached?.categories?.[0]?.id || null);
  const [selectedItem, setSelectedItem] =
    useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] =
    useState<string>('');
  const [selectedExtras, setSelectedExtras] = useState<
    Extra[]
  >([]);
  const [quantity, setQuantity] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;

    if (
      cached &&
      Date.now() - cached.timestamp < MENU_CACHE_TTL
    ) {
      const timer = window.setTimeout(loadData, 2000);
      return () => window.clearTimeout(timer);
    }

    void loadData();
  }, []);

  async function loadData() {
    try {
      const [categoryResponse, itemResponse, extrasResponse] =
        await Promise.all([
          client.entities.categories.query({
            query: { is_active: true },
            sort: 'sort_order',
            limit: 50,
          }),
          client.entities.menu_items.query({
            query: { is_active: true },
            sort: 'sort_order',
            limit: 200,
          }),
          client.entities.extras.query({
            query: { is_active: true },
            limit: 50,
          }),
        ]);

      const loadedCategories =
        categoryResponse?.data?.items || [];
      const loadedItems = itemResponse?.data?.items || [];
      const loadedExtras =
        extrasResponse?.data?.items || [];

      setCategories(loadedCategories);
      setMenuItems(loadedItems);
      setExtras(loadedExtras);

      if (
        loadedCategories.length > 0 &&
        activeCategory === null
      ) {
        setActiveCategory(loadedCategories[0].id);
      }

      setMenuCache({
        categories: loadedCategories,
        menuItems: loadedItems,
        extras: loadedExtras,
      });
    } catch (error) {
      console.error('Failed to load menu:', error);
    }
  }

  const filteredItems = menuItems.filter(
    (item) => item.category_id === activeCategory
  );

  function getCategoryName(category: Category): string {
    return translatedField(
      category as unknown as Record<string, unknown>,
      'name',
      language
    );
  }

  function getItemName(item: MenuItem): string {
    return translatedField(
      item as unknown as Record<string, unknown>,
      'name',
      language
    );
  }

  function getItemDescription(item: MenuItem): string {
    return translatedField(
      item as unknown as Record<string, unknown>,
      'description',
      language
    );
  }

  function getExtraName(extra: Extra): string {
    return translatedField(
      extra as unknown as Record<string, unknown>,
      'name',
      language
    );
  }

  function openItemDialog(item: MenuItem) {
    const sizes = getItemSizes(item);

    setSelectedItem(item);
    setSelectedSize(sizes[0]?.name || '');
    setSelectedExtras([]);
    setQuantity(1);
    setDialogOpen(true);
  }

  function toggleExtra(extra: Extra) {
    setSelectedExtras((currentExtras) =>
      currentExtras.some(
        (currentExtra) => currentExtra.id === extra.id
      )
        ? currentExtras.filter(
            (currentExtra) => currentExtra.id !== extra.id
          )
        : [...currentExtras, extra]
    );
  }

  function calculatePrice(): number {
    if (!selectedItem) {
      return 0;
    }

    const sizes = getItemSizes(selectedItem);
    const selectedSizeObject =
      sizes.find((size) => size.name === selectedSize) ||
      sizes[0];

    const basePrice = selectedSizeObject?.price || 0;
    const extrasTotal = selectedExtras.reduce(
      (total, extra) => total + extra.price,
      0
    );

    return (basePrice + extrasTotal) * quantity;
  }

  function handleAddToCart() {
    if (!selectedItem) {
      return;
    }

    addToCart(
      selectedItem,
      selectedSize,
      selectedExtras,
      quantity
    );

    setDialogOpen(false);
    toast.success(t('menu.added'));
    window.dispatchEvent(new Event('cart-updated'));
  }

  return (
    <CustomerLayout>
      <div dir={dir} className="bg-black min-h-screen">
        <div className="sticky top-[60px] z-40 bg-black border-b border-gray-800">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 px-4 py-3 min-w-max">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() =>
                    setActiveCategory(category.id)
                  }
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    activeCategory === category.id
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {getCategoryName(category)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => {
              const sizes = getItemSizes(item);
              const itemName = getItemName(item);
              const itemDescription =
                getItemDescription(item);
              const imageSource =
                item.image_url || PIZZA_IMAGES[item.name];

              return (
                <Card
                  key={item.id}
                  className="bg-gray-900 border-gray-800 overflow-hidden cursor-pointer hover:border-red-600/50 transition-all"
                  onClick={() => openItemDialog(item)}
                >
                  <div className="flex gap-4 p-4">
                    {imageSource && (
                      <img
                        src={imageSource}
                        alt={itemName}
                        className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                        loading="lazy"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold text-lg truncate">
                        {itemName}
                      </h3>

                      {itemDescription && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                          {itemDescription}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {sizes.map((size, index) => (
                          <Badge
                            key={`${size.name}-${index}`}
                            variant="secondary"
                            className="bg-gray-800 text-gray-200"
                          >
                            {sizes.length > 1
                              ? `${size.name}: `
                              : ''}
                            {t('common.aed')} {size.price}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredItems.length === 0 &&
            categories.length > 0 && (
              <div className="text-center py-16">
                <p className="text-gray-500 text-lg">
                  {t('menu.no_items')}
                </p>
              </div>
            )}

          {categories.length === 0 && (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm mt-3">
                {t('common.loading')}
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent
          dir={dir}
          className="bg-gray-900 border-gray-700 text-white max-w-md max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="text-xl">
              {selectedItem
                ? getItemName(selectedItem)
                : ''}
            </DialogTitle>
          </DialogHeader>

          {selectedItem &&
            (() => {
              const sizes = getItemSizes(selectedItem);
              const itemName = getItemName(selectedItem);
              const itemDescription =
                getItemDescription(selectedItem);
              const imageSource =
                selectedItem.image_url ||
                PIZZA_IMAGES[selectedItem.name];

              return (
                <div className="space-y-6">
                  {imageSource && (
                    <img
                      src={imageSource}
                      alt={itemName}
                      className="w-full h-48 object-cover rounded-xl"
                    />
                  )}

                  {itemDescription && (
                    <p className="text-gray-400">
                      {itemDescription}
                    </p>
                  )}

                  {sizes.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">
                        {t('menu.select_size')}
                      </h4>

                      <div
                        className={`grid gap-3 ${
                          sizes.length === 1
                            ? 'grid-cols-1'
                            : sizes.length === 2
                              ? 'grid-cols-2'
                              : 'grid-cols-3'
                        }`}
                      >
                        {sizes.map((size, index) => (
                          <button
                            type="button"
                            key={`${size.name}-${index}`}
                            onClick={() =>
                              setSelectedSize(size.name)
                            }
                            className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                              selectedSize === size.name
                                ? 'border-red-500 bg-red-600/10'
                                : 'border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            <div className="font-medium">
                              {size.name}
                            </div>

                            <div className="text-red-400 font-bold">
                              {t('common.aed')} {size.price}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {extras.length > 0 &&
                    selectedItem.has_extras !== false && (
                      <div>
                        <h4 className="font-semibold mb-3">
                          {t('menu.extras')}
                        </h4>

                        <div className="space-y-2">
                          {extras.map((extra) => (
                            <label
                              key={extra.id}
                              className="flex items-center justify-between p-3 rounded-xl border border-gray-700 hover:border-gray-500 cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={selectedExtras.some(
                                    (selectedExtra) =>
                                      selectedExtra.id ===
                                      extra.id
                                  )}
                                  onCheckedChange={() =>
                                    toggleExtra(extra)
                                  }
                                />

                                <span>
                                  {getExtraName(extra)}
                                </span>
                              </div>

                              <span className="text-red-400 font-medium whitespace-nowrap">
                                +{t('common.aed')} {extra.price}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                  <div>
                    <h4 className="font-semibold mb-3">
                      {t('menu.quantity')}
                    </h4>

                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity((currentQuantity) =>
                            Math.max(
                              1,
                              currentQuantity - 1
                            )
                          )
                        }
                        className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <span className="text-xl font-bold w-8 text-center">
                        {quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setQuantity(
                            (currentQuantity) =>
                              currentQuantity + 1
                          )
                        }
                        className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleAddToCart}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer"
                  >
                    {t('menu.add_to_cart')} —{' '}
                    {t('common.aed')}{' '}
                    {calculatePrice().toFixed(2)}
                  </Button>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
