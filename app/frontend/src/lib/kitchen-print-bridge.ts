import { toast } from 'sonner';

import { Order } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';

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
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  printer_ip: '192.168.70.125',
  printer_port: 9100,
  paper_width: '80mm',
  auto_print_on_accept: true,

  restaurant_name: 'Vita Napoli',
  show_logo: false,
  logo_url: '',
  header_text: 'Kitchen Order',
  footer_text: 'Thank you',

  show_customer_phone: true,
  show_customer_address: true,
  show_payment_method: true,
  show_item_prices: false,
  show_order_totals: true,
  cut_paper: true,
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

function browserReceiptHtml(
  order: Order,
  settings: ReceiptSettings,
  mode: PrintMode,
): string {
  const notes = parseOrderNotes(order.order_notes);
  const items = parseItems(order);
  const width = settings.paper_width === '58mm' ? '220px' : '300px';
  const title = mode === 'copy' ? 'REPRINT / COPY' : 'KITCHEN ORDER';

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const itemsHtml = items
    .map(item => {
      const extras = Array.isArray(item?.extras) ? item.extras : [];
      const price = itemPrice(item);

      return `
        <div style="margin:7px 0">
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold">
            <span>${escapeHtml(item?.quantity || 1)}x ${escapeHtml(item?.name || 'Item')}</span>
            ${
              settings.show_item_prices
                ? `<span>AED ${price.toFixed(2)}</span>`
                : ''
            }
          </div>
          ${
            item?.size
              ? `<div style="font-size:12px;margin-left:10px">Size: ${escapeHtml(item.size)}</div>`
              : ''
          }
          ${
            extras.length
              ? `<div style="font-size:12px;margin-left:10px">+ ${escapeHtml(extras.join(', '))}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  const logo = settings.show_logo && settings.logo_url
    ? `<img src="${escapeHtml(settings.logo_url)}" style="max-width:120px;max-height:85px;object-fit:contain;margin:0 auto 6px;display:block" />`
    : '';

  return `<!doctype html>
<html>
<head>
  <title>Order #${order.id}</title>
  <style>
    @page { margin: 2mm; }
    body { font-family: Arial, sans-serif; width:100%; max-width:${width}; margin:0 auto; padding:4px; color:#000; }
    .center { text-align:center; }
    .line { border-top:1px dashed #000; margin:8px 0; }
    .row { display:flex; justify-content:space-between; gap:10px; font-size:12px; margin:3px 0; }
  </style>
</head>
<body>
  ${logo}
  <div class="center" style="font-size:21px;font-weight:bold">${escapeHtml(settings.restaurant_name)}</div>
  <div class="center" style="font-size:12px">${escapeHtml(settings.header_text)}</div>
  <div class="center" style="font-size:14px;font-weight:bold;margin-top:5px">${title}</div>
  <div class="center" style="font-size:26px;font-weight:bold">ORDER #${order.id}</div>
  <div class="center" style="font-size:12px">${escapeHtml(notes.orderType)} · ${escapeHtml(new Date(order.created_at).toLocaleString('en-AE', { timeZone: 'Asia/Dubai' }))}</div>
  <div class="line"></div>
  <div><strong>Customer:</strong> ${escapeHtml(order.customer_name)}</div>
  ${settings.show_customer_phone ? `<div><strong>Phone:</strong> ${escapeHtml(order.customer_phone)}</div>` : ''}
  ${settings.show_customer_address && notes.address ? `<div><strong>Address:</strong> ${escapeHtml(notes.address)}</div>` : ''}
  ${settings.show_payment_method ? `<div><strong>Payment:</strong> ${escapeHtml(order.payment_method || 'Cash')}</div>` : ''}
  <div class="line"></div>
  ${itemsHtml}
  ${notes.customerNote ? `<div class="line"></div><div style="border:1px solid #000;padding:5px;font-weight:bold">NOTE: ${escapeHtml(notes.customerNote)}</div>` : ''}
  ${
    settings.show_order_totals
      ? `
        <div class="line"></div>
        <div class="row"><span>Service Fee</span><span>AED ${money(order.service_fee).toFixed(2)}</span></div>
        <div class="row"><span>Small Order Fee</span><span>AED ${money(order.small_order_fee).toFixed(2)}</span></div>
        <div class="row"><span>Delivery</span><span>AED ${money(order.delivery_charge).toFixed(2)}</span></div>
        <div class="row"><span>Tip</span><span>AED ${money(order.tip_amount).toFixed(2)}</span></div>
        <div class="row" style="font-size:17px;font-weight:bold"><span>TOTAL</span><span>AED ${money(order.total_amount).toFixed(2)}</span></div>
      `
      : ''
  }
  <div class="line"></div>
  <div class="center" style="font-size:11px">${escapeHtml(settings.footer_text)}</div>
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
      logoUrl: settings.logo_url,
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
      paymentMethod: order.payment_method || 'Cash',
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
  }, 350);

  if (mode === 'original') {
    markOriginalPrinted(order.id);
  }

  return true;
}
