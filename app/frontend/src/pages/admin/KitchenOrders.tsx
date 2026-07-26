import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Bell, Clock, Check, X, ChefHat, Volume2, VolumeX, Printer, Settings, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { client, Order } from '@/lib/api';

const TIME_OPTIONS = [
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-600',
  accepted: 'bg-green-600',
  preparing: 'bg-yellow-600',
  ready: 'bg-purple-600',
};

// ===== KITCHEN NOTIFICATION SOUND SYSTEM =====
class KitchenAlarm {
  private audioCtx: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  getEnabled() { return this.enabled; }

  private getContext(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { return null; }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private playBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 880;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55);
    osc2.start(ctx.currentTime + 0.3);
    osc2.stop(ctx.currentTime + 0.55);

    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.frequency.value = 1320;
    osc3.type = 'sine';
    gain3.gain.setValueAtTime(0.5, ctx.currentTime + 0.6);
    gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
    osc3.start(ctx.currentTime + 0.6);
    osc3.stop(ctx.currentTime + 0.9);
  }

  start() {
    if (!this.enabled || this.isPlaying) return;
    this.isPlaying = true;
    this.playBeep();
    this.intervalId = setInterval(() => {
      if (this.enabled) this.playBeep();
    }, 3000);
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  playOnce() {
    if (!this.enabled) return;
    this.playBeep();
  }

  isActive() { return this.isPlaying; }
}

const kitchenAlarm = new KitchenAlarm();

// ===== KITCHEN PRINTER SYSTEM =====
interface PrinterConfig {
  type: 'browser' | 'network' | 'usb';
  name: string;
  ip: string;
  port: number;
  connected: boolean;
  autoPrint: boolean;
  paperWidth: '58mm' | '80mm';
}

const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  type: 'browser',
  name: 'Browser Print',
  ip: '',
  port: 9100,
  connected: true,
  autoPrint: false,
  paperWidth: '80mm',
};

function getPrinterConfig(): PrinterConfig {
  try {
    const saved = localStorage.getItem('kitchen_printer');
    if (saved) return JSON.parse(saved);
  } catch { /* */ }
  return DEFAULT_PRINTER_CONFIG;
}

function savePrinterConfig(config: PrinterConfig) {
  localStorage.setItem('kitchen_printer', JSON.stringify(config));
}

function generateReceiptHtml(order: Order, paperWidth: string): string {
  let items: any[] = [];
  try { items = JSON.parse(order.items_json); } catch { /* */ }
  const now = new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' });
  const maxWidth = paperWidth === '58mm' ? '220px' : '300px';

  const itemsHtml = items.map(item => {
    const extrasLine = item.extras && item.extras.length > 0
      ? `<div style="font-size:11px;color:#555;margin-left:12px;">+ ${item.extras.join(', ')}</div>`
      : '';
    return `<div style="margin-bottom:6px;"><div style="font-weight:bold;font-size:15px;">${item.quantity}x ${item.name}</div><div style="font-size:12px;color:#333;margin-left:8px;">Size: ${item.size}</div>${extrasLine}</div>`;
  }).join('');

  const notesHtml = order.order_notes
    ? `<div style="margin-top:8px;padding:6px;border:1px solid #000;font-style:italic;font-size:12px;">Note: ${order.order_notes}</div>`
    : '';

  return `<!DOCTYPE html><html><head><title>Order #${order.id}</title><style>@page{margin:2mm;}body{font-family:'Courier New',monospace;font-size:14px;width:100%;max-width:${maxWidth};margin:0 auto;padding:4px;}</style></head><body><div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px;"><div style="font-size:20px;font-weight:bold;">VITA NAPOLI</div><div style="font-size:24px;font-weight:bold;margin:4px 0;">ORDER #${order.id}</div><div style="font-size:11px;">${now}</div></div><div style="margin-bottom:8px;font-size:12px;"><div><strong>Customer:</strong> ${order.customer_name}</div><div><strong>Phone:</strong> ${order.customer_phone}</div><div><strong>Payment:</strong> ${order.payment_method || 'Cash'}</div></div><div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:8px 0;">${itemsHtml}</div><div style="font-weight:bold;font-size:16px;text-align:right;margin-top:8px;">TOTAL: AED ${order.total_amount?.toFixed(2)}</div>${notesHtml}<div style="text-align:center;margin-top:8px;font-size:10px;color:#666;">--- Kitchen Copy ---</div></body></html>`;
}

function printOrderReceipt(order: Order, config: PrinterConfig) {
  if (config.type === 'network' && config.ip && config.port) {
    sendToNetworkPrinter(order, config);
  } else {
    // Browser print fallback
    const receiptHtml = generateReceiptHtml(order, config.paperWidth);
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
      }, 300);
    } else {
      toast.error('Pop-up blocked! Please allow pop-ups for printing.');
    }
  }
}

async function sendToNetworkPrinter(order: Order, config: PrinterConfig) {
  try {
    const response = await fetch(`http://${config.ip}:${config.port}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        content: generateReceiptHtml(order, config.paperWidth),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      toast.success(`Order #${order.id} sent to printer`);
    } else {
      throw new Error('Printer not responding');
    }
  } catch {
    toast.error(`Cannot reach printer at ${config.ip}:${config.port}. Using browser print.`);
    const fallbackConfig = { ...config, type: 'browser' as const };
    printOrderReceipt(order, fallbackConfig);
  }
}

async function testPrinterConnection(config: PrinterConfig): Promise<boolean> {
  if (config.type === 'browser') return true;
  if (config.type === 'network' && config.ip && config.port) {
    try {
      const response = await fetch(`http://${config.ip}:${config.port}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  return false;
}

// ===== COMPONENTS =====
function OrderTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="text-orange-400 text-xs font-mono font-bold">{elapsed}</span>
  );
}

function PrinterSettingsDialog({
  open,
  onOpenChange,
  config,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PrinterConfig;
  onSave: (config: PrinterConfig) => void;
}) {
  const [localConfig, setLocalConfig] = useState<PrinterConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  useEffect(() => {
    setLocalConfig(config);
    setTestResult(null);
  }, [config, open]);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testPrinterConnection(localConfig);
    setTestResult(result ? 'success' : 'failed');
    setTesting(false);
    if (result) {
      toast.success('Printer connected successfully!');
    } else {
      toast.error('Could not connect to printer');
    }
  }

  function handleSave() {
    const updatedConfig = {
      ...localConfig,
      connected: localConfig.type === 'browser' ? true : testResult === 'success',
    };
    savePrinterConfig(updatedConfig);
    onSave(updatedConfig);
    onOpenChange(false);
    toast.success('Printer settings saved');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-orange-400" />
            Kitchen Printer Settings
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-300">Connection Type</Label>
            <Select
              value={localConfig.type}
              onValueChange={(v) => setLocalConfig({ ...localConfig, type: v as PrinterConfig['type'] })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="browser">Browser Print (Default)</SelectItem>
                <SelectItem value="network">Network Printer (IP/WiFi)</SelectItem>
                <SelectItem value="usb">USB Printer</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-gray-500 text-xs mt-1">
              {localConfig.type === 'browser' && 'Uses your browser print dialog. Works with any connected printer.'}
              {localConfig.type === 'network' && 'Connect to a thermal printer via IP address (ESC/POS compatible).'}
              {localConfig.type === 'usb' && 'USB thermal printers require a print server app running locally.'}
            </p>
          </div>

          {localConfig.type === 'network' && (
            <>
              <div>
                <Label className="text-gray-300">Printer Name</Label>
                <Input
                  value={localConfig.name}
                  onChange={(e) => setLocalConfig({ ...localConfig, name: e.target.value })}
                  placeholder="Kitchen Printer 1"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-300">IP Address</Label>
                  <Input
                    value={localConfig.ip}
                    onChange={(e) => setLocalConfig({ ...localConfig, ip: e.target.value })}
                    placeholder="192.168.1.100"
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Port</Label>
                  <Input
                    type="number"
                    value={localConfig.port}
                    onChange={(e) => setLocalConfig({ ...localConfig, port: Number(e.target.value) })}
                    placeholder="9100"
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {localConfig.type === 'usb' && (
            <div>
              <Label className="text-gray-300">Printer Name</Label>
              <Input
                value={localConfig.name}
                onChange={(e) => setLocalConfig({ ...localConfig, name: e.target.value })}
                placeholder="USB Thermal Printer"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
              <p className="text-yellow-400 text-xs mt-2">
                USB printing requires a local print server (e.g., QZ Tray or similar). Browser print will be used as fallback.
              </p>
            </div>
          )}

          <div>
            <Label className="text-gray-300">Paper Width</Label>
            <Select
              value={localConfig.paperWidth}
              onValueChange={(v) => setLocalConfig({ ...localConfig, paperWidth: v as '58mm' | '80mm' })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700">
                <SelectItem value="58mm">58mm (Small)</SelectItem>
                <SelectItem value="80mm">80mm (Standard)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
            <div>
              <p className="text-white text-sm font-medium">Auto-Print New Orders</p>
              <p className="text-gray-500 text-xs">Automatically print when a new order arrives</p>
            </div>
            <button
              onClick={() => setLocalConfig({ ...localConfig, autoPrint: !localConfig.autoPrint })}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                localConfig.autoPrint ? 'bg-green-600' : 'bg-gray-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transform transition-transform ${
                localConfig.autoPrint ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Test Connection */}
          {localConfig.type === 'network' && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleTest}
                disabled={testing || !localConfig.ip}
                variant="outline"
                className="border-gray-700 text-gray-300 cursor-pointer"
              >
                {testing ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4 mr-2" />
                )}
                Test Connection
              </Button>
              {testResult === 'success' && (
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <Wifi className="w-4 h-4" /> Connected
                </span>
              )}
              {testResult === 'failed' && (
                <span className="text-red-400 text-sm flex items-center gap-1">
                  <WifiOff className="w-4 h-4" /> Failed
                </span>
              )}
            </div>
          )}

          <Button onClick={handleSave} className="w-full bg-orange-600 hover:bg-orange-700 text-white cursor-pointer">
            Save Printer Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DeliveryAssignment {
  id: number;
  order_id: number;
  rider_id: number;
  status: string;
  rider_name?: string;
}

const CANCEL_REASONS = [
  'Out of ingredients',
  'Kitchen too busy',
  'Item unavailable',
  'Customer requested',
  'Duplicate order',
  'Other',
];

export default function KitchenOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingOrder, setAcceptingOrder] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<number>(20);
  const [customTime, setCustomTime] = useState<string>('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(getPrinterConfig());
  const [printerDialogOpen, setPrinterDialogOpen] = useState(false);
  const [deliveryAssignments, setDeliveryAssignments] = useState<DeliveryAssignment[]>([]);
  const [rejectingOrder, setRejectingOrder] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [customRejectReason, setCustomRejectReason] = useState('');
  const prevNewOrderIdsRef = useRef<Set<number>>(new Set());
  const hasInteractedRef = useRef(false);
  const ordersRef = useRef<Order[]>([]);

  useEffect(() => {
    const kitchenAuth = localStorage.getItem('kitchen_auth');
    if (kitchenAuth) {
      setAuthenticated(true);
      if (!hasInteractedRef.current) {
        setShowSoundPrompt(true);
      }
    }
    const soundPref = localStorage.getItem('kitchen_sound');
    if (soundPref === 'off') {
      setSoundEnabled(false);
      kitchenAlarm.setEnabled(false);
    }
    return () => { kitchenAlarm.stop(); };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadOrders();
    loadDeliveryAssignments();
    const interval = setInterval(() => {
      loadOrders();
      loadDeliveryAssignments();
    }, 8000);
    return () => clearInterval(interval);
  }, [authenticated]);

  async function loadDeliveryAssignments() {
    try {
      // Fetch all active delivery assignments with rider info
      const [assignRes, ridersRes] = await Promise.all([
        client.entities.delivery_assignments.query({ sort: '-created_at', limit: 100 }),
        client.apiCall.invoke({ url: '/api/v1/rider/admin/list', method: 'GET' }),
      ]);
      const assignments = assignRes?.data || [];
      const riders = ridersRes?.data?.items || [];
      const riderMap = new Map(riders.map((r: any) => [r.id, r.name]));
      
      setDeliveryAssignments(
        assignments.map((a: any) => ({
          id: a.id,
          order_id: a.order_id,
          rider_id: a.rider_id,
          status: a.status,
          rider_name: riderMap.get(a.rider_id) || `Rider #${a.rider_id}`,
        }))
      );
    } catch (e) {
      console.error('Failed to load delivery assignments:', e);
    }
  }

  function getAssignmentForOrder(orderId: number): DeliveryAssignment | undefined {
    return deliveryAssignments.find(a => a.order_id === orderId && a.status !== 'delivered');
  }

  function toggleSound() {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    kitchenAlarm.setEnabled(newState);
    localStorage.setItem('kitchen_sound', newState ? 'on' : 'off');
    if (!newState) {
      kitchenAlarm.stop();
      toast.info('Sound OFF');
    } else {
      toast.success('Sound ON');
      kitchenAlarm.playOnce();
    }
  }

  function handlePinLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pin === '1234') {
      localStorage.setItem('kitchen_auth', 'true');
      setAuthenticated(true);
      hasInteractedRef.current = true;
      setShowSoundPrompt(false);
      kitchenAlarm.setEnabled(true);
      kitchenAlarm.playOnce();
      toast.success('Kitchen access granted — Sound notifications active');
    } else {
      toast.error('Invalid PIN');
    }
  }

  function activateSound() {
    hasInteractedRef.current = true;
    setShowSoundPrompt(false);
    kitchenAlarm.setEnabled(true);
    setSoundEnabled(true);
    localStorage.setItem('kitchen_sound', 'on');
    kitchenAlarm.playOnce();
    toast.success('Sound notifications activated!');
  }

  function handlePrintOrder(order: Order) {
    printOrderReceipt(order, printerConfig);
    toast.success(`Printing order #${order.id}`);
  }

  // Track recently updated order IDs to prevent poll from reverting optimistic updates
  const recentlyUpdatedRef = useRef<Map<number, number>>(new Map()); // orderId -> timestamp

  // Keep ordersRef in sync to avoid stale closure in loadOrders
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const loadOrders = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await client.apiCall.invoke({
        url: '/api/v1/admin/orders',
        method: 'GET',
        data: { sort: '-created_at', limit: 50 },
      });
      const allOrders = res.data?.items || [];
      const activeOrders = allOrders.filter(
        (o: Order) => ['new', 'accepted', 'preparing', 'ready'].includes(o.status)
      );

      // Filter out stale poll data for recently-updated orders (10s guard)
      const now = Date.now();
      const recentUpdates = recentlyUpdatedRef.current;
      // Clean old entries (older than 10s)
      for (const [id, ts] of recentUpdates.entries()) {
        if (now - ts > 10000) recentUpdates.delete(id);
      }

      // Use ref to get current orders (avoids stale closure)
      const currentOrders = ordersRef.current;

      // Merge: keep local state for recently-updated orders, use poll data for others
      const mergedOrders = activeOrders.map((polledOrder: Order) => {
        if (recentUpdates.has(polledOrder.id)) {
          // Use local state version instead of polled version
          const localOrder = currentOrders.find(o => o.id === polledOrder.id);
          return localOrder || polledOrder;
        }
        return polledOrder;
      });

      // Also keep locally-removed orders (status changed to completed/cancelled) from reappearing
      const filteredOrders = mergedOrders.filter((o: Order) => {
        if (recentUpdates.has(o.id)) {
          const localOrder = currentOrders.find(lo => lo.id === o.id);
          // If local state shows it was moved out of active, don't show it
          if (localOrder && !['new', 'accepted', 'preparing', 'ready'].includes(localOrder.status)) {
            return false;
          }
          // If the order was removed from local state (e.g. completed/cancelled), filter it out
          if (!localOrder) {
            return false;
          }
        }
        return true;
      });

      // Deduplicate by order ID (prevent ghost duplicates)
      const seen = new Set<number>();
      const deduplicatedOrders = filteredOrders.filter((o: Order) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });

      const currentNewOrderIds = new Set(
        deduplicatedOrders.filter((o: Order) => o.status === 'new').map((o: Order) => o.id)
      );
      const prevIds = prevNewOrderIdsRef.current;
      const brandNewOrders = [...currentNewOrderIds].filter(id => !prevIds.has(id));

      if (brandNewOrders.length > 0 && prevIds.size > 0) {
        brandNewOrders.forEach(() => {
          kitchenAlarm.playOnce();
        });
        toast.success(`${brandNewOrders.length} new order${brandNewOrders.length > 1 ? 's' : ''} received!`, {
          duration: 5000,
        });

        // Auto-print new orders if enabled
        if (printerConfig.autoPrint) {
          const newOrdersList = deduplicatedOrders.filter((o: Order) => brandNewOrders.includes(o.id));
          newOrdersList.forEach((order: Order) => {
            printOrderReceipt(order, printerConfig);
          });
        }
      }

      if (currentNewOrderIds.size > 0) {
        if (!kitchenAlarm.isActive()) {
          kitchenAlarm.start();
        }
      } else {
        kitchenAlarm.stop();
      }

      prevNewOrderIdsRef.current = currentNewOrderIds;
      setOrders(deduplicatedOrders);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setRefreshing(false);
    }
  }, [printerConfig]);

  async function acceptOrder(orderId: number, minutes: number) {
    try {
      // Mark as recently updated to prevent poll from reverting
      recentlyUpdatedRef.current.set(orderId, Date.now());

      await client.apiCall.invoke({
        url: `/api/v1/admin/orders/${orderId}/status`,
        method: 'PUT',
        data: { status: 'accepted', estimated_minutes: minutes },
      });
      setOrders(prev =>
        prev.map(o => (o.id === orderId ? { ...o, status: 'accepted', estimated_time: `${minutes} min` } : o))
      );
      setAcceptingOrder(null);
      setCustomTime('');

      prevNewOrderIdsRef.current.delete(orderId);
      if (prevNewOrderIdsRef.current.size === 0) {
        kitchenAlarm.stop();
      }

      toast.success(`Order #${orderId} accepted — ${minutes} min`);
    } catch (e) {
      console.error('Failed to accept order:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to accept order');
    }
  }

  async function updateStatus(orderId: number, newStatus: string) {
    try {
      // Mark as recently updated to prevent poll from reverting
      recentlyUpdatedRef.current.set(orderId, Date.now());

      await client.apiCall.invoke({
        url: `/api/v1/admin/orders/${orderId}/status`,
        method: 'PUT',
        data: { status: newStatus },
      });

      if (newStatus === 'completed' || newStatus === 'cancelled') {
        // Remove from active list immediately
        setOrders(prev => prev.filter(o => o.id !== orderId));
      } else {
        setOrders(prev =>
          prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
        );
      }
      toast.success(`Order #${orderId} → ${newStatus}`);
    } catch (e) {
      console.error('Failed to update status:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to update status');
    }
  }

  async function rejectOrder(orderId: number, reason?: string) {
    try {
      // Mark as recently updated to prevent poll from reverting
      recentlyUpdatedRef.current.set(orderId, Date.now());

      const cancelReason = reason || (rejectReason === 'Other' ? customRejectReason : rejectReason);
      await client.apiCall.invoke({
        url: `/api/v1/admin/orders/${orderId}/status`,
        method: 'PUT',
        data: { status: 'cancelled', cancel_reason: cancelReason || 'Rejected by kitchen' },
      });
      setOrders(prev => prev.filter(o => o.id !== orderId));

      prevNewOrderIdsRef.current.delete(orderId);
      if (prevNewOrderIdsRef.current.size === 0) {
        kitchenAlarm.stop();
      }

      setRejectingOrder(null);
      setRejectReason('');
      setCustomRejectReason('');
      toast.success(`Order #${orderId} rejected`);
    } catch (e) {
      console.error('Failed to reject order:', e);
      recentlyUpdatedRef.current.delete(orderId);
      toast.error('Failed to reject order');
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-16 h-16 rounded-full bg-orange-600/20 flex items-center justify-center mx-auto mb-4">
            <ChefHat className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">Kitchen Display</h1>
          <p className="text-gray-400 mb-6 text-sm">Enter PIN to access order management</p>
          <form onSubmit={handlePinLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN"
              maxLength={4}
              className="w-full text-center text-2xl tracking-[0.5em] bg-gray-900 border border-gray-700 text-white rounded-xl py-4 px-4 focus:outline-none focus:border-orange-500"
            />
            <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white py-5 text-lg font-semibold rounded-xl cursor-pointer">
              Enter Kitchen
            </Button>
          </form>
          <p className="text-gray-600 text-xs mt-4">Default PIN: 1234</p>
        </div>
      </div>
    );
  }

  const newOrders = orders.filter(o => o.status === 'new');
  const activeOrders = orders.filter(o => ['accepted', 'preparing'].includes(o.status));
  const readyOrders = orders.filter(o => o.status === 'ready');

  // Helper to check if order is delivery
  function isDeliveryOrder(order: Order): boolean {
    return order.order_notes?.includes('Order Type: Delivery') || false;
  }

  const readyPickupOrders = readyOrders.filter(o => !isDeliveryOrder(o));
  const readyDeliveryOrders = readyOrders.filter(o => isDeliveryOrder(o));

  return (
    <div className="min-h-screen bg-gray-950 px-3 py-3">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <ChefHat className="w-6 h-6 text-orange-500" />
            <h1 className="text-white text-lg font-bold">Kitchen Orders</h1>
            <div className="relative">
              <Bell className="w-5 h-5 text-gray-400" />
              {newOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                  {newOrders.length}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Printer status & settings button */}
            <button
              onClick={() => setPrinterDialogOpen(true)}
              className={`p-2 rounded-lg cursor-pointer transition-colors ${
                printerConfig.connected
                  ? 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  : 'bg-gray-800 text-gray-600 border border-gray-700'
              }`}
              title={`Printer: ${printerConfig.name} (${printerConfig.type})`}
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={toggleSound}
              className={`p-2 rounded-lg cursor-pointer transition-colors ${
                soundEnabled
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'bg-gray-800 text-gray-600 border border-gray-700'
              }`}
              title={soundEnabled ? 'Sound ON — tap to mute' : 'Sound OFF — tap to enable'}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <span className="text-gray-500 text-xs hidden sm:inline">{lastRefresh.toLocaleTimeString()}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadOrders()}
              disabled={refreshing}
              className="text-gray-400 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Printer connection status banner */}
        {printerConfig.type !== 'browser' && !printerConfig.connected && (
          <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
            <span className="text-orange-400 text-xs flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Printer disconnected — orders will use browser print
            </span>
            <button onClick={() => setPrinterDialogOpen(true)} className="text-orange-400 text-xs underline cursor-pointer">
              Configure
            </button>
          </div>
        )}

        {printerConfig.autoPrint && (
          <div className="bg-green-600/10 border border-green-600/30 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
            <Printer className="w-3 h-3 text-green-400" />
            <span className="text-green-400 text-xs">Auto-print enabled — new orders print automatically</span>
          </div>
        )}

        {/* Sound activation prompt */}
        {showSoundPrompt && (
          <div className="bg-blue-600/10 border-2 border-blue-600/50 rounded-xl px-4 py-4 mb-3 text-center animate-pulse">
            <p className="text-blue-300 font-bold text-lg mb-2">Tap to Activate Sound</p>
            <p className="text-gray-400 text-xs mb-3">Browser requires a tap before playing notification sounds</p>
            <button
              onClick={activateSound}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl text-sm cursor-pointer transition-all"
            >
              Activate Sound Notifications
            </button>
          </div>
        )}

        {/* Sound status banner */}
        {!soundEnabled && !showSoundPrompt && newOrders.length > 0 && (
          <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
            <span className="text-yellow-400 text-xs">Sound is OFF — you will not hear new order alerts</span>
            <button onClick={toggleSound} className="text-yellow-400 text-xs underline cursor-pointer">Enable Sound</button>
          </div>
        )}

        {/* Alarm active indicator */}
        {soundEnabled && newOrders.length > 0 && (
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-medium">
              Alert active — {newOrders.length} order{newOrders.length > 1 ? 's' : ''} waiting. Accept to stop alarm.
            </span>
          </div>
        )}

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* New Orders */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
              <h2 className="text-blue-400 font-semibold text-sm">NEW ({newOrders.length})</h2>
            </div>
            <div className="space-y-2">
              {newOrders.map(order => {
                let items: any[] = [];
                try { items = JSON.parse(order.items_json); } catch { /* */ }
                return (
                  <Card key={order.id} className="bg-gray-900 border-blue-600/40 border-2 p-3 animate-pulse-slow">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-bold text-lg">#{order.id}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePrintOrder(order)}
                          className="text-gray-400 hover:text-orange-400 cursor-pointer p-1"
                          title="Print order"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <OrderTimer createdAt={order.created_at} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-gray-300 text-sm">{order.customer_name} • {order.customer_phone}</p>
                      {isDeliveryOrder(order) ? (
                        <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-[9px] px-1.5 py-0">🚗 Delivery</Badge>
                      ) : (
                        <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-[9px] px-1.5 py-0">🏪 Pickup</Badge>
                      )}
                    </div>
                    <div className="space-y-0.5 mb-2">
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="text-gray-200 text-sm font-medium">
                          {item.quantity}x {item.name} ({item.size})
                          {item.extras?.length > 0 && (
                            <span className="text-gray-500 text-xs ml-1">+{item.extras.join(', ')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {order.order_notes && (
                      <p className="text-yellow-400/80 text-xs mb-2 italic">Note: {order.order_notes}</p>
                    )}
                    <div className="text-red-400 font-bold text-sm mb-2">AED {order.total_amount?.toFixed(2)}</div>

                    {acceptingOrder === order.id ? (
                      <div className="bg-gray-800 rounded-lg p-2">
                        <p className="text-green-400 text-xs font-medium mb-2">Set ready time:</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {TIME_OPTIONS.map(t => (
                            <button
                              key={t.value}
                              onClick={() => { setSelectedTime(t.value); setCustomTime(''); }}
                              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                                selectedTime === t.value && !customTime
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                          <Input
                            type="number"
                            value={customTime}
                            onChange={e => { setCustomTime(e.target.value); setSelectedTime(0); }}
                            placeholder="Custom"
                            className="w-16 h-7 text-xs bg-gray-700 border-gray-600 text-white px-2"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => acceptOrder(order.id, customTime ? Number(customTime) : selectedTime)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs flex-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3 mr-1" /> Accept ({customTime || selectedTime} min)
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAcceptingOrder(null)} className="text-gray-400 text-xs cursor-pointer">
                            Back
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { setAcceptingOrder(order.id); setSelectedTime(20); setCustomTime(''); }} className="bg-green-600 hover:bg-green-700 text-white flex-1 cursor-pointer">
                          <Check className="w-3 h-3 mr-1" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectingOrder(order.id); setRejectReason(''); setCustomRejectReason(''); }} className="text-red-400 hover:text-red-300 cursor-pointer">
                          <X className="w-3 h-3" /> Reject
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
              {newOrders.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600 text-sm">No new orders</p>
                  <p className="text-gray-700 text-xs mt-1">Waiting for customers...</p>
                </div>
              )}
            </div>
          </div>

          {/* In Progress */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-3 h-3 rounded-full bg-yellow-600" />
              <h2 className="text-yellow-400 font-semibold text-sm">IN PROGRESS ({activeOrders.length})</h2>
            </div>
            <div className="space-y-2">
              {activeOrders.map(order => {
                let items: any[] = [];
                try { items = JSON.parse(order.items_json); } catch { /* */ }
                return (
                  <Card key={order.id} className="bg-gray-900 border-gray-800 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-bold">#{order.id}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePrintOrder(order)}
                          className="text-gray-400 hover:text-orange-400 cursor-pointer p-1"
                          title="Print order"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <Badge className={`${STATUS_COLORS[order.status]} text-white text-[10px]`}>
                          {order.status === 'accepted' ? 'Accepted' : 'Cooking'}
                        </Badge>
                        <OrderTimer createdAt={order.created_at} />
                      </div>
                    </div>
                    {order.estimated_time && (
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3 text-orange-400" />
                        <span className="text-orange-400 text-xs font-medium">{order.estimated_time}</span>
                      </div>
                    )}
                    <div className="space-y-0.5 mb-2">
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="text-gray-300 text-xs">
                          {item.quantity}x {item.name} ({item.size})
                        </div>
                      ))}
                    </div>
                    {order.order_notes && (
                      <p className="text-yellow-400/80 text-[10px] mb-2 italic">Note: {order.order_notes}</p>
                    )}
                    <div className="flex gap-2">
                      {order.status === 'accepted' && (
                        <Button size="sm" onClick={() => updateStatus(order.id, 'preparing')} className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs flex-1 cursor-pointer">
                          <ChefHat className="w-3 h-3 mr-1" /> Start Cooking
                        </Button>
                      )}
                      {order.status === 'preparing' && (
                        <Button size="sm" onClick={() => updateStatus(order.id, 'ready')} className="bg-purple-600 hover:bg-purple-700 text-white text-xs flex-1 cursor-pointer">
                          Mark Ready
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
              {activeOrders.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600 text-sm">No active orders</p>
                </div>
              )}
            </div>
          </div>

          {/* Ready - Split into Pickup and Delivery */}
          <div>
            {/* Ready for Pickup */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-3 h-3 rounded-full bg-purple-600" />
                <h2 className="text-purple-400 font-semibold text-sm">READY - PICKUP ({readyPickupOrders.length})</h2>
              </div>
              <div className="space-y-2">
                {readyPickupOrders.map(order => {
                  let items: any[] = [];
                  try { items = JSON.parse(order.items_json); } catch { /* */ }
                  return (
                    <Card key={order.id} className="bg-gray-900 border-purple-600/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-bold">#{order.id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePrintOrder(order)}
                            className="text-gray-400 hover:text-orange-400 cursor-pointer p-1"
                            title="Print order"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <Badge className="bg-purple-600 text-white text-[10px]">Pickup</Badge>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm mb-1">{order.customer_name} • {order.customer_phone}</p>
                      <div className="space-y-0.5 mb-2">
                        {items.map((item: any, idx: number) => (
                          <div key={idx} className="text-gray-400 text-xs">
                            {item.quantity}x {item.name}
                          </div>
                        ))}
                      </div>
                      <Button size="sm" onClick={() => updateStatus(order.id, 'completed')} className="w-full bg-green-700 hover:bg-green-600 text-white text-xs cursor-pointer">
                        ✓ Customer Picked Up
                      </Button>
                    </Card>
                  );
                })}
                {readyPickupOrders.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-gray-600 text-xs">No pickup orders ready</p>
                  </div>
                )}
              </div>
            </div>

            {/* Ready for Delivery (Waiting for Rider) */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-3 h-3 rounded-full bg-blue-600" />
                <h2 className="text-blue-400 font-semibold text-sm">READY - DELIVERY ({readyDeliveryOrders.length})</h2>
              </div>
              <div className="space-y-2">
                {readyDeliveryOrders.map(order => {
                  let items: any[] = [];
                  try { items = JSON.parse(order.items_json); } catch { /* */ }
                  const assignment = getAssignmentForOrder(order.id);
                  return (
                    <Card key={order.id} className="bg-gray-900 border-blue-600/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-bold">#{order.id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePrintOrder(order)}
                            className="text-gray-400 hover:text-orange-400 cursor-pointer p-1"
                            title="Print order"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <Badge className="bg-blue-600 text-white text-[10px]">Delivery</Badge>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm mb-1">{order.customer_name} • {order.customer_phone}</p>
                      <div className="space-y-0.5 mb-2">
                        {items.map((item: any, idx: number) => (
                          <div key={idx} className="text-gray-400 text-xs">
                            {item.quantity}x {item.name}
                          </div>
                        ))}
                      </div>
                      {assignment ? (
                        <div className="bg-green-600/10 border border-green-600/30 rounded-lg px-3 py-2">
                          <p className="text-green-400 text-xs font-medium">
                            🏍️ Assigned to: <span className="font-bold">{assignment.rider_name}</span>
                          </p>
                          <p className="text-green-400/70 text-[10px] mt-0.5">
                            Status: {assignment.status.replace(/_/g, ' ')}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg px-3 py-2 text-center">
                          <p className="text-orange-400 text-xs font-medium">⚠️ No rider assigned yet</p>
                          <p className="text-orange-400/60 text-[10px] mt-0.5">Assign from Admin Orders page</p>
                        </div>
                      )}
                    </Card>
                  );
                })}
                {readyDeliveryOrders.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-gray-600 text-xs">No delivery orders waiting</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Printer Settings Dialog */}
      <PrinterSettingsDialog
        open={printerDialogOpen}
        onOpenChange={setPrinterDialogOpen}
        config={printerConfig}
        onSave={setPrinterConfig}
      />

      {/* Reject Order with Reason Dialog */}
      <Dialog open={rejectingOrder !== null} onOpenChange={(open) => { if (!open) setRejectingOrder(null); }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <X className="w-5 h-5" />
              Reject Order #{rejectingOrder}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Select a reason for rejecting this order:</p>
            <div className="grid grid-cols-1 gap-2">
              {CANCEL_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setRejectReason(reason)}
                  className={`text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    rejectReason === reason
                      ? 'bg-red-600/20 border border-red-600/50 text-red-300'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {rejectReason === 'Other' && (
              <Input
                value={customRejectReason}
                onChange={(e) => setCustomRejectReason(e.target.value)}
                placeholder="Enter custom reason..."
                className="bg-gray-800 border-gray-700 text-white"
              />
            )}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  if (!rejectReason) { toast.error('Please select a reason'); return; }
                  if (rejectReason === 'Other' && !customRejectReason) { toast.error('Please enter a reason'); return; }
                  if (rejectingOrder) rejectOrder(rejectingOrder);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                disabled={!rejectReason || (rejectReason === 'Other' && !customRejectReason)}
              >
                Confirm Reject
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRejectingOrder(null)}
                className="text-gray-400 cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}