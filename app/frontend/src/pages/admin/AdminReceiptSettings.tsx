import { ChangeEvent, useEffect, useState } from 'react';
import {
  Image as ImageIcon,
  Printer,
  Save,
  TestTube2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_RECEIPT_SETTINGS,
  ReceiptSettings,
} from '@/lib/kitchen-print-bridge';
import { uploadMenuImage } from '@/lib/image-upload';
import { getAPIBaseURL } from '@/lib/config';

function endpoint(): string {
  return `${getAPIBaseURL().replace(/\/$/, '')}/api/v1/receipt-settings`;
}

export default function AdminReceiptSettings() {
  const [form, setForm] = useState<ReceiptSettings>({
    ...DEFAULT_RECEIPT_SETTINGS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const response = await fetch(endpoint());
      if (!response.ok) throw new Error('Could not load settings');
      const payload = await response.json();
      setForm({
        ...DEFAULT_RECEIPT_SETTINGS,
        ...payload,
        printer_port: Number(payload?.printer_port || 9100),
        paper_width: payload?.paper_width === '58mm' ? '58mm' : '80mm',
      });
    } catch (error) {
      console.error(error);
      toast.error('Could not load receipt settings');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!form.printer_ip.trim()) {
      toast.error('Printer IP is required');
      return;
    }

    if (form.printer_port < 1 || form.printer_port > 65535) {
      toast.error('Printer port is invalid');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(endpoint(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('fai_fai_admin_token') || ''}`,
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.detail || 'Could not save settings');
      }

      setForm({
        ...DEFAULT_RECEIPT_SETTINGS,
        ...(payload?.settings || form),
      });
      toast.success('Receipt and printer settings saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save receipt settings');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMenuImage(file);
      setForm(current => ({
        ...current,
        logo_url: url,
        show_logo: true,
      }));
      toast.success('Receipt logo uploaded. Press Save.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not upload logo');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function testInstructions() {
    toast.info(
      'Automatic test is done from the Vita Kitchen Print Android app. Open Kitchen, accept a test order, or tap Reprint.',
      { duration: 7000 },
    );
  }

  if (loading) {
    return (
      <AdminSettingsPageLayout
        title="Receipt & Printer"
        subtitle="Loading settings..."
      >
        <p className="text-gray-400">Loading...</p>
      </AdminSettingsPageLayout>
    );
  }

  return (
    <AdminSettingsPageLayout
      title="Receipt & Printer"
      subtitle="Automatic print after Accept and customizable kitchen receipt"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Printer className="w-5 h-5 text-orange-400" />
            <h2 className="text-white font-semibold">
              Network Printer
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-gray-300">Printer IP</Label>
              <Input
                value={form.printer_ip}
                onChange={event =>
                  setForm({ ...form, printer_ip: event.target.value })
                }
                placeholder="192.168.70.125"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Port</Label>
              <Input
                type="number"
                value={form.printer_port}
                onChange={event =>
                  setForm({
                    ...form,
                    printer_port: Number(event.target.value || 9100),
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-gray-300">Paper Width</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['58mm', '80mm'] as const).map(width => (
                  <button
                    type="button"
                    key={width}
                    onClick={() => setForm({ ...form, paper_width: width })}
                    className={`p-3 rounded-lg border-2 ${
                      form.paper_width === width
                        ? 'border-orange-600 bg-orange-600/10 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}
                  >
                    {width}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700 sm:self-end">
              <div>
                <p className="text-white font-medium text-sm">
                  Auto Print on Accept
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  First receipt prints only after Kitchen accepts
                </p>
              </div>
              <Switch
                checked={form.auto_print_on_accept}
                onCheckedChange={checked =>
                  setForm({
                    ...form,
                    auto_print_on_accept: checked,
                  })
                }
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-white font-semibold">
              Receipt Logo & Heading
            </h2>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700 mb-4">
            <div>
              <p className="text-white font-medium text-sm">
                Show Logo
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Black-and-white logo prints at the top
              </p>
            </div>
            <Switch
              checked={form.show_logo}
              onCheckedChange={checked =>
                setForm({ ...form, show_logo: checked })
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
            <div>
              <div className="h-36 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Receipt logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-10 h-10 text-gray-600" />
                )}
              </div>

              <Label className="mt-3 block">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={event => void uploadLogo(event)}
                />
                <span className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white py-2.5 cursor-pointer text-sm">
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Logo'}
                </span>
              </Label>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Restaurant Name</Label>
                <Input
                  value={form.restaurant_name}
                  onChange={event =>
                    setForm({
                      ...form,
                      restaurant_name: event.target.value,
                    })
                  }
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">
                  Header Text
                </Label>
                <Textarea
                  value={form.header_text}
                  onChange={event =>
                    setForm({ ...form, header_text: event.target.value })
                  }
                  rows={2}
                  placeholder="Kitchen Order"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              <div>
                <Label className="text-gray-300">
                  Footer Text
                </Label>
                <Textarea
                  value={form.footer_text}
                  onChange={event =>
                    setForm({ ...form, footer_text: event.target.value })
                  }
                  rows={2}
                  placeholder="Thank you"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-4">
            What to Print
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                key: 'show_customer_phone',
                title: 'Customer Phone',
              },
              {
                key: 'show_customer_address',
                title: 'Delivery Address',
              },
              {
                key: 'show_payment_method',
                title: 'Payment Method',
              },
              {
                key: 'show_item_prices',
                title: 'Item Prices',
              },
              {
                key: 'show_order_totals',
                title: 'Fees & Grand Total',
              },
              {
                key: 'cut_paper',
                title: 'Cut Paper Automatically',
              },
            ].map(item => (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700"
              >
                <p className="text-gray-200 text-sm">{item.title}</p>
                <Switch
                  checked={Boolean(
                    form[item.key as keyof ReceiptSettings],
                  )}
                  onCheckedChange={checked =>
                    setForm({
                      ...form,
                      [item.key]: checked,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={testInstructions}
            className="border-gray-700 text-gray-300 py-6"
          >
            <TestTube2 className="w-4 h-4 mr-2" />
            How to Test
          </Button>

          <Button
            onClick={() => void save()}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white py-6"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Receipt Settings'}
          </Button>
        </div>

        <Card className="bg-yellow-950/20 border-yellow-900/50 p-4">
          <p className="text-yellow-300 text-sm">
            Automatic silent printing requires the companion
            <strong> Vita Kitchen Print Android app</strong>. In normal
            Chrome, Reprint uses the browser print screen instead.
          </p>
        </Card>
      </div>
    </AdminSettingsPageLayout>
  );
}
