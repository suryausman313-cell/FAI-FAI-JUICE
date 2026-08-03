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
    'menu.quantity': 'Quantity',
    'menu.size': 'Size',
    'menu.regular': 'Regular',
    'menu.deal': 'Deal',

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
    'cart.size': 'Size',
    'cart.service_fee_note': 'Service fee and other charges will be shown at checkout',

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
    'checkout.name_placeholder': 'Enter your name',
    'checkout.phone_placeholder': 'Enter your phone number',
    'checkout.delivery_address_placeholder': 'Enter building, street and area',
    'checkout.cash_on_pickup': 'Cash on Pickup',
    'checkout.card_on_pickup': 'Card on Pickup',
    'checkout.cash_on_delivery': 'Cash on Delivery',
    'checkout.card_on_delivery': 'Card on Delivery',
    'checkout.pay_cash_collect': 'Pay cash when you collect',
    'checkout.pay_card_collect': 'Pay by card when you collect',
    'checkout.pay_cash_rider': 'Pay cash when the rider arrives',
    'checkout.pay_card_rider': 'Pay by card when the rider arrives',
    'checkout.notes_placeholder': 'Add any instructions for the restaurant',
    'checkout.promo_placeholder': 'Enter promo code',
    'checkout.applying': 'Applying...',
    'checkout.service_fee': 'Service Fee',
    'checkout.small_order_fee': 'Small Order Fee',
    'checkout.tip': 'Tip',
    'checkout.subtotal': 'Subtotal',
    'checkout.total': 'Total',
    'checkout.getting_location': 'Getting location...',
    'checkout.location_selected': 'Delivery location selected',
    'checkout.select_location': 'Select your delivery location on the map',
    'checkout.delivery_not_available': 'Delivery is not available at this location.',
    'checkout.restaurant_closed': 'Restaurant is closed',
    'checkout.login_first': 'Please login first',
    'checkout.fix_fields': 'Please fix the highlighted fields',
    'checkout.enter_promo': 'Please enter a promo code',
    'checkout.invalid_promo': 'Invalid or expired promo code',
    'checkout.promo_applied': 'Promo applied',
    'checkout.location_unsupported': 'Location service is not supported. Tap the map manually.',
    'checkout.location_denied': 'Location permission denied. Tap the map manually.',
    'checkout.no_payment': 'No payment method is available',
    'checkout.cart_empty': 'Your cart is empty',
    'checkout.valid_phone': 'Please enter a valid phone number',
    'checkout.enter_name': 'Please enter your name',
    'checkout.login_required': 'Please login to place your order',
    'checkout.order_success': 'Order placed successfully!',

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
    'orders.active_orders': 'Active Orders',
    'orders.past_orders': 'Past Orders',
    'orders.order': 'Order',
    'orders.items': 'Items',
    'orders.delivery': 'Delivery',
    'orders.pickup': 'Pickup',
    'orders.delivery_charge': 'Delivery',
    'orders.tip': 'Tip',
    'orders.status.picked_up': 'Picked Up',
    'orders.status.on_the_way': 'On the Way',
    'orders.status.delivered': 'Delivered',
    'orders.current_status': 'Current status',
    'orders.estimated_ready_time': 'Estimated ready time',
    'orders.track_live_map': 'Track Live on Map',
    'orders.waiting_accept': 'Waiting for restaurant to accept',
    'orders.minutes_elapsed': 'min elapsed',
    'orders.usually_accepted': 'Usually accepted within',
    'orders.restaurant_not_accepted': 'Restaurant has not accepted your order yet',
    'orders.auto_cancel_in': 'Auto-cancel in',
    'orders.whatsapp_restaurant': 'WhatsApp Restaurant',
    'orders.expired_title': 'Order expired — Restaurant did not accept',
    'orders.expired_subtitle': 'minutes wait • Order auto-cancelled',
    'orders.cancel_order': 'Cancel Order',
    'orders.cancel_question': 'Are you sure you want to cancel this order?',
    'orders.reason_optional': 'Reason (optional)',
    'orders.reason_placeholder': 'e.g. Changed my mind, taking too long...',
    'orders.keep_order': 'Keep Order',
    'orders.yes_cancel': 'Yes, Cancel',
    'orders.cancelling': 'Cancelling...',
    'orders.order_again': 'Order Again',
    'orders.leave_review': 'Leave Review',
    'orders.login_required': 'Login Required',
    'orders.login_message': 'Please login to view your orders',
    'orders.login_signup': 'Login / Sign Up',
    'orders.date_unavailable': 'Date unavailable',
    'orders.failed_cancel': 'Failed to cancel order',
    'orders.eta_waiting_gps': 'Waiting for rider GPS to show the exact time',
    'orders.eta_live_location': "Live ETA updates from the rider's location",
    'orders.whatsapp_pending_message': 'Hello, I placed Order #{orderId}. It has not been accepted yet. Could you please check it?',
    'orders.elapsed_auto_cancel': '{elapsed} min elapsed • Auto-cancel in {remaining} min',
    'orders.ready_confirmed_title': 'Order is ready',
    'orders.ready_confirmed_subtitle': 'The shop confirmed that your order is ready.',
    'orders.estimated_time_passed': 'Estimated time passed',
    'orders.ready_waiting_update': 'Ready status is not confirmed yet. Waiting for a kitchen update.',
    'orders.ready_in': 'Ready in {time}',
    'orders.expected_around': 'Expected around {time}',

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
    'menu.quantity': 'الكمية',
    'menu.size': 'الحجم',
    'menu.regular': 'عادي',
    'menu.deal': 'عرض',

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
    'cart.size': 'الحجم',
    'cart.service_fee_note': 'ستظهر رسوم الخدمة والرسوم الأخرى عند إتمام الطلب',

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
    'checkout.name_placeholder': 'أدخل اسمك',
    'checkout.phone_placeholder': 'أدخل رقم هاتفك',
    'checkout.delivery_address_placeholder': 'أدخل المبنى والشارع والمنطقة',
    'checkout.cash_on_pickup': 'نقداً عند الاستلام',
    'checkout.card_on_pickup': 'بطاقة عند الاستلام',
    'checkout.cash_on_delivery': 'نقداً عند التوصيل',
    'checkout.card_on_delivery': 'بطاقة عند التوصيل',
    'checkout.pay_cash_collect': 'ادفع نقداً عند استلام طلبك',
    'checkout.pay_card_collect': 'ادفع بالبطاقة عند استلام طلبك',
    'checkout.pay_cash_rider': 'ادفع نقداً عند وصول السائق',
    'checkout.pay_card_rider': 'ادفع بالبطاقة عند وصول السائق',
    'checkout.notes_placeholder': 'أضف أي تعليمات للمطعم',
    'checkout.promo_placeholder': 'أدخل كود الخصم',
    'checkout.applying': 'جارٍ التطبيق...',
    'checkout.service_fee': 'رسوم الخدمة',
    'checkout.small_order_fee': 'رسوم الطلب الصغير',
    'checkout.tip': 'إكرامية',
    'checkout.subtotal': 'المجموع الفرعي',
    'checkout.total': 'المجموع',
    'checkout.getting_location': 'جارٍ تحديد الموقع...',
    'checkout.location_selected': 'تم تحديد موقع التوصيل',
    'checkout.select_location': 'حدد موقع التوصيل على الخريطة',
    'checkout.delivery_not_available': 'التوصيل غير متوفر في هذا الموقع.',
    'checkout.restaurant_closed': 'المطعم مغلق',
    'checkout.login_first': 'يرجى تسجيل الدخول أولاً',
    'checkout.fix_fields': 'يرجى تصحيح الحقول المحددة',
    'checkout.enter_promo': 'يرجى إدخال كود الخصم',
    'checkout.invalid_promo': 'كود الخصم غير صالح أو منتهي',
    'checkout.promo_applied': 'تم تطبيق الخصم',
    'checkout.location_unsupported': 'خدمة الموقع غير مدعومة. حدد الموقع يدوياً على الخريطة.',
    'checkout.location_denied': 'تم رفض إذن الموقع. حدد الموقع يدوياً على الخريطة.',
    'checkout.no_payment': 'لا توجد طريقة دفع متاحة',
    'checkout.cart_empty': 'سلة التسوق فارغة',
    'checkout.valid_phone': 'يرجى إدخال رقم هاتف صحيح',
    'checkout.enter_name': 'يرجى إدخال اسمك',
    'checkout.login_required': 'يرجى تسجيل الدخول لتقديم الطلب',
    'checkout.order_success': 'تم تقديم الطلب بنجاح!',

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
    'orders.active_orders': 'الطلبات الحالية',
    'orders.past_orders': 'الطلبات السابقة',
    'orders.order': 'طلب',
    'orders.items': 'الأصناف',
    'orders.delivery': 'توصيل',
    'orders.pickup': 'استلام',
    'orders.delivery_charge': 'التوصيل',
    'orders.tip': 'الإكرامية',
    'orders.status.picked_up': 'تم الاستلام',
    'orders.status.on_the_way': 'في الطريق',
    'orders.status.delivered': 'تم التوصيل',
    'orders.current_status': 'الحالة الحالية',
    'orders.estimated_ready_time': 'وقت الجاهزية المتوقع',
    'orders.track_live_map': 'تتبع مباشر على الخريطة',
    'orders.waiting_accept': 'بانتظار قبول المطعم',
    'orders.minutes_elapsed': 'دقيقة مضت',
    'orders.usually_accepted': 'عادةً يتم القبول خلال',
    'orders.restaurant_not_accepted': 'لم يقبل المطعم طلبك بعد',
    'orders.auto_cancel_in': 'الإلغاء التلقائي خلال',
    'orders.whatsapp_restaurant': 'واتساب المطعم',
    'orders.expired_title': 'انتهت صلاحية الطلب — لم يقبل المطعم',
    'orders.expired_subtitle': 'دقيقة انتظار • تم إلغاء الطلب تلقائياً',
    'orders.cancel_order': 'إلغاء الطلب',
    'orders.cancel_question': 'هل أنت متأكد أنك تريد إلغاء هذا الطلب؟',
    'orders.reason_optional': 'السبب (اختياري)',
    'orders.reason_placeholder': 'مثال: غيرت رأيي أو استغرق وقتاً طويلاً...',
    'orders.keep_order': 'الاحتفاظ بالطلب',
    'orders.yes_cancel': 'نعم، إلغاء',
    'orders.cancelling': 'جارٍ الإلغاء...',
    'orders.order_again': 'اطلب مرة أخرى',
    'orders.leave_review': 'اترك تقييماً',
    'orders.login_required': 'تسجيل الدخول مطلوب',
    'orders.login_message': 'يرجى تسجيل الدخول لعرض طلباتك',
    'orders.login_signup': 'تسجيل الدخول / إنشاء حساب',
    'orders.date_unavailable': 'التاريخ غير متوفر',
    'orders.failed_cancel': 'فشل إلغاء الطلب',
    'orders.eta_waiting_gps': 'سيظهر الوقت الدقيق عند توفر موقع السائق',
    'orders.eta_live_location': 'يتم تحديث وقت الوصول مباشرةً من موقع السائق',
    'orders.whatsapp_pending_message': 'مرحباً، قدمت الطلب رقم #{orderId}. لم يتم قبوله بعد. هل يمكنكم التحقق منه؟',
    'orders.elapsed_auto_cancel': 'مرّت {elapsed} دقيقة • الإلغاء التلقائي خلال {remaining} دقيقة',
    'orders.ready_confirmed_title': 'الطلب جاهز',
    'orders.ready_confirmed_subtitle': 'أكد المتجر أن طلبك جاهز.',
    'orders.estimated_time_passed': 'انتهى الوقت المتوقع',
    'orders.ready_waiting_update': 'لم يتم تأكيد الجاهزية بعد. بانتظار تحديث المطبخ.',
    'orders.ready_in': 'جاهز خلال {time}',
    'orders.expected_around': 'متوقع حوالي {time}',

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
    'menu.quantity': 'مقدار',
    'menu.size': 'سائز',
    'menu.regular': 'ریگولر',
    'menu.deal': 'ڈیل',

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
    'cart.size': 'سائز',
    'cart.service_fee_note': 'سروس فیس اور دوسرے چارجز چیک آؤٹ پر دکھائے جائیں گے',

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
    'checkout.name_placeholder': 'اپنا نام درج کریں',
    'checkout.phone_placeholder': 'اپنا فون نمبر درج کریں',
    'checkout.delivery_address_placeholder': 'عمارت، گلی اور علاقہ درج کریں',
    'checkout.cash_on_pickup': 'پک اپ پر نقد',
    'checkout.card_on_pickup': 'پک اپ پر کارڈ',
    'checkout.cash_on_delivery': 'ڈیلیوری پر نقد',
    'checkout.card_on_delivery': 'ڈیلیوری پر کارڈ',
    'checkout.pay_cash_collect': 'آرڈر لیتے وقت نقد ادا کریں',
    'checkout.pay_card_collect': 'آرڈر لیتے وقت کارڈ سے ادا کریں',
    'checkout.pay_cash_rider': 'رائیڈر آنے پر نقد ادا کریں',
    'checkout.pay_card_rider': 'رائیڈر آنے پر کارڈ سے ادا کریں',
    'checkout.notes_placeholder': 'ریستوراں کے لیے ہدایات لکھیں',
    'checkout.promo_placeholder': 'پرومو کوڈ درج کریں',
    'checkout.applying': 'لاگو ہو رہا ہے...',
    'checkout.service_fee': 'سروس فیس',
    'checkout.small_order_fee': 'چھوٹے آرڈر کی فیس',
    'checkout.tip': 'ٹپ',
    'checkout.subtotal': 'ذیلی کل',
    'checkout.total': 'کل',
    'checkout.getting_location': 'مقام حاصل ہو رہا ہے...',
    'checkout.location_selected': 'ڈیلیوری کا مقام منتخب ہو گیا',
    'checkout.select_location': 'نقشے پر ڈیلیوری کا مقام منتخب کریں',
    'checkout.delivery_not_available': 'اس مقام پر ڈیلیوری دستیاب نہیں۔',
    'checkout.restaurant_closed': 'ریستوراں بند ہے',
    'checkout.login_first': 'پہلے لاگ اِن کریں',
    'checkout.fix_fields': 'نشان زدہ خانے درست کریں',
    'checkout.enter_promo': 'پرومو کوڈ درج کریں',
    'checkout.invalid_promo': 'پرومو کوڈ غلط یا ختم ہو چکا ہے',
    'checkout.promo_applied': 'پرومو لاگو ہو گیا',
    'checkout.location_unsupported': 'لوکیشن سروس دستیاب نہیں۔ نقشے پر خود مقام منتخب کریں۔',
    'checkout.location_denied': 'لوکیشن کی اجازت نہیں ملی۔ نقشے پر خود مقام منتخب کریں۔',
    'checkout.no_payment': 'ادائیگی کا کوئی طریقہ دستیاب نہیں',
    'checkout.cart_empty': 'آپ کا کارٹ خالی ہے',
    'checkout.valid_phone': 'درست فون نمبر درج کریں',
    'checkout.enter_name': 'اپنا نام درج کریں',
    'checkout.login_required': 'آرڈر دینے کے لیے لاگ اِن کریں',
    'checkout.order_success': 'آرڈر کامیابی سے دے دیا گیا!',

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
    'orders.active_orders': 'چل رہے آرڈرز',
    'orders.past_orders': 'پرانے آرڈرز',
    'orders.order': 'آرڈر',
    'orders.items': 'آئٹمز',
    'orders.delivery': 'ڈیلیوری',
    'orders.pickup': 'پک اپ',
    'orders.delivery_charge': 'ڈیلیوری',
    'orders.tip': 'ٹپ',
    'orders.status.picked_up': 'رائیڈر نے لے لیا',
    'orders.status.on_the_way': 'راستے میں',
    'orders.status.delivered': 'ڈیلیور ہو گیا',
    'orders.current_status': 'موجودہ حالت',
    'orders.estimated_ready_time': 'متوقع تیاری کا وقت',
    'orders.track_live_map': 'نقشے پر لائیو ٹریک کریں',
    'orders.waiting_accept': 'ریستوراں کے قبول کرنے کا انتظار ہے',
    'orders.minutes_elapsed': 'منٹ گزر گئے',
    'orders.usually_accepted': 'عام طور پر اتنے وقت میں قبول ہوتا ہے',
    'orders.restaurant_not_accepted': 'ریستوراں نے ابھی تک آپ کا آرڈر قبول نہیں کیا',
    'orders.auto_cancel_in': 'خودکار منسوخی',
    'orders.whatsapp_restaurant': 'ریستوراں کو واٹس ایپ کریں',
    'orders.expired_title': 'آرڈر ختم ہو گیا — ریستوراں نے قبول نہیں کیا',
    'orders.expired_subtitle': 'منٹ انتظار • آرڈر خودکار منسوخ ہو گیا',
    'orders.cancel_order': 'آرڈر منسوخ کریں',
    'orders.cancel_question': 'کیا آپ واقعی یہ آرڈر منسوخ کرنا چاہتے ہیں؟',
    'orders.reason_optional': 'وجہ (اختیاری)',
    'orders.reason_placeholder': 'مثلاً ارادہ بدل گیا یا بہت دیر ہو رہی ہے...',
    'orders.keep_order': 'آرڈر برقرار رکھیں',
    'orders.yes_cancel': 'ہاں، منسوخ کریں',
    'orders.cancelling': 'منسوخ ہو رہا ہے...',
    'orders.order_again': 'دوبارہ آرڈر کریں',
    'orders.leave_review': 'جائزہ دیں',
    'orders.login_required': 'لاگ اِن ضروری ہے',
    'orders.login_message': 'اپنے آرڈرز دیکھنے کے لیے لاگ اِن کریں',
    'orders.login_signup': 'لاگ اِن / سائن اپ',
    'orders.date_unavailable': 'تاریخ دستیاب نہیں',
    'orders.failed_cancel': 'آرڈر منسوخ نہیں ہو سکا',
    'orders.eta_waiting_gps': 'رائیڈر کا GPS ملتے ہی درست وقت دکھایا جائے گا',
    'orders.eta_live_location': 'لائیو ETA رائیڈر کی لوکیشن سے اپ ڈیٹ ہوتا ہے',
    'orders.whatsapp_pending_message': 'سلام، میں نے آرڈر #{orderId} دیا ہے۔ ابھی تک قبول نہیں ہوا۔ براہ کرم چیک کریں۔',
    'orders.elapsed_auto_cancel': '{elapsed} منٹ گزر گئے • {remaining} منٹ میں خودکار منسوخی',
    'orders.ready_confirmed_title': 'آرڈر تیار ہے',
    'orders.ready_confirmed_subtitle': 'شاپ نے تصدیق کر دی ہے کہ آپ کا آرڈر تیار ہے۔',
    'orders.estimated_time_passed': 'متوقع وقت گزر گیا',
    'orders.ready_waiting_update': 'ابھی تک تیاری کی تصدیق نہیں ہوئی۔ کچن کی اپ ڈیٹ کا انتظار ہے۔',
    'orders.ready_in': '{time} میں تیار',
    'orders.expected_around': 'تقریباً {time} پر متوقع',

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
    return saved === 'en' || saved === 'ar' || saved === 'ur' ? saved : 'en';
  });
  const [hasChosenLanguage, setHasChosenLanguage] = useState(() => {
    return localStorage.getItem('language_chosen') === 'true';
  });

  const langInfo = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    document.documentElement.dir = langInfo.dir;
    document.documentElement.lang = language;
    document.body.dir = langInfo.dir;
    document.body.setAttribute('data-language', language);
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
