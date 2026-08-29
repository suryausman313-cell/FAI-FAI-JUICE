import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Clock, Phone, MapPin, ChevronRight, Tag, MessageSquare, Star, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { client, MenuItem, Category, RestaurantSettings, Offer, getItemSizes, localizedMenuText, localizedMenuDescription } from '@/lib/api';
import { getItemPriceBreakdown, isPromoOfferCurrentlyActive } from '@/lib/discounts';
import { useTranslation } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/LanguagePicker';
import NotificationBanner from '@/components/NotificationBanner';
import FaiFaiWordmark from '@/components/FaiFaiWordmark';
import { getAPIBaseURL } from '@/lib/config';

const CACHE_KEY = 'fai_home_cache_v6';
const CACHE_TTL = 120000; // 2 minutes

function customerImageUrl(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const base = getAPIBaseURL().replace(/\/$/, '');
  return `${base}/${raw.replace(/^\//, '')}`;
}

interface CachedData {
  settings: RestaurantSettings | null;
  featuredItems: MenuItem[];
  categories: Category[];
  offers: Offer[];
  timestamp: number;
}

function getCachedData(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedData;
    // Return cache even if expired (we'll refresh in background)
    return parsed;
  } catch {
    return null;
  }
}

function setCachedData(data: Omit<CachedData, 'timestamp'>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch { /* storage full - ignore */ }
}

export default function Index() {
  const navigate = useNavigate();
  const { t, isRTL, language } = useTranslation();

  // Initialize from cache for instant display
  const cached = getCachedData();
  const [settings, setSettings] = useState<RestaurantSettings | null>(cached?.settings || null);
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>(cached?.featuredItems || []);
  const [categories, setCategories] = useState<Category[]>(cached?.categories || []);
  const [offers, setOffers] = useState<Offer[]>(cached?.offers || []);
  // Only show loading spinner if we have NO cached data
  const [loading, setLoading] = useState(!cached);
  const [showWelcome, setShowWelcome] = useState(() => {
    // The website is the single owner of the Fai Fai welcome screen.
    // The Android WebView intentionally adds no second/native splash.
    try { return sessionStorage.getItem('fai_fai_welcome_seen') !== '1'; } catch { return true; }
  });

  const loadData = useCallback(async () => {
    try {
      const [settingsRes, itemsRes, catRes, offersRes, popularRes] = await Promise.all([
        client.entities.restaurant_settings.query({ query: {}, limit: 1 }),
        client.entities.menu_items.query({ query: { is_active: true }, sort: 'sort_order', limit: 200 }),
        client.entities.categories.query({ query: { is_active: true }, sort: 'sort_order', limit: 20 }),
        client.entities.offers.query({ query: { is_active: true }, limit: 100 }),
        client.apiCall.invoke({ url: '/api/v1/public/popular-items', method: 'GET' }).catch(() => null),
      ]);
      const settingsData = settingsRes?.data?.items?.[0] || null;
      const allItems = itemsRes?.data?.items || [];
      const popularItems = popularRes?.data?.items || [];
      const maxPopular = Math.max(2, Math.min(12, Number((settingsData as any)?.popular_max_items || 6)));
      const items = popularItems.length > 0 ? popularItems.slice(0, maxPopular) : allItems.slice(0, maxPopular);
      const cats = catRes?.data?.items || [];
      const offersList = (offersRes?.data?.items || []).filter((offer: Offer) => isPromoOfferCurrentlyActive(offer));

      setSettings(settingsData);
      setFeaturedItems(items);
      setCategories(cats);
      setOffers(offersList);

      // Cache for next visit
      setCachedData({ settings: settingsData, featuredItems: items, categories: cats, offers: offersList });

    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If we have cache, still refresh in background but don't block UI
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Cache is fresh enough, refresh silently in background
      setLoading(false);
      // Background refresh after a short delay
      const timer = setTimeout(loadData, 2000);
      return () => clearTimeout(timer);
    } else {
      // No cache or stale - load immediately
      loadData();
    }
  }, [loadData]);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    try { sessionStorage.setItem('fai_fai_welcome_seen', '1'); } catch { /* optional storage */ }
  }, []);

  useEffect(() => {
    if (!showWelcome) return;
    const timer = window.setTimeout(dismissWelcome, 4000);
    return () => window.clearTimeout(timer);
  }, [showWelcome, dismissWelcome]);

  function getStatusColor(status: string) {
    switch (status) {
      case 'open': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'closed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case 'open': return t('home.open_now');
      case 'busy': return t('home.busy');
      case 'closed': return t('home.closed');
      default: return t('home.unknown');
    }
  }

  function shopMapUrl(): string {
    const lat = Number(settings?.restaurant_lat);
    const lng = Number(settings?.restaurant_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    }
    const address = String(settings?.address || 'Murbah, Fujairah, UAE').trim();
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  const welcomeOverlay = (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
      aria-label="Welcome to Fai Fai Juice"
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes ffWelcomeCinematic {
          0%   { transform: scale(1.015) translate3d(0, 0, 0); filter: brightness(.88) saturate(.96); }
          45%  { transform: scale(1.035) translate3d(-0.25%, -0.20%, 0); filter: brightness(1.03) saturate(1.06); }
          100% { transform: scale(1.055) translate3d(0.18%, -0.35%, 0); filter: brightness(1.00) saturate(1.03); }
        }
        @keyframes ffWelcomeShine {
          0%   { transform: translateX(-145%) rotate(10deg); opacity: 0; }
          18%  { opacity: .10; }
          58%  { opacity: .22; }
          100% { transform: translateX(165%) rotate(10deg); opacity: 0; }
        }
        @keyframes ffWelcomeGlowA {
          0%,100% { transform: translate3d(-5%, 4%, 0) scale(.92); opacity: .18; }
          50%     { transform: translate3d(7%, -5%, 0) scale(1.12); opacity: .34; }
        }
        @keyframes ffWelcomeGlowB {
          0%,100% { transform: translate3d(6%, -4%, 0) scale(1.08); opacity: .14; }
          50%     { transform: translate3d(-7%, 6%, 0) scale(.94); opacity: .30; }
        }
        @keyframes ffWelcomePulse {
          0%,100% { opacity: .18; transform: scale(.96); }
          50%     { opacity: .46; transform: scale(1.07); }
        }
        @keyframes ffFloatSpeck {
          0%   { transform: translate3d(0, 12px, 0) scale(.7); opacity: 0; }
          18%  { opacity: .65; }
          80%  { opacity: .42; }
          100% { transform: translate3d(10px, -34px, 0) scale(1.12); opacity: 0; }
        }
        .ff-welcome-art {
          animation: ffWelcomeCinematic 4s cubic-bezier(.18,.72,.24,1) both;
          will-change: transform, filter;
        }
        .ff-welcome-shine {
          animation: ffWelcomeShine 3.2s ease-in-out .25s both;
          will-change: transform, opacity;
        }
        .ff-welcome-glow-a { animation: ffWelcomeGlowA 3.4s ease-in-out infinite; }
        .ff-welcome-glow-b { animation: ffWelcomeGlowB 3.8s ease-in-out .35s infinite; }
        .ff-welcome-pulse  { animation: ffWelcomePulse 1.65s ease-in-out infinite; }
        .ff-speck-1 { animation: ffFloatSpeck 2.4s ease-out .15s infinite; }
        .ff-speck-2 { animation: ffFloatSpeck 2.8s ease-out .65s infinite; }
        .ff-speck-3 { animation: ffFloatSpeck 2.6s ease-out 1.1s infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ff-welcome-art, .ff-welcome-shine, .ff-welcome-glow-a, .ff-welcome-glow-b,
          .ff-welcome-pulse, .ff-speck-1, .ff-speck-2, .ff-speck-3 { animation: none !important; }
        }
      `}</style>

      {/* ONE welcome only: website artwork. Android adds no native splash. */}
      <div
        className="relative shrink-0 overflow-hidden bg-black"
        style={{
          width: 'min(100vw, 56.28vh)',
          height: 'min(177.68vw, 100vh)',
        }}
      >
        <video src="/fai-fai-welcome-video.mp4" className="ff-welcome-art absolute inset-0 h-full w-full object-contain select-none" autoPlay muted playsInline />

        {/* Soft moving light makes the still artwork feel cinematic/video-like. */}
        <div
          className="ff-welcome-glow-a pointer-events-none absolute -left-[22%] top-[5%] h-[44%] w-[58%] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,112,0,.22), rgba(255,112,0,0) 68%)' }}
        />
        <div
          className="ff-welcome-glow-b pointer-events-none absolute -right-[24%] bottom-[10%] h-[44%] w-[58%] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(78,220,55,.19), rgba(78,220,55,0) 68%)' }}
        />
        <div
          className="ff-welcome-pulse pointer-events-none absolute left-1/2 top-[31%] h-[20%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,137,0,.16), rgba(255,137,0,0) 70%)' }}
        />
        <div
          className="ff-welcome-shine pointer-events-none absolute -left-[45%] -top-[10%] h-[125%] w-[38%]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.24), transparent)', filter: 'blur(16px)' }}
        />

        {/* Tiny floating juice-like light specks. */}
        <span className="ff-speck-1 pointer-events-none absolute left-[18%] top-[39%] h-1.5 w-1.5 rounded-full bg-orange-400/80 shadow-[0_0_12px_rgba(251,146,60,.8)]" />
        <span className="ff-speck-2 pointer-events-none absolute right-[17%] top-[55%] h-1 w-1 rounded-full bg-lime-400/80 shadow-[0_0_10px_rgba(163,230,53,.8)]" />
        <span className="ff-speck-3 pointer-events-none absolute left-[43%] bottom-[22%] h-1 w-1 rounded-full bg-orange-300/70 shadow-[0_0_10px_rgba(253,186,116,.8)]" />

        {/* Invisible touch target over the Skip button drawn in the approved artwork. */}
        <button
          type="button"
          onClick={dismissWelcome}
          aria-label={language === 'ar' ? 'تخطي' : 'Skip'}
          className="absolute z-20 bg-transparent border-0 p-0 cursor-pointer"
          style={{ top: '2.0%', right: '3.2%', width: '24%', height: '7.5%' }}
        >
          <span className="sr-only">{language === 'ar' ? 'تخطي' : 'Skip'}</span>
        </button>
      </div>
    </div>
  );


  if (loading) {
    if (showWelcome) return welcomeOverlay;
    // After the one approved welcome finishes, keep any remaining data-load
    // moment neutral instead of showing a second branded splash.
    return <div className="min-h-screen bg-gray-950" aria-busy="true" />;
  }

  const restaurantStatus = settings?.restaurant_status || 'open';
  const visibleQuickActionCount = [
    settings?.show_menu_action !== false,
    settings?.show_deals_action !== false,
    settings?.show_orders_action !== false,
    settings?.show_contact_action !== false,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-950">
      {showWelcome && welcomeOverlay}
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="Logo" className="w-8 h-8 rounded-full object-cover" />
            )}
            <div>
              <FaiFaiWordmark name={settings?.restaurant_name} compact className="text-lg" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {settings?.show_status_banner !== false && (
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(restaurantStatus)} animate-pulse`} />
              <span className="text-xs text-gray-300 font-medium">{getStatusText(restaurantStatus)}</span>
            </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pb-24">
        {/* Notifications - deferred loading */}
        {settings?.show_notifications !== false && <NotificationBanner />}

        {/* Hero Branding */}
        {settings?.show_branding !== false && (
        <div className="py-8 text-center">
          <h1 className="text-5xl font-black mb-1">
            <FaiFaiWordmark name={settings?.restaurant_name} className="text-[0.95em]" />
          </h1>
          <p className="text-gray-400 text-sm">{t('home.tagline')}</p>
          {settings?.banner_text && (
            <div className="mt-4 rounded-xl border border-red-600/30 bg-red-600/10 px-4 py-3">
              <p className="text-red-200 text-sm font-medium">{settings.banner_text}</p>
            </div>
          )}
          
          {settings?.show_status_banner !== false && restaurantStatus === 'busy' && (
            <div className="mt-4 bg-yellow-600/10 border border-yellow-600/30 rounded-xl px-4 py-3">
              <p className="text-yellow-400 text-sm font-medium">
                {settings?.busy_message || 'We are currently very busy. Your order may take longer than usual.'}
              </p>
              {settings?.estimated_wait_time && (
                <p className="text-yellow-500/70 text-xs mt-1">{t('home.estimated_wait')}: {settings.estimated_wait_time}</p>
              )}
            </div>
          )}
          {settings?.show_status_banner !== false && restaurantStatus === 'closed' && (
            <div className="mt-4 bg-red-600/10 border border-red-600/30 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm font-medium">
                {t('home.closed_message')}
              </p>
              <p className="text-red-500/70 text-xs mt-1">{t('home.closed_subtitle')}</p>
            </div>
          )}
        </div>
        )}

        {/* Active Offers */}
        {settings?.show_offers !== false && offers.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-red-500" />
              <h2 className="text-white font-bold text-sm">{t('home.special_offers')}</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {offers.map(offer => (
                <div
                  key={offer.id}
                  className="flex-shrink-0 w-64 bg-gradient-to-br from-red-600/20 to-orange-600/10 border border-red-600/30 rounded-xl p-4"
                >
                  <h3 className="text-white font-bold text-sm">{offer.title}</h3>
                  <p className="text-gray-400 text-xs mt-1">{offer.description}</p>
                  {((offer.discount_type || 'percentage') === 'fixed'
                    ? Number(offer.fixed_discount_amount || 0) > 0
                    : Number(offer.discount_percent || 0) > 0) && (
                    <Badge className="bg-red-600 text-white mt-2 text-xs">
                      {(offer.discount_type || 'percentage') === 'fixed'
                        ? `AED ${Number(offer.fixed_discount_amount || 0).toFixed(2)} OFF`
                        : `${Number(offer.discount_percent || 0)}% OFF`}
                    </Badge>
                  )}
                  {offer.promo_code && (
                    <p className="text-orange-400 text-xs mt-1 font-mono">Code: {offer.promo_code}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {settings?.show_quick_actions !== false && visibleQuickActionCount > 0 && (
        <div
          className="grid gap-2 mb-6"
          style={{ gridTemplateColumns: `repeat(${visibleQuickActionCount}, minmax(0, 1fr))` }}
        >
          {settings?.show_menu_action !== false && (
          <Button
            onClick={() => navigate('/menu')}
            className="bg-red-600 hover:bg-red-700 text-white h-14 rounded-xl font-semibold cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px]">{t('nav.menu')}</span>
          </Button>
          )}
          {settings?.show_deals_action !== false && (
          <Button
            onClick={() => navigate('/deals')}
            className="bg-orange-600 hover:bg-orange-700 text-white h-14 rounded-xl font-semibold cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px]">{t('home.deals')}</span>
          </Button>
          )}
          {settings?.show_orders_action !== false && (
          <Button
            onClick={() => navigate('/my-orders')}
            variant="outline"
            className="border-gray-700 text-gray-300 hover:text-white h-14 rounded-xl font-semibold cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px]">{t('home.my_orders')}</span>
          </Button>
          )}
          {settings?.show_contact_action !== false && (
          <Button
            onClick={() => navigate('/contact')}
            variant="outline"
            className="border-gray-700 text-gray-300 hover:text-white h-14 rounded-xl font-semibold cursor-pointer flex flex-col items-center justify-center gap-0.5"
          >
            <Phone className="w-5 h-5" />
            <span className="text-[10px]">{t('nav.contact')}</span>
          </Button>
          )}
        </div>
        )}

        {/* Featured Items */}
        {settings?.show_popular_items !== false && featuredItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold">{t('home.popular_items')}</h2>
            <button onClick={() => navigate('/menu')} className="text-red-500 text-sm flex items-center gap-1 cursor-pointer">
              {t('home.view_all')} <ChevronRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featuredItems.slice(0, Math.max(2, Math.min(12, Number(settings?.popular_max_items || 6)))).map(item => {
              const sizes = getItemSizes(item);
              const lowestSize = sizes.reduce((lowest, size) => size.price < lowest.price ? size : lowest, sizes[0]);
              const lowestPrice = lowestSize?.price || 0;
              const lowestBreakdown = getItemPriceBreakdown(item, lowestPrice);
              return (
                <Card
                  key={item.id}
                  className="bg-gray-900 border-gray-800 overflow-hidden cursor-pointer hover:border-gray-700 transition-colors"
                  onClick={() => navigate('/menu')}
                >
                  <div className="relative">
                    {item.image_url ? (
                      <img
                        src={customerImageUrl(item.image_url)}
                        alt={localizedMenuText(item, language)}
                        className="w-full h-28 object-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                          event.currentTarget.parentElement?.classList.add('bg-gray-800');
                        }}
                      />
                    ) : (
                      <div className="w-full h-28 bg-gray-800 flex items-center justify-center">
                        <span className="text-3xl">🍕</span>
                      </div>
                    )}
                    {lowestBreakdown.discountActive && item.is_active && (
                      <Badge className="absolute top-2 left-2 bg-green-600 text-white text-[10px]">
                        {lowestBreakdown.discountLabel}
                      </Badge>
                    )}
                    {!item.is_active && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <Badge className="bg-red-600 text-white text-xs">{t('home.out_of_stock')}</Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-white text-sm font-semibold truncate">{localizedMenuText(item, language)}</h3>
                    {lowestBreakdown.discountActive ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-gray-500 text-xs line-through">AED {lowestBreakdown.originalPrice.toFixed(2)}</span>
                          <span className="text-green-400 text-sm font-bold">AED {lowestBreakdown.finalPrice.toFixed(2)}</span>
                        </div>
                        <p className="text-green-500 text-[10px]">{lowestBreakdown.discountLabel} • Save AED {lowestBreakdown.saving.toFixed(2)}</p>
                      </div>
                    ) : (
                      <p className="text-red-500 text-sm font-bold mt-1">
                        {t('home.from_aed')} {lowestPrice}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
        )}

        {/* Customer Reviews Section */}
        {settings?.show_reviews !== false && (
        <div className="mb-6">
          <button
            onClick={() => navigate('/reviews')}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <span className="text-white font-semibold text-sm block">{t('home.customer_reviews')}</span>
                <span className="text-gray-500 text-xs">{t('home.reviews_subtitle')}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        )}

        {/* Blog Section */}
        {(settings as any)?.blog_enabled !== false && (
        <div className="mb-6">
          <a
            href="/blog/"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-gray-700 transition-colors block"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-red-500" />
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <span className="text-white font-semibold text-sm block">Blog & Pizza Tips</span>
                <span className="text-gray-500 text-xs">Local food guides & Italian pizza stories</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </a>
        </div>
        )}

        {/* Restaurant Info */}
        {settings?.show_restaurant_info !== false && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-bold text-sm">{t('home.restaurant_info')}</h3>
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-gray-300 text-sm">{settings?.opening_hours || 'Daily 3:00 PM - 2:00 AM'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <p className="text-gray-300 text-sm">{settings?.phone || '+971 54 294 0112'}</p>
          </div>
          <a
            href={shopMapUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-lg -mx-2 px-2 py-1.5 hover:bg-gray-800/70 active:bg-gray-800 cursor-pointer"
            aria-label="Open Fai Fai Juice location in maps"
          >
            <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-gray-300 text-sm underline underline-offset-2">{settings?.address || 'Murbah, Fujairah, UAE'}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">Tap to open shop location</p>
            </div>
          </a>
        </div>
        )}
      </div>

      {/* Bottom Navigation */}
      {settings?.show_bottom_nav !== false && (
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 z-50">
        <div className="max-w-lg mx-auto flex items-center justify-around py-3">
          <button onClick={() => navigate('/')} className="flex flex-col items-center gap-1 cursor-pointer">
            <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">V</span>
            </div>
            <span className="text-red-500 text-[10px] font-medium">{t('nav.home')}</span>
          </button>
          <button onClick={() => navigate('/menu')} className="flex flex-col items-center gap-1 cursor-pointer">
            <ShoppingBag className="w-5 h-5 text-gray-500" />
            <span className="text-gray-500 text-[10px]">{t('nav.menu')}</span>
          </button>
          <button onClick={() => navigate('/my-orders')} className="flex flex-col items-center gap-1 cursor-pointer">
            <Clock className="w-5 h-5 text-gray-500" />
            <span className="text-gray-500 text-[10px]">{t('nav.orders')}</span>
          </button>
          <button onClick={() => navigate('/feedback')} className="flex flex-col items-center gap-1 cursor-pointer">
            <MessageSquare className="w-5 h-5 text-gray-500" />
            <span className="text-gray-500 text-[10px]">{t('nav.feedback')}</span>
          </button>
        </div>
      </nav>
      )}
    </div>
  );
}
