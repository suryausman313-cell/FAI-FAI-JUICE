import {
  ChangeEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Shield,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  loadBrandSettings,
  replaceWithFaiFaiMenu,
  saveBrandSettings,
} from '@/lib/brand-settings';
import { uploadMenuImage } from '@/lib/image-upload';

type LogoField =
  | 'logo_url'
  | 'customer_logo_url'
  | 'admin_logo_url'
  | 'kitchen_logo_url'
  | 'rider_logo_url';

const LOGO_FIELDS: Array<{
  key: LogoField;
  label: string;
  fallback: string;
}> = [
  {
    key: 'logo_url',
    label: 'Main Shop Logo',
    fallback: '/icon-customer-192.png',
  },
  {
    key: 'customer_logo_url',
    label: 'Customer App Logo',
    fallback: '/icon-customer-192.png',
  },
  {
    key: 'admin_logo_url',
    label: 'Admin App Logo',
    fallback: '/icon-admin-192.png',
  },
  {
    key: 'kitchen_logo_url',
    label: 'Kitchen App Logo',
    fallback: '/icon-kitchen-192.png',
  },
  {
    key: 'rider_logo_url',
    label: 'Rider App Logo',
    fallback: '/icon-rider-192.png',
  },
];

export default function AdminBrandSettings() {
  const navigate = useNavigate();

  const [form, setForm] = useState<BrandSettings>({
    ...DEFAULT_BRAND_SETTINGS,
  });
  const [securityKey, setSecurityKey] = useState(
    () => localStorage.getItem('fai_fai_settings_key') || '',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] =
    useState<LogoField | null>(null);
  const [replacingMenu, setReplacingMenu] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const fileInputs = useRef<
    Partial<Record<LogoField, HTMLInputElement | null>>
  >({});

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');

    if (!auth) {
      navigate('/admin');
      return;
    }

    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) {
        navigate('/admin');
        return;
      }
    } catch {
      navigate('/admin');
      return;
    }

    void loadBrandSettings()
      .then(setForm)
      .finally(() => setLoading(false));
  }, [navigate]);

  function updateField(
    key: keyof BrandSettings,
    value: string,
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function uploadLogo(
    field: LogoField,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingField(field);

    try {
      const url = await uploadMenuImage(file);
      updateField(field, url);

      if (field === 'logo_url' && !form.customer_logo_url) {
        updateField('customer_logo_url', url);
      }

      toast.success('Logo uploaded');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Logo upload failed',
      );
    } finally {
      setUploadingField(null);
      event.target.value = '';
    }
  }

  async function save() {
    if (!securityKey.trim()) {
      toast.error('Settings Security Key likho');
      return;
    }

    if (!form.shop_name.trim()) {
      toast.error('Shop name required hai');
      return;
    }

    setSaving(true);

    try {
      localStorage.setItem(
        'fai_fai_settings_key',
        securityKey.trim(),
      );

      const saved = await saveBrandSettings(
        form,
        securityKey.trim(),
      );

      setForm(saved);
      toast.success('Branding aur app settings save ho gayi');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Settings save failed',
      );
    } finally {
      setSaving(false);
    }
  }

  async function replaceMenu() {
    if (!securityKey.trim()) {
      toast.error('Settings Security Key likho');
      return;
    }

    if (confirmText.trim().toUpperCase() !== 'DELETE OLD MENU') {
      toast.error('DELETE OLD MENU bilkul aise likho');
      return;
    }

    if (
      !window.confirm(
        'Purana pizza menu, categories, extras, offers aur deals permanently delete honge. Continue?',
      )
    ) {
      return;
    }

    setReplacingMenu(true);

    try {
      localStorage.setItem(
        'fai_fai_settings_key',
        securityKey.trim(),
      );

      const result = await replaceWithFaiFaiMenu(
        securityKey.trim(),
      );

      toast.success(
        String(
          result.message ||
            'Old menu deleted and Fai Fai menu installed',
        ),
      );
      setConfirmText('');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Menu replacement failed',
      );
    } finally {
      setReplacingMenu(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/settings')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <h1 className="text-white text-2xl font-bold">
              Brand & App Settings
            </h1>
            <p className="text-gray-400 text-sm">
              Name, logo, phone, address, app names aur colors
              Admin se change karo.
            </p>
          </div>
        </div>

        <Card className="bg-gray-900 border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white font-semibold">
              Settings Security Key
            </h2>
          </div>

          <Input
            type="password"
            value={securityKey}
            onChange={(event) =>
              setSecurityKey(event.target.value)
            }
            placeholder="Same value jo Render me FAI_FAI_SETTINGS_KEY hai"
            className="bg-gray-800 border-gray-700 text-white"
          />

          <p className="text-yellow-300/80 text-xs mt-2">
            Ye key sirf Admin browser me save hoti hai. Render
            Environment me bhi same key honi chahiye.
          </p>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-green-400" />
            <h2 className="text-white font-semibold">
              Shop Details
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Shop Name</Label>
              <Input
                value={form.shop_name}
                onChange={(event) =>
                  updateField('shop_name', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">Short Name</Label>
              <Input
                value={form.short_name}
                onChange={(event) =>
                  updateField('short_name', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-gray-300">
                Slogan / Description
              </Label>
              <Input
                value={form.slogan}
                onChange={(event) =>
                  updateField('slogan', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">Phone</Label>
              <Input
                value={form.phone}
                onChange={(event) =>
                  updateField('phone', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">
                WhatsApp Number
              </Label>
              <Input
                value={form.whatsapp}
                onChange={(event) =>
                  updateField('whatsapp', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-gray-300">Address</Label>
              <Textarea
                value={form.address}
                onChange={(event) =>
                  updateField('address', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-gray-300">
                Customer Home Welcome Text
              </Label>
              <Input
                value={form.home_welcome_text}
                onChange={(event) =>
                  updateField(
                    'home_welcome_text',
                    event.target.value,
                  )
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="text-gray-300">
                Receipt Footer
              </Label>
              <Textarea
                value={form.receipt_footer}
                onChange={(event) =>
                  updateField(
                    'receipt_footer',
                    event.target.value,
                  )
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-semibold">
              App Icons & Logos
            </h2>
          </div>

          <p className="text-gray-500 text-xs">
            Upload a separate square icon for the Customer, Admin, Kitchen and Rider apps. A 512 x 512 PNG or WebP image is recommended.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {LOGO_FIELDS.map((field) => {
              const url = form[field.key] || field.fallback;

              return (
                <div
                  key={field.key}
                  className="border border-gray-800 rounded-xl p-4"
                >
                  <Label className="text-gray-300">
                    {field.label}
                  </Label>

                  <div className="flex items-center gap-3 mt-3">
                    <img
                      src={url}
                      alt={field.label}
                      className="w-16 h-16 rounded-xl object-cover bg-gray-800"
                    />

                    <div className="flex-1">
                      <input
                        ref={(element) => {
                          fileInputs.current[field.key] =
                            element;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(event) =>
                          void uploadLogo(field.key, event)
                        }
                      />

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          fileInputs.current[
                            field.key
                          ]?.click()
                        }
                        disabled={
                          uploadingField === field.key
                        }
                        className="border-gray-700 text-gray-300"
                      >
                        {uploadingField === field.key ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Upload
                      </Button>
                    </div>
                  </div>

                  <Input
                    value={form[field.key]}
                    onChange={(event) =>
                      updateField(
                        field.key,
                        event.target.value,
                      )
                    }
                    placeholder="Or paste image URL"
                    className="mt-3 bg-gray-800 border-gray-700 text-white text-xs"
                  />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-purple-400" />
            <h2 className="text-white font-semibold">
              App Names & Colors
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {(
              [
                ['customer_app_name', 'Customer App Name'],
                ['admin_app_name', 'Admin App Name'],
                ['kitchen_app_name', 'Kitchen App Name'],
                ['rider_app_name', 'Rider App Name'],
              ] as Array<[keyof BrandSettings, string]>
            ).map(([key, label]) => (
              <div key={key}>
                <Label className="text-gray-300">
                  {label}
                </Label>
                <Input
                  value={String(form[key])}
                  onChange={(event) =>
                    updateField(key, event.target.value)
                  }
                  className="mt-1 bg-gray-800 border-gray-700 text-white"
                />
              </div>
            ))}

            {(
              [
                ['primary_color', 'Customer Color'],
                ['admin_color', 'Admin Color'],
                ['kitchen_color', 'Kitchen Color'],
                ['rider_color', 'Rider Color'],
              ] as Array<[keyof BrandSettings, string]>
            ).map(([key, label]) => (
              <div key={key}>
                <Label className="text-gray-300">
                  {label}
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="color"
                    value={String(form[key])}
                    onChange={(event) =>
                      updateField(key, event.target.value)
                    }
                    className="w-16 bg-gray-800 border-gray-700"
                  />
                  <Input
                    value={String(form[key])}
                    onChange={(event) =>
                      updateField(key, event.target.value)
                    }
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                </div>
              </div>
            ))}

            <div>
              <Label className="text-gray-300">Currency</Label>
              <Input
                value={form.currency}
                onChange={(event) =>
                  updateField('currency', event.target.value)
                }
                className="mt-1 bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Save className="w-5 h-5 mr-2" />
          )}
          Save Brand & App Settings
        </Button>

        <Card className="bg-red-950/30 border-red-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="text-white font-semibold">
                Delete Old Menu & Install Fai Fai Menu
              </h2>
              <p className="text-red-200/70 text-xs">
                Pizza menu, old categories, extras, offers aur
                deals permanently delete honge. Orders aur sales
                delete nahi honge.
              </p>
            </div>
          </div>

          <Input
            value={confirmText}
            onChange={(event) =>
              setConfirmText(event.target.value)
            }
            placeholder="Type: DELETE OLD MENU"
            className="bg-gray-950 border-red-900 text-white"
          />

          <Button
            onClick={() => void replaceMenu()}
            disabled={replacingMenu}
            className="w-full bg-red-700 hover:bg-red-800 text-white"
          >
            {replacingMenu ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5 mr-2" />
            )}
            Permanently Replace Menu
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/menu')}
            className="w-full border-gray-700 text-gray-300"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Menu Management
          </Button>
        </Card>
      </div>
    </div>
  );
}
