import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'ar' | 'ur';

export interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇦🇪' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl', flag: '🇵🇰' },
];

// Translation keys
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.menu': 'Menu',
    'nav.cart': 'Cart',
    'nav.orders': 'Orders',
    'nav.feedback': 'Feedback',
    'nav.contact': 'Contact',
    'nav.reviews': 'Reviews',

    // Homepage
    'home.tagline': 'Authentic Italian Pizza',
    'home.special_offers': 'Special Offers',
    'home.popular_items': 'Popular Items',
    'home.view_all': 'View All',
    'home.restaurant_info': 'Restaurant Info',
    'home.customer_reviews': 'Customer Reviews',
    'home.reviews_subtitle': 'See what our customers say about us',
    'home.open_now': 'Open Now',
    'home.busy': 'Busy',
    'home.closed': 'Closed',
    'home.closed_message': 'Sorry, Vita Napoli Pizza is currently closed.',
    'home.closed_subtitle': 'You can browse the menu but cannot place orders.',
    'home.from_aed': 'From AED',
    'home.out_of_stock': 'Out of Stock',
    'home.my_orders': 'My Orders',
    'home.loading': 'Loading...',

    // Menu
    'menu.title': 'Our Menu',
    'menu.search': 'Search menu...',
    'menu.all': 'All',
    'menu.add_to_cart': 'Add to Cart',
    'menu.select_size': 'Select Size',
    'menu.extras': 'Extras & Toppings',
    'menu.added': 'Added to cart!',
    'menu.no_items': 'No items found',

    // Cart
    'cart.title': 'Your Cart',
    'cart.empty': 'Your cart is empty',
    'cart.empty_subtitle': 'Add some delicious items from our menu',
    'cart.browse_menu': 'Browse Menu',
    'cart.subtotal': 'Subtotal',
    'cart.total': 'Total',
    'cart.checkout': 'Proceed to Checkout',
    'cart.remove': 'Remove',
    'cart.clear_all': 'Clear All',

    // Checkout
    'checkout.title': 'Checkout',
    'checkout.your_name': 'Your Name',
    'checkout.phone': 'Phone Number',
    'checkout.order_type': 'Order Type',
    'checkout.pickup': 'Pickup',
    'checkout.delivery': 'Delivery',
    'checkout.delivery_address': 'Delivery Address',
    'checkout.payment_method': 'Payment Method',
    'checkout.cash': 'Cash',
    'checkout.card': 'Card',
    'checkout.order_notes': 'Order Notes (optional)',
    'checkout.promo_code': 'Promo Code',
    'checkout.apply': 'Apply',
    'checkout.place_order': 'Place Order',
    'checkout.placing': 'Placing Order...',
    'checkout.car_number': 'Car Number/Color',
    'checkout.car_placeholder': 'e.g. White Toyota ABC 1234',
    'checkout.delivery_charge': 'Delivery Charge',
    'checkout.discount': 'Discount',
    'checkout.drop_pin': 'Drop pin on map for delivery location',
    'checkout.my_location': 'My Location',
    'checkout.near_zone': 'Near Zone',
    'checkout.far_zone': 'Far Zone',
    'checkout.outside_zone': 'Outside delivery zone',

    // Orders
    'orders.title': 'My Orders',
    'orders.no_orders': 'No orders yet',
    'orders.no_orders_subtitle': 'Your order history will appear here',
    'orders.status.new': 'New',
    'orders.status.accepted': 'Accepted',
    'orders.status.preparing': 'Preparing',
    'orders.status.ready': 'Ready',
    'orders.status.completed': 'Completed',
    'orders.status.cancelled': 'Cancelled',
    'orders.track_delivery': 'Track Delivery',
    'orders.rider': 'Rider',
    'orders.call': 'Call',
    'orders.whatsapp': 'WhatsApp',

    // Feedback
    'feedback.title': 'Leave Feedback',
    'feedback.rate': 'Rate your experience',
    'feedback.comment': 'Your comments (optional)',
    'feedback.submit': 'Submit Feedback',
    'feedback.thank_you': 'Thank you for your feedback!',
    'feedback.select_order': 'Select an order',

    // Reviews
    'reviews.title': 'Customer Reviews',
    'reviews.no_reviews': 'No reviews yet',

    // Contact
    'contact.title': 'Contact Us',
    'contact.find_us': 'Find Us',
    'contact.hours': 'Opening Hours',
    'contact.phone': 'Phone',
    'contact.address': 'Address',
    'contact.directions': 'Get Directions',

    // Language
    'lang.title': 'Choose Language',
    'lang.subtitle': 'Select your preferred language',
    'lang.change': 'Language',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.aed': 'AED',
  },
  ar: {
    // Navigation
    'nav.home': 'الرئيسية',
    'nav.menu': 'القائمة',
    'nav.cart': 'السلة',
    'nav.orders': 'الطلبات',
    'nav.feedback': 'التقييم',
    'nav.contact': 'اتصل بنا',
    'nav.reviews': 'المراجعات',

    // Homepage
    'home.tagline': 'بيتزا إيطالية أصلية',
    'home.special_offers': 'عروض خاصة',
    'home.popular_items': 'الأصناف المميزة',
    'home.view_all': 'عرض الكل',
    'home.restaurant_info': 'معلومات المطعم',
    'home.customer_reviews': 'تقييمات العملاء',
    'home.reviews_subtitle': 'شاهد ما يقوله عملاؤنا عنا',
    'home.open_now': 'مفتوح الآن',
    'home.busy': 'مشغول',
    'home.closed': 'مغلق',
    'home.closed_message': 'عذراً، فيتا نابولي بيتزا مغلق حالياً.',
    'home.closed_subtitle': 'يمكنك تصفح القائمة لكن لا يمكنك تقديم طلبات.',
    'home.from_aed': 'من د.إ',
    'home.out_of_stock': 'غير متوفر',
    'home.my_orders': 'طلباتي',
    'home.loading': 'جاري التحميل...',

    // Menu
    'menu.title': 'قائمة الطعام',
    'menu.search': 'ابحث في القائمة...',
    'menu.all': 'الكل',
    'menu.add_to_cart': 'أضف للسلة',
    'menu.select_size': 'اختر الحجم',
    'menu.extras': 'إضافات',
    'menu.added': 'تمت الإضافة للسلة!',
    'menu.no_items': 'لا توجد أصناف',

    // Cart
    'cart.title': 'سلة التسوق',
    'cart.empty': 'السلة فارغة',
    'cart.empty_subtitle': 'أضف بعض الأصناف اللذيذة من قائمتنا',
    'cart.browse_menu': 'تصفح القائمة',
    'cart.subtotal': 'المجموع الفرعي',
    'cart.total': 'المجموع',
    'cart.checkout': 'إتمام الطلب',
    'cart.remove': 'إزالة',
    'cart.clear_all': 'مسح الكل',

    // Checkout
    'checkout.title': 'إتمام الطلب',
    'checkout.your_name': 'اسمك',
    'checkout.phone': 'رقم الهاتف',
    'checkout.order_type': 'نوع الطلب',
    'checkout.pickup': 'استلام',
    'checkout.delivery': 'توصيل',
    'checkout.delivery_address': 'عنوان التوصيل',
    'checkout.payment_method': 'طريقة الدفع',
    'checkout.cash': 'نقداً',
    'checkout.card': 'بطاقة',
    'checkout.order_notes': 'ملاحظات الطلب (اختياري)',
    'checkout.promo_code': 'كود الخصم',
    'checkout.apply': 'تطبيق',
    'checkout.place_order': 'تأكيد الطلب',
    'checkout.placing': 'جاري تقديم الطلب...',
    'checkout.car_number': 'رقم/لون السيارة',
    'checkout.car_placeholder': 'مثال: تويوتا بيضاء ABC 1234',
    'checkout.delivery_charge': 'رسوم التوصيل',
    'checkout.discount': 'خصم',
    'checkout.drop_pin': 'حدد موقع التوصيل على الخريطة',
    'checkout.my_location': 'موقعي',
    'checkout.near_zone': 'منطقة قريبة',
    'checkout.far_zone': 'منطقة بعيدة',
    'checkout.outside_zone': 'خارج نطاق التوصيل',

    // Orders
    'orders.title': 'طلباتي',
    'orders.no_orders': 'لا توجد طلبات بعد',
    'orders.no_orders_subtitle': 'سيظهر سجل طلباتك هنا',
    'orders.status.new': 'جديد',
    'orders.status.accepted': 'مقبول',
    'orders.status.preparing': 'قيد التحضير',
    'orders.status.ready': 'جاهز',
    'orders.status.completed': 'مكتمل',
    'orders.status.cancelled': 'ملغي',
    'orders.track_delivery': 'تتبع التوصيل',
    'orders.rider': 'السائق',
    'orders.call': 'اتصال',
    'orders.whatsapp': 'واتساب',

    // Feedback
    'feedback.title': 'اترك تقييمك',
    'feedback.rate': 'قيّم تجربتك',
    'feedback.comment': 'تعليقاتك (اختياري)',
    'feedback.submit': 'إرسال التقييم',
    'feedback.thank_you': 'شكراً لتقييمك!',
    'feedback.select_order': 'اختر طلباً',

    // Reviews
    'reviews.title': 'تقييمات العملاء',
    'reviews.no_reviews': 'لا توجد تقييمات بعد',

    // Contact
    'contact.title': 'اتصل بنا',
    'contact.find_us': 'موقعنا',
    'contact.hours': 'ساعات العمل',
    'contact.phone': 'الهاتف',
    'contact.address': 'العنوان',
    'contact.directions': 'احصل على الاتجاهات',

    // Language
    'lang.title': 'اختر اللغة',
    'lang.subtitle': 'اختر لغتك المفضلة',
    'lang.change': 'اللغة',

    // Common
    'common.loading': 'جاري التحميل...',
    'common.error': 'حدث خطأ ما',
    'common.retry': 'إعادة المحاولة',
    'common.close': 'إغلاق',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.confirm': 'تأكيد',
    'common.aed': 'د.إ',
  },
  ur: {
    // Navigation
    'nav.home': 'ہوم',
    'nav.menu': 'مینو',
    'nav.cart': 'کارٹ',
    'nav.orders': 'آرڈرز',
    'nav.feedback': 'رائے',
    'nav.contact': 'رابطہ',
    'nav.reviews': 'جائزے',

    // Homepage
    'home.tagline': 'اصلی اطالوی پیزا',
    'home.special_offers': 'خصوصی آفرز',
    'home.popular_items': 'مقبول آئٹمز',
    'home.view_all': 'سب دیکھیں',
    'home.restaurant_info': 'ریستوراں کی معلومات',
    'home.customer_reviews': 'صارفین کے جائزے',
    'home.reviews_subtitle': 'دیکھیں ہمارے صارفین ہمارے بارے میں کیا کہتے ہیں',
    'home.open_now': 'ابھی کھلا ہے',
    'home.busy': 'مصروف',
    'home.closed': 'بند',
    'home.closed_message': 'معذرت، ویٹا نیپولی پیزا ابھی بند ہے۔',
    'home.closed_subtitle': 'آپ مینو دیکھ سکتے ہیں لیکن آرڈر نہیں دے سکتے۔',
    'home.from_aed': 'سے AED',
    'home.out_of_stock': 'دستیاب نہیں',
    'home.my_orders': 'میرے آرڈرز',
    'home.loading': 'لوڈ ہو رہا ہے...',

    // Menu
    'menu.title': 'ہمارا مینو',
    'menu.search': 'مینو میں تلاش کریں...',
    'menu.all': 'سب',
    'menu.add_to_cart': 'کارٹ میں شامل کریں',
    'menu.select_size': 'سائز منتخب کریں',
    'menu.extras': 'اضافی آئٹمز',
    'menu.added': 'کارٹ میں شامل ہو گیا!',
    'menu.no_items': 'کوئی آئٹم نہیں ملا',

    // Cart
    'cart.title': 'آپ کا کارٹ',
    'cart.empty': 'آپ کا کارٹ خالی ہے',
    'cart.empty_subtitle': 'ہمارے مینو سے کچھ لذیذ آئٹمز شامل کریں',
    'cart.browse_menu': 'مینو دیکھیں',
    'cart.subtotal': 'ذیلی کل',
    'cart.total': 'کل',
    'cart.checkout': 'چیک آؤٹ',
    'cart.remove': 'ہٹائیں',
    'cart.clear_all': 'سب صاف کریں',

    // Checkout
    'checkout.title': 'چیک آؤٹ',
    'checkout.your_name': 'آپ کا نام',
    'checkout.phone': 'فون نمبر',
    'checkout.order_type': 'آرڈر کی قسم',
    'checkout.pickup': 'پک اپ',
    'checkout.delivery': 'ڈیلیوری',
    'checkout.delivery_address': 'ڈیلیوری کا پتہ',
    'checkout.payment_method': 'ادائیگی کا طریقہ',
    'checkout.cash': 'نقد',
    'checkout.card': 'کارڈ',
    'checkout.order_notes': 'آرڈر نوٹس (اختیاری)',
    'checkout.promo_code': 'پرومو کوڈ',
    'checkout.apply': 'لاگو کریں',
    'checkout.place_order': 'آرڈر دیں',
    'checkout.placing': 'آرڈر دیا جا رہا ہے...',
    'checkout.car_number': 'گاڑی کا نمبر/رنگ',
    'checkout.car_placeholder': 'مثلاً سفید ٹویوٹا ABC 1234',
    'checkout.delivery_charge': 'ڈیلیوری چارج',
    'checkout.discount': 'رعایت',
    'checkout.drop_pin': 'ڈیلیوری کے لیے نقشے پر پن لگائیں',
    'checkout.my_location': 'میرا مقام',
    'checkout.near_zone': 'قریبی علاقہ',
    'checkout.far_zone': 'دور کا علاقہ',
    'checkout.outside_zone': 'ڈیلیوری کی حد سے باہر',

    // Orders
    'orders.title': 'میرے آرڈرز',
    'orders.no_orders': 'ابھی کوئی آرڈر نہیں',
    'orders.no_orders_subtitle': 'آپ کی آرڈر ہسٹری یہاں دکھائی دے گی',
    'orders.status.new': 'نیا',
    'orders.status.accepted': 'قبول',
    'orders.status.preparing': 'تیار ہو رہا ہے',
    'orders.status.ready': 'تیار',
    'orders.status.completed': 'مکمل',
    'orders.status.cancelled': 'منسوخ',
    'orders.track_delivery': 'ڈیلیوری ٹریک کریں',
    'orders.rider': 'رائیڈر',
    'orders.call': 'کال',
    'orders.whatsapp': 'واٹس ایپ',

    // Feedback
    'feedback.title': 'اپنی رائے دیں',
    'feedback.rate': 'اپنے تجربے کی درجہ بندی کریں',
    'feedback.comment': 'آپ کے تبصرے (اختیاری)',
    'feedback.submit': 'رائے بھیجیں',
    'feedback.thank_you': 'آپ کی رائے کا شکریہ!',
    'feedback.select_order': 'ایک آرڈر منتخب کریں',

    // Reviews
    'reviews.title': 'صارفین کے جائزے',
    'reviews.no_reviews': 'ابھی کوئی جائزے نہیں',

    // Contact
    'contact.title': 'ہم سے رابطہ کریں',
    'contact.find_us': 'ہمیں تلاش کریں',
    'contact.hours': 'اوقات کار',
    'contact.phone': 'فون',
    'contact.address': 'پتہ',
    'contact.directions': 'راستہ حاصل کریں',

    // Language
    'lang.title': 'زبان منتخب کریں',
    'lang.subtitle': 'اپنی پسندیدہ زبان منتخب کریں',
    'lang.change': 'زبان',

    // Common
    'common.loading': 'لوڈ ہو رہا ہے...',
    'common.error': 'کچھ غلط ہو گیا',
    'common.retry': 'دوبارہ کوشش کریں',
    'common.close': 'بند کریں',
    'common.save': 'محفوظ کریں',
    'common.cancel': 'منسوخ',
    'common.confirm': 'تصدیق',
    'common.aed': 'AED',
  },
};

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
  hasChosenLanguage: boolean;
  setHasChosenLanguage: (v: boolean) => void;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
  dir: 'ltr',
  isRTL: false,
  hasChosenLanguage: false,
  setHasChosenLanguage: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as Language) || 'en';
  });
  const [hasChosenLanguage, setHasChosenLanguage] = useState(() => {
    return localStorage.getItem('language_chosen') === 'true';
  });

  const langInfo = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    document.documentElement.dir = langInfo.dir;
    document.documentElement.lang = language;
  }, [language, langInfo.dir]);

  function setLanguage(lang: Language) {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
    localStorage.setItem('language_chosen', 'true');
    setHasChosenLanguage(true);
    const info = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
    document.documentElement.dir = info.dir;
    document.documentElement.lang = lang;
  }

  function t(key: string): string {
    return translations[language]?.[key] || translations.en[key] || key;
  }

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        dir: langInfo.dir,
        isRTL: langInfo.dir === 'rtl',
        hasChosenLanguage,
        setHasChosenLanguage,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useTranslation() {
  const { t, language, dir, isRTL } = useContext(I18nContext);
  return { t, language, dir, isRTL };
}