import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import CustomerLayout from '@/components/CustomerLayout';
import { CartItem, client } from '@/lib/api';
import { getCart, removeFromCart, updateCartItemQuantity, getCartTotal, getCartOriginalTotal, getCartItemDiscountTotal } from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';
import Checkout from '@/pages/Checkout';

export default function Cart() {
  const { t } = useTranslation();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutFlow, setCheckoutFlow] = useState<'two_step' | 'direct'>('two_step');
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    setCart(getCart());
    loadCheckoutFlowSetting();
  }, []);

  async function loadCheckoutFlowSetting() {
    try {
      const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
      const items = res?.data?.items || [];
      if (items.length > 0) {
        const s = items[0] as any;
        if (s.checkout_flow === 'direct') {
          setCheckoutFlow('direct');
        }
      }
    } catch (e) {
      console.error('Failed to load checkout flow setting:', e);
    } finally {
      setLoadingSettings(false);
    }
  }

  function handleRemove(itemId: string) {
    const updated = removeFromCart(itemId);
    setCart(updated);
    window.dispatchEvent(new Event('cart-updated'));
  }

  function handleQuantityChange(itemId: string, newQty: number) {
    if (newQty < 1) return;
    const updated = updateCartItemQuantity(itemId, newQty);
    setCart(updated);
    window.dispatchEvent(new Event('cart-updated'));
  }

  const subtotal = getCartTotal(cart);
  const originalSubtotal = getCartOriginalTotal(cart);
  const itemDiscountTotal = getCartItemDiscountTotal(cart);

  if (cart.length === 0) {
    return (
      <CustomerLayout>
        <div className="bg-black min-h-screen flex flex-col items-center justify-center px-4">
          <ShoppingBag className="w-16 h-16 text-gray-600 mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">{t('cart.empty')}</h2>
          <p className="text-gray-400 mb-6">{t('cart.empty_subtitle')}</p>
          <Link to="/menu">
            <Button className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {t('cart.browse_menu')}
            </Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  // Direct checkout flow: show cart items + checkout form together
  if (checkoutFlow === 'direct' && !loadingSettings) {
    return <Checkout />;
  }

  return (
    <CustomerLayout>
      <div className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto">
        <h1 className="text-white text-2xl font-bold mb-6">{t('cart.title')}</h1>

        <div className="space-y-4">
          {cart.map(item => (
            <Card key={item.id} className="bg-gray-900 border-gray-800 p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-white font-semibold">
                    {item.isDeal && <span className="text-orange-400 text-xs mr-1">🎁 DEAL</span>}
                    {item.menuItem.name}
                  </h3>
                  {item.isDeal && item.dealSelectedItems ? (
                    <div className="mt-1 space-y-0.5">
                      {item.dealSelectedItems.map((cat, ci) => (
                        <p key={ci} className="text-gray-400 text-xs">
                          {cat.categoryName}: {cat.items.map(it => it.name).join(', ')}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-400 text-sm mt-1">
                        Size: {item.size}
                      </p>
                      {item.extras.length > 0 && (
                        <p className="text-gray-500 text-sm mt-1">
                          + {item.extras.map(e => e.name).join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="text-gray-500 hover:text-red-500 p-1 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                  >
                    <Minus className="w-3 h-3 text-white" />
                  </button>
                  <span className="text-white font-medium w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                </div>
                <div className="text-right">
                  {Number(item.itemDiscountAmount || 0) > 0 && (
                    <>
                      <p className="text-gray-500 text-xs line-through">
                        AED {Number(item.originalTotalPrice ?? item.totalPrice).toFixed(2)}
                      </p>
                      <p className="text-green-500 text-[10px]">
                        {item.itemDiscountLabel} • Save AED {Number(item.itemDiscountAmount).toFixed(2)}
                      </p>
                    </>
                  )}
                  <span className={Number(item.itemDiscountAmount || 0) > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    AED {item.totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Total & Checkout - Items only, no service fee */}
        <div className="mt-8 p-4 rounded-2xl bg-gray-900 border border-gray-800">
          <div className="space-y-2 mb-4">
            {itemDiscountTotal > 0 && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">Original food subtotal</span>
                  <span className="text-gray-400 line-through">{t('common.aed')} {originalSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-green-400">Item discounts</span>
                  <span className="text-green-400">-{t('common.aed')} {itemDiscountTotal.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-300 text-lg">{t('cart.total')}</span>
              <span className="text-white text-2xl font-bold">{t('common.aed')} {subtotal.toFixed(2)}</span>
            </div>
            <p className="text-gray-500 text-xs">Service fee & other charges will be shown at checkout</p>
          </div>
          <Link to="/checkout">
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer">
              {t('cart.checkout')}
            </Button>
          </Link>
        </div>
      </div>
    </CustomerLayout>
  );
}