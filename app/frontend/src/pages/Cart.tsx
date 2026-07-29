import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import CustomerLayout from '@/components/CustomerLayout';
import Checkout from '@/pages/Checkout';

import { CartItem, client } from '@/lib/api';
import {
  getCart,
  getCartTotal,
  removeFromCart,
  updateCartItemQuantity,
} from '@/lib/cart-store';
import { useTranslation } from '@/lib/i18n';

export default function Cart() {
  const { t, dir } = useTranslation();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutFlow, setCheckoutFlow] =
    useState<'two_step' | 'direct'>('two_step');
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    setCart(getCart());
    void loadCheckoutFlowSetting();
  }, []);

  async function loadCheckoutFlowSetting() {
    try {
      const response =
        await client.entities.restaurant_settings.query({
          query: {},
          limit: 1,
        });

      const items = response?.data?.items || [];

      if (items.length > 0) {
        const settings = items[0] as {
          checkout_flow?: string;
        };

        if (settings.checkout_flow === 'direct') {
          setCheckoutFlow('direct');
        }
      }
    } catch (error) {
      console.error(
        'Failed to load checkout flow setting:',
        error
      );
    } finally {
      setLoadingSettings(false);
    }
  }

  function handleRemove(itemId: string) {
    const updatedCart = removeFromCart(itemId);
    setCart(updatedCart);
    window.dispatchEvent(new Event('cart-updated'));
  }

  function handleQuantityChange(
    itemId: string,
    newQuantity: number
  ) {
    if (newQuantity < 1) {
      return;
    }

    const updatedCart = updateCartItemQuantity(
      itemId,
      newQuantity
    );

    setCart(updatedCart);
    window.dispatchEvent(new Event('cart-updated'));
  }

  const subtotal = getCartTotal(cart);

  if (cart.length === 0) {
    return (
      <CustomerLayout>
        <div
          dir={dir}
          className="bg-black min-h-screen flex flex-col items-center justify-center px-4 text-center"
        >
          <ShoppingBag className="w-16 h-16 text-gray-600 mb-4" />

          <h2 className="text-white text-2xl font-bold mb-2">
            {t('cart.empty')}
          </h2>

          <p className="text-gray-400 mb-6">
            {t('cart.empty_subtitle')}
          </p>

          <Link to="/menu">
            <Button className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              {t('cart.browse_menu')}
            </Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  if (checkoutFlow === 'direct' && !loadingSettings) {
    return <Checkout />;
  }

  return (
    <CustomerLayout>
      <div
        dir={dir}
        className="bg-black min-h-screen px-4 py-6 max-w-2xl mx-auto"
      >
        <h1 className="text-white text-2xl font-bold mb-6">
          {t('cart.title')}
        </h1>

        <div className="space-y-4">
          {cart.map((item) => (
            <Card
              key={item.id}
              className="bg-gray-900 border-gray-800 p-4"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold">
                    {item.isDeal && (
                      <span className="text-orange-400 text-xs me-1">
                        🎁 {t('menu.deal')}
                      </span>
                    )}

                    {item.menuItem.name}
                  </h3>

                  {item.isDeal && item.dealSelectedItems ? (
                    <div className="mt-1 space-y-0.5">
                      {item.dealSelectedItems.map(
                        (category, categoryIndex) => (
                          <p
                            key={categoryIndex}
                            className="text-gray-400 text-xs"
                          >
                            {category.categoryName}:{' '}
                            {category.items
                              .map((selectedItem) => selectedItem.name)
                              .join(', ')}
                          </p>
                        )
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-400 text-sm mt-1">
                        {t('cart.size')}: {item.size}
                      </p>

                      {item.extras.length > 0 && (
                        <p className="text-gray-500 text-sm mt-1">
                          +{' '}
                          {item.extras
                            .map((extra) => extra.name)
                            .join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  aria-label={t('cart.remove')}
                  title={t('cart.remove')}
                  className="text-gray-500 hover:text-red-500 p-1 cursor-pointer flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between mt-4 gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuantityChange(
                        item.id,
                        item.quantity - 1
                      )
                    }
                    aria-label="-"
                    className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                  >
                    <Minus className="w-3 h-3 text-white" />
                  </button>

                  <span className="text-white font-medium w-6 text-center">
                    {item.quantity}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleQuantityChange(
                        item.id,
                        item.quantity + 1
                      )
                    }
                    aria-label="+"
                    className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                </div>

                <span className="text-red-400 font-bold whitespace-nowrap">
                  {t('common.aed')} {item.totalPrice.toFixed(2)}
                </span>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-2xl bg-gray-900 border border-gray-800">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center gap-4">
              <span className="text-gray-300 text-lg">
                {t('cart.total')}
              </span>

              <span className="text-white text-2xl font-bold whitespace-nowrap">
                {t('common.aed')} {subtotal.toFixed(2)}
              </span>
            </div>

            <p className="text-gray-500 text-xs">
              {t('cart.service_fee_note')}
            </p>
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
