import { toast } from 'sonner';

import { Order } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';
import { paymentDisplayLabel } from '@/lib/payment-display';

export interface ReceiptSettings {
  id?: number;
  printer_ip: string;
  printer_port: number;
  paper_width: '58mm' | '80mm';
  auto_print_on_accept: boolean;

  restaurant_name: string;
  show_logo: boolean;
  logo_url: string;
  header_text: string;
  footer_text: string;

  show_customer_phone: boolean;
  show_customer_address: boolean;
  show_payment_method: boolean;
  show_item_prices: boolean;
  show_order_totals: boolean;
  cut_paper: boolean;
  kitchen_alarm_enabled: boolean;
  kitchen_alarm_audio: string;
  rider_alarm_enabled: boolean;
  rider_alarm_audio: string;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  printer_ip: '192.168.70.125',
  printer_port: 9100,
  paper_width: '80mm',
  auto_print_on_accept: true,

  restaurant_name: 'Fai Fai Juice',
  show_logo: true,
  logo_url: '/fai-fai-receipt-logo.png',
  header_text: 'Shop #18, Murbha St - Al Oroba Club Street\nFujairah, UAE\n052 3187415',
  footer_text: 'Thank you for ordering from Fai Fai Juice!',

  show_customer_phone: true,
  show_customer_address: true,
  show_payment_method: true,
  show_item_prices: false,
  show_order_totals: true,
  cut_paper: true,
  kitchen_alarm_enabled: true,
  kitchen_alarm_audio: '',
  rider_alarm_enabled: true,
  rider_alarm_audio: '',
};

declare global {
  interface Window {
    VitaPrinter?: {
      isAvailable?: () => boolean;
      printReceipt: (payloadJson: string) => string;
    };
  }
}

type PrintMode = 'original' | 'copy';

interface ParsedNotes {
  orderType: 'Pickup' | 'Delivery';
  address: string;
  customerNote: string;
}

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

export async function loadReceiptSettings(): Promise<ReceiptSettings> {
  try {
    const response = await fetch(`${apiBase()}/api/v1/receipt-settings`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Receipt settings request failed (${response.status})`);
    }

    const payload = await response.json();

    return {
      ...DEFAULT_RECEIPT_SETTINGS,
      ...payload,
      printer_port: Number(payload?.printer_port || 9100),
      paper_width: payload?.paper_width === '58mm' ? '58mm' : '80mm',
    };
  } catch (error) {
    console.error('Could not load receipt settings:', error);
    return { ...DEFAULT_RECEIPT_SETTINGS };
  }
}

function parseOrderNotes(value: string | undefined | null): ParsedNotes {
  const raw = String(value || '');
  const parts = raw
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  let orderType: 'Pickup' | 'Delivery' = 'Pickup';
  let address = '';
  const customerParts: string[] = [];

  parts.forEach(part => {
    const lower = part.toLowerCase();

    if (lower.startsWith('order type:')) {
      orderType = lower.includes('delivery') ? 'Delivery' : 'Pickup';
      return;
    }

    if (lower.startsWith('delivery address:')) {
      address = part.split(':').slice(1).join(':').trim();
      return;
    }

    if (
      lower.startsWith('delivery fee:') ||
      lower.startsWith('zone:') ||
      lower.startsWith('gps:')
    ) {
      return;
    }

    customerParts.push(part);
  });

  return {
    orderType,
    address,
    customerNote: customerParts.join(' | '),
  };
}

function parseItems(order: Order): any[] {
  try {
    const items = JSON.parse(order.items_json || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function money(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function itemPrice(item: any): number {
  return money(
    item?.price ??
      item?.totalPrice ??
      item?.total_price ??
      item?.line_total ??
      0,
  );
}


function receiptLogoUrl(settings: ReceiptSettings): string {
  const configured = String(settings.logo_url || '').trim();

  if (configured) {
    try {
      return new URL(configured, window.location.origin).toString();
    } catch {
      return configured;
    }
  }

  return `${window.location.origin}/fai-fai-receipt-logo.png`;
}

function browserReceiptHtml(
  order: Order,
  settings: ReceiptSettings,
  _mode: PrintMode,
): string {
  const notes = parseOrderNotes(order.order_notes);
  const items = parseItems(order);
  const receiptWidth = settings.paper_width === '58mm' ? '52mm' : '74mm';
  const createdAt = new Date(order.created_at);
  const dateText = createdAt.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeText = createdAt.toLocaleTimeString('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const preserveLines = (value: unknown) =>
    escapeHtml(value).replace(/\r?\n/g, '<br />');

  const displayPayment = paymentDisplayLabel(order.payment_method);

  const brandNameHtml = /fai\s*fai\s*juice/i.test(settings.restaurant_name)
    ? '<span class="brand-green">Fai</span> <span class="brand-orange">Fai</span> <span class="brand-black">Juice</span>'
    : escapeHtml(settings.restaurant_name);

  const itemsHtml = items
    .map(item => {
      const extras = Array.isArray(item?.extras) ? item.extras : [];
      const price = itemPrice(item);
      const itemName = `${String(item?.name || 'Item')}${
        item?.size ? ` (${String(item.size)})` : ''
      }`;

      return `
        <div class="item-row">
          <div class="item-qty">${escapeHtml(item?.quantity || 1)}</div>
          <div class="item-main">
            <div class="item-name">${escapeHtml(itemName)}</div>
            ${
              extras.length
                ? `<div class="item-extras">+ ${escapeHtml(extras.join(', '))}</div>`
                : ''
            }
          </div>
          <div class="item-price">${
            settings.show_item_prices ? `AED ${price.toFixed(2)}` : ''
          }</div>
        </div>
      `;
    })
    .join('');

  const feeRows = [
    ['Service Fee', money(order.service_fee)],
    ['Small Order Fee', money(order.small_order_fee)],
    ['Delivery Fee', money(order.delivery_charge)],
    ['Tip', money(order.tip_amount)],
  ]
    .filter(([, amount]) => Number(amount) > 0)
    .map(
      ([label, amount]) => `
        <div class="money-row">
          <span>${escapeHtml(label)}</span>
          <strong>AED ${Number(amount).toFixed(2)}</strong>
        </div>
      `,
    )
    .join('');

  const logoUrl = receiptLogoUrl(settings);
  const logo = settings.show_logo
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(settings.restaurant_name)} logo" />`
    : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order #${order.id}</title>
  <style>
    @page { size: ${settings.paper_width}; margin: 2mm; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body {
      width: 100%;
      max-width: ${receiptWidth};
      margin: 0 auto;
      padding: 2mm 1.5mm 3mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.35;
    }
    .center { text-align: center; }
    .logo {
      display: block;
      width: auto;
      max-width: 37mm;
      max-height: 25mm;
      object-fit: contain;
      margin: 0 auto 2mm;
    }
    .brand {
      text-align: center;
      font-size: 23px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.7px;
      margin: 0 0 1.5mm;
    }
    .brand-green { color: #087a3b; }
    .brand-orange { color: #f05a17; }
    .brand-black { color: #111; }
    .shop-details {
      text-align: center;
      font-size: 10px;
      line-height: 1.45;
      margin-bottom: 3mm;
    }
    .solid-line { border-top: 1.5px solid #111; margin: 2.5mm 0; }
    .dash-line { border-top: 1px dashed #555; margin: 2mm 0; }
    .order-number {
      text-align: center;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.2px;
      margin: 1.5mm 0;
    }
    .detail-row {
      display: grid;
      grid-template-columns: 27mm 1fr;
      gap: 2mm;
      margin: 1.1mm 0;
      align-items: start;
    }
    .detail-label { font-weight: 700; }
    .detail-value { text-align: right; overflow-wrap: anywhere; }
    .table-head {
      display: grid;
      grid-template-columns: 10mm 1fr 24mm;
      gap: 1mm;
      background: #111;
      color: #fff;
      border-radius: 1.5mm;
      padding: 2mm 1.5mm;
      margin-top: 2.5mm;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .table-head div:last-child { text-align: right; }
    .item-row {
      display: grid;
      grid-template-columns: 10mm 1fr 24mm;
      gap: 1mm;
      align-items: start;
      padding: 2.4mm 1.5mm;
      border-bottom: 1px dashed #777;
    }
    .item-qty { font-size: 12px; font-weight: 800; }
    .item-name { font-size: 12px; font-weight: 900; }
    .item-extras { margin-top: 0.8mm; font-size: 9px; font-weight: 600; }
    .item-price { text-align: right; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .money-row {
      display: flex;
      justify-content: space-between;
      gap: 4mm;
      margin: 1.5mm 0;
      font-size: 11px;
    }
    .grand-total {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 3mm;
      border-top: 1.5px solid #111;
      border-bottom: 1.5px solid #111;
      padding: 2.5mm 0;
      margin-top: 2.5mm;
      font-weight: 900;
    }
    .grand-total .label { font-size: 17px; }
    .grand-total .amount { font-size: 22px; white-space: nowrap; }
    .footer {
      text-align: center;
      margin-top: 4mm;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
    }
    @media print {
      body { max-width: ${receiptWidth}; }
    }
  </style>
</head>
<body>
  ${logo}
  <div class="brand">${brandNameHtml}</div>
  <div class="shop-details">${preserveLines(settings.header_text)}</div>

  <div class="solid-line"></div>
  <div class="order-number">ORDER #${order.id}</div>
  <div class="solid-line"></div>

  <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${escapeHtml(dateText)}</span></div>
  <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${escapeHtml(timeText)}</span></div>
  <div class="detail-row"><span class="detail-label">Order Type</span><span class="detail-value">${escapeHtml(notes.orderType)}</span></div>
  ${
    settings.show_payment_method
      ? `<div class="detail-row"><span class="detail-label">Payment</span><span class="detail-value">${escapeHtml(displayPayment)}</span></div>`
      : ''
  }

  <div class="dash-line"></div>
  <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${escapeHtml(order.customer_name || 'Customer')}</span></div>
  ${
    settings.show_customer_phone
      ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(order.customer_phone || '')}</span></div>`
      : ''
  }

  <div class="table-head"><div>Qty</div><div>Item</div><div>Price</div></div>
  ${itemsHtml || '<div class="item-row"><div>1</div><div class="item-name">Item</div><div></div></div>'}

  ${
    settings.show_order_totals
      ? `
        <div style="margin-top:2mm">${feeRows}</div>
        <div class="grand-total">
          <span class="label">GRAND TOTAL</span>
          <span class="amount">AED ${money(order.total_amount).toFixed(2)}</span>
        </div>
      `
      : ''
  }

  <div class="footer">${preserveLines(settings.footer_text)}</div>
</body>
</html>`;
}

function originalPrintKey(orderId: number): string {
  return `vita_original_printed_${orderId}`;
}

export function wasOriginalPrinted(orderId: number): boolean {
  return localStorage.getItem(originalPrintKey(orderId)) === '1';
}

function markOriginalPrinted(orderId: number): void {
  localStorage.setItem(originalPrintKey(orderId), '1');
}

export function nativePrinterAvailable(): boolean {
  try {
    return Boolean(
      window.VitaPrinter &&
        typeof window.VitaPrinter.printReceipt === 'function' &&
        (typeof window.VitaPrinter.isAvailable !== 'function' ||
          window.VitaPrinter.isAvailable()),
    );
  } catch {
    return false;
  }
}

function payloadFor(
  order: Order,
  settings: ReceiptSettings,
  mode: PrintMode,
) {
  const notes = parseOrderNotes(order.order_notes);
  const items = parseItems(order).map(item => ({
    quantity: Number(item?.quantity || 1),
    name: String(item?.name || 'Item'),
    size: String(item?.size || ''),
    extras: Array.isArray(item?.extras)
      ? item.extras.map((value: unknown) => String(value))
      : [],
    price: itemPrice(item),
  }));

  return {
    mode,
    printer: {
      ip: settings.printer_ip,
      port: settings.printer_port,
      paperWidth: settings.paper_width,
      cutPaper: settings.cut_paper,
    },
    receipt: {
      restaurantName: settings.restaurant_name,
      showLogo: settings.show_logo,
      logoUrl: receiptLogoUrl(settings),
      headerText: settings.header_text,
      footerText: settings.footer_text,
      showCustomerPhone: settings.show_customer_phone,
      showCustomerAddress: settings.show_customer_address,
      showPaymentMethod: settings.show_payment_method,
      showItemPrices: settings.show_item_prices,
      showOrderTotals: settings.show_order_totals,
    },
    order: {
      id: order.id,
      createdAt: order.created_at,
      type: notes.orderType,
      customerName: order.customer_name || 'Customer',
      customerPhone: order.customer_phone || '',
      customerAddress: notes.address,
      customerNote: notes.customerNote,
      paymentMethod: paymentDisplayLabel(order.payment_method),
      items,
      serviceFee: money(order.service_fee),
      smallOrderFee: money(order.small_order_fee),
      deliveryCharge: money(order.delivery_charge),
      tipAmount: money(order.tip_amount),
      totalAmount: money(order.total_amount),
    },
  };
}

export async function printKitchenOrder(
  order: Order,
  settings: ReceiptSettings,
  mode: PrintMode,
  automatic = false,
): Promise<boolean> {
  if (mode === 'original' && wasOriginalPrinted(order.id)) {
    return true;
  }

  if (nativePrinterAvailable()) {
    try {
      const result = window.VitaPrinter!.printReceipt(
        JSON.stringify(payloadFor(order, settings, mode)),
      );

      if (String(result || '').toLowerCase().includes('error')) {
        throw new Error(String(result));
      }

      if (mode === 'original') {
        markOriginalPrinted(order.id);
      }

      return true;
    } catch (error) {
      console.error('Native printer bridge failed:', error);
      toast.error(`Order #${order.id} print failed — tap Reprint`);
      return false;
    }
  }

  if (automatic) {
    toast.error(
      `Order #${order.id} accepted, but automatic print needs the Vita Kitchen Print Android app. Tap Reprint.`,
      { duration: 7000 },
    );
    return false;
  }

  const printWindow = window.open('', '_blank', 'width=380,height=720');

  if (!printWindow) {
    toast.error('Pop-up blocked. Allow pop-ups and tap Reprint again.');
    return false;
  }

  printWindow.document.write(
    browserReceiptHtml(order, settings, mode),
  );
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.print();
    window.setTimeout(() => printWindow.close(), 800);
  }, 900);

  if (mode === 'original') {
    markOriginalPrinted(order.id);
  }

  return true;
}
