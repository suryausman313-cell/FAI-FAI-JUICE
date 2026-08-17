import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ShoppingBag, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import CustomerLayout from '@/components/CustomerLayout';
import { client } from '@/lib/api';
import { addDealToCart } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';

interface DealItem {
  id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
}

interface DealCategory {
  category_id: number;
  category_name: string;
  required_quantity: number;
  display_order: number;
  available_items: DealItem[];
}

interface Deal {
  id: number;
  name: string;
  price: number;
  discounted_price: number | null;
  discount_type: string;
  discount_value: number;
  image_url: string;
  description: string;
  categories: DealCategory[];
}

export default function Deals() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selections, setSelections] = useState<Record<number, number[]>>({});

  useEffect(() => {
    loadDeals();
  }, []);

  async function loadDeals() {
    try {
      const res = await client.apiCall.invoke({ url: '/api/v1/deals/public', method: 'GET' }) as any;
      setDeals(res?.data?.items || res?.items || []);
    } catch (e) {
      console.error('Failed to load deals:', e);
    } finally {
      setLoading(false);
    }
  }

  function openDeal(deal: Deal) {
    setSelectedDeal(deal);
    // Initialize selections for each category
    const initial: Record<number, number[]> = {};
    deal.categories.forEach((_, i) => {
      initial[i] = [];
    });
    setSelections(initial);
  }

  function toggleItem(categoryIndex: number, itemId: number) {
    if (!selectedDeal) return;
    const category = selectedDeal.categories[categoryIndex];
    const current = selections[categoryIndex] || [];
    const maxQty = category.required_quantity;

    if (current.includes(itemId)) {
      // Remove
      setSelections({ ...selections, [categoryIndex]: current.filter(id => id !== itemId) });
    } else {
      // Add (enforce max)
      if (current.length >= maxQty) {
        // Replace the first selected item
        const updated = [...current.slice(1), itemId];
        setSelections({ ...selections, [categoryIndex]: updated });
      } else {
        setSelections({ ...selections, [categoryIndex]: [...current, itemId] });
      }
    }
  }

  function isAllSelected(): boolean {
    if (!selectedDeal) return false;
    return selectedDeal.categories.every((cat, i) => {
      return (selections[i] || []).length === cat.required_quantity;
    });
  }

  function handleAddToCart() {
    if (!selectedDeal || !isAllSelected()) return;

    // Build deal cart item
    const selectedItems: { categoryName: string; items: { id: number; name: string }[] }[] = [];
    selectedDeal.categories.forEach((cat, i) => {
      const itemIds = selections[i] || [];
      const items = itemIds.map(id => {
        const item = cat.available_items.find(it => it.id === id);
        return { id, name: item?.name || t('home.unknown') };
      });
      selectedItems.push({ categoryName: cat.category_name, items });
    });

    addDealToCart({
      dealId: selectedDeal.id,
      dealName: selectedDeal.name,
      dealPrice: selectedDeal.discounted_price || selectedDeal.price,
      selectedItems,
    });

    window.dispatchEvent(new Event('cart-updated'));
    toast.success(`${selectedDeal.name} ${t('deals.added')}`);
    setSelectedDeal(null);
    navigate('/cart');
  }

  if (loading) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
        </div>
      </CustomerLayout>
    );
  }

  // Deal detail view
  if (selectedDeal) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setSelectedDeal(null)} className="text-gray-400 hover:text-white cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-white text-xl font-bold">{selectedDeal.name}</h1>
              {selectedDeal.discounted_price ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 line-through text-sm">AED {selectedDeal.price.toFixed(2)}</span>
                  <span className="text-green-400 font-bold">AED {selectedDeal.discounted_price.toFixed(2)}</span>
                  <span className="text-green-500 text-xs bg-green-900/40 px-1.5 py-0.5 rounded">
                    {selectedDeal.discount_type === 'percentage' ? `${selectedDeal.discount_value}% OFF` : `AED ${selectedDeal.discount_value} OFF`}
                  </span>
                </div>
              ) : (
                <p className="text-red-400 font-bold">AED {selectedDeal.price.toFixed(2)}</p>
              )}
            </div>
          </div>

          {selectedDeal.description && (
            <p className="text-gray-400 text-sm mb-4">{selectedDeal.description}</p>
          )}

          <div className="space-y-6">
            {selectedDeal.categories.map((cat, catIndex) => {
              const selected = selections[catIndex] || [];
              const remaining = cat.required_quantity - selected.length;

              return (
                <div key={catIndex}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-white font-semibold">
                      {t('deals.choose')} {cat.required_quantity} {cat.category_name}
                    </h2>
                    <span className={`text-xs px-2 py-1 rounded-full ${remaining === 0 ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {remaining === 0 ? `✓ ${t('deals.done')}` : `${remaining} ${t('deals.more')}`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cat.available_items.map(item => {
                      const isSelected = selected.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleItem(catIndex, item.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-red-900/30 border-red-500'
                              : 'bg-gray-900 border-gray-800 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {item.image_url && (
                                <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                              )}
                              <div>
                                <span className="text-white font-medium text-sm">{item.name}</span>
                                {item.description && (
                                  <p className="text-gray-500 text-xs mt-0.5">{item.description}</p>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add to Cart Button */}
          <div className="mt-8 sticky bottom-4">
            <Button
              onClick={handleAddToCart}
              disabled={!isAllSelected()}
              className={`w-full py-6 text-lg font-semibold rounded-xl cursor-pointer ${
                isAllSelected()
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              {isAllSelected() ? `${t('menu.add_to_cart')} - AED ${(selectedDeal.discounted_price || selectedDeal.price).toFixed(2)}` : t('deals.select_required')}
            </Button>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  // Deals list view
  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white text-2xl font-bold">{t('deals.title')}</h1>
        </div>

        {deals.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-8 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">{t('deals.none')}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {deals.map(deal => (
              <button
                key={deal.id}
                onClick={() => openDeal(deal)}
                className="w-full text-left cursor-pointer"
              >
                <Card className="bg-gray-900 border-gray-800 p-4 hover:border-red-600/50 transition-all">
                  <div className="flex gap-4">
                    {deal.image_url && (
                      <img src={deal.image_url} alt={deal.name} className="w-20 h-20 rounded-xl object-cover" />
                    )}
                    <div className="flex-1">
                      <h3 className="text-white font-bold text-lg">{deal.name}</h3>
                      {deal.discounted_price ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-gray-500 line-through text-sm">AED {deal.price.toFixed(2)}</span>
                          <span className="text-green-400 font-bold text-xl">AED {deal.discounted_price.toFixed(2)}</span>
                          <span className="text-green-500 text-xs bg-green-900/40 px-1.5 py-0.5 rounded">
                            {deal.discount_type === 'percentage' ? `${deal.discount_value}% OFF` : `AED ${deal.discount_value} OFF`}
                          </span>
                        </div>
                      ) : (
                        <p className="text-red-400 font-bold text-xl mt-1">AED {deal.price.toFixed(2)}</p>
                      )}
                      {deal.description && <p className="text-gray-400 text-sm mt-1">{deal.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {deal.categories.map((cat, i) => (
                          <span key={i} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full">
                            {cat.required_quantity} {cat.category_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}