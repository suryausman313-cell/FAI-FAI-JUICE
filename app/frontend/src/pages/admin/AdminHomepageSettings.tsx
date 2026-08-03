import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import AdminSettingsPageLayout from '@/components/admin/AdminSettingsPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ExtendedSettings,
  loadRestaurantSettings,
  readExtendedSettings,
  saveExtendedSettings,
  updateRestaurantSettings,
} from '@/lib/admin-settings-store';

type HomepageForm = Pick<
  ExtendedSettings,
  | 'show_branding'
  | 'show_notifications'
  | 'show_status_banner'
  | 'show_offers'
  | 'show_quick_actions'
  | 'show_menu_action'
  | 'show_deals_action'
  | 'show_orders_action'
  | 'show_contact_action'
  | 'show_popular_items'
  | 'show_reviews'
  | 'blog_enabled'
  | 'show_restaurant_info'
  | 'show_bottom_nav'
  | 'popular_auto_enabled'
  | 'popular_manual_enabled'
  | 'popular_max_items'
>;

type QuickActionKey =
  | 'show_menu_action'
  | 'show_deals_action'
  | 'show_orders_action'
  | 'show_contact_action';

const rows: Array<{
  key: keyof HomepageForm;
  title: string;
  description: string;
}> = [
  {
    key: 'show_branding',
    title: 'Branding & Welcome Banner',
    description: 'Shop name, slogan and custom welcome banner',
  },
  {
    key: 'show_notifications',
    title: 'Customer Notifications',
    description: 'Notification messages at the top of the homepage',
  },
  {
    key: 'show_status_banner',
    title: 'Status Banner',
    description: 'Open, Busy or Closed message',
  },
  {
    key: 'show_offers',
    title: 'Special Offers Carousel',
    description: 'Active promotion slider',
  },
  {
    key: 'show_quick_actions',
    title: 'Quick Action Buttons',
    description: 'Menu, Deals, Orders and Contact',
  },
  {
    key: 'show_popular_items',
    title: 'Popular Items',
    description: 'Popular menu items grid',
  },
  {
    key: 'show_reviews',
    title: 'Customer Reviews',
    description: 'Reviews and feedback section',
  },
  {
    key: 'blog_enabled',
    title: 'Blog & Pizza Tips',
    description: 'Blog link on customer homepage',
  },
  {
    key: 'show_restaurant_info',
    title: 'Restaurant Information',
    description: 'Hours, phone and address',
  },
  {
    key: 'show_bottom_nav',
    title: 'Bottom Navigation',
    description: 'Home, Menu, Orders and Feedback tabs',
  },
];

const quickActionRows: Array<{
  key: QuickActionKey;
  title: string;
  description: string;
}> = [
  {
    key: 'show_menu_action',
    title: 'Menu Button',
    description: 'Open the full customer menu',
  },
  {
    key: 'show_deals_action',
    title: 'Deals Button',
    description: 'Show or hide Deals on Customer Home',
  },
  {
    key: 'show_orders_action',
    title: 'My Orders Button',
    description: 'Open customer order history and tracking',
  },
  {
    key: 'show_contact_action',
    title: 'Contact Button',
    description: 'Open the restaurant contact page',
  },
];

export default function AdminHomepageSettings() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [form, setForm] = useState<HomepageForm>(() => {
    const local = readExtendedSettings();
    return {
      show_branding: local.show_branding,
      show_notifications: local.show_notifications,
      show_status_banner: local.show_status_banner,
      show_offers: local.show_offers,
      show_quick_actions: local.show_quick_actions,
      show_menu_action: local.show_menu_action,
      show_deals_action: local.show_deals_action,
      show_orders_action: local.show_orders_action,
      show_contact_action: local.show_contact_action,
      show_popular_items: local.show_popular_items,
      show_reviews: local.show_reviews,
      blog_enabled: local.blog_enabled,
      show_restaurant_info: local.show_restaurant_info,
      show_bottom_nav: local.show_bottom_nav,
      popular_auto_enabled: local.popular_auto_enabled,
      popular_manual_enabled: local.popular_manual_enabled,
      popular_max_items: local.popular_max_items,
    };
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const settings = await loadRestaurantSettings();
      if (!settings) return;

      setSettingsId(Number(settings.id));
      setForm(current => ({
        ...current,
        show_branding: settings.show_branding ?? current.show_branding,
        show_notifications:
          settings.show_notifications ?? current.show_notifications,
        show_status_banner:
          settings.show_status_banner ?? current.show_status_banner,
        show_offers: settings.show_offers ?? current.show_offers,
        show_quick_actions:
          settings.show_quick_actions ?? current.show_quick_actions,
        show_menu_action:
          settings.show_menu_action ?? current.show_menu_action,
        show_deals_action:
          settings.show_deals_action ?? current.show_deals_action,
        show_orders_action:
          settings.show_orders_action ?? current.show_orders_action,
        show_contact_action:
          settings.show_contact_action ?? current.show_contact_action,
        show_popular_items:
          settings.show_popular_items ?? current.show_popular_items,
        show_reviews: settings.show_reviews ?? current.show_reviews,
        blog_enabled: settings.blog_enabled ?? current.blog_enabled,
        show_restaurant_info:
          settings.show_restaurant_info ?? current.show_restaurant_info,
        show_bottom_nav:
          settings.show_bottom_nav ?? current.show_bottom_nav,
        popular_auto_enabled:
          settings.popular_auto_enabled ?? current.popular_auto_enabled,
        popular_manual_enabled:
          settings.popular_manual_enabled ??
          current.popular_manual_enabled,
        popular_max_items: String(
          settings.popular_max_items || current.popular_max_items,
        ),
      }));
    } catch (error) {
      console.error(error);
    }
  }

  async function save() {
    if (!settingsId) {
      toast.error('Restaurant settings record was not found');
      return;
    }

    setSaving(true);
    try {
      const backendData = {
        ...form,
        popular_max_items:
          Number.parseInt(form.popular_max_items, 10) || 6,
      };

      await updateRestaurantSettings(settingsId, backendData);
      saveExtendedSettings(form);
      toast.success('Homepage settings saved');
    } catch (error: any) {
      toast.error(error?.message || 'Could not save homepage settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSettingsPageLayout
      title="Homepage Control"
      subtitle="Choose exactly what customers see on the home screen"
    >
      <div className="space-y-5">
        <Card className="bg-gray-900 border-gray-800 p-6">
          <div className="space-y-3">
            {rows.map(row => (
              <div
                key={row.key}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700"
              >
                <div>
                  <Label className="text-gray-200">{row.title}</Label>
                  <p className="text-gray-500 text-xs mt-1">
                    {row.description}
                  </p>
                </div>

                <Switch
                  checked={Boolean(form[row.key])}
                  onCheckedChange={checked =>
                    setForm({ ...form, [row.key]: checked })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-1">
            Individual Quick Action Buttons
          </h2>
          <p className="text-gray-500 text-xs mb-4">
            The Quick Action Buttons master switch above must also be ON.
          </p>
          <div className="space-y-3">
            {quickActionRows.map(row => (
              <div
                key={row.key}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700"
              >
                <div>
                  <Label className="text-gray-200">{row.title}</Label>
                  <p className="text-gray-500 text-xs mt-1">
                    {row.description}
                  </p>
                </div>
                <Switch
                  checked={form[row.key]}
                  onCheckedChange={checked =>
                    setForm({ ...form, [row.key]: checked })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-6">
          <h2 className="text-white font-semibold mb-4">
            Popular Items Control
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700">
              <div>
                <Label className="text-gray-200">Auto-Popular</Label>
                <p className="text-gray-500 text-xs mt-1">
                  Use the most ordered menu items
                </p>
              </div>
              <Switch
                checked={form.popular_auto_enabled}
                onCheckedChange={checked =>
                  setForm({ ...form, popular_auto_enabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800 border border-gray-700">
              <div>
                <Label className="text-gray-200">Manual Selection</Label>
                <p className="text-gray-500 text-xs mt-1">
                  Allow items marked popular from Menu
                </p>
              </div>
              <Switch
                checked={form.popular_manual_enabled}
                onCheckedChange={checked =>
                  setForm({ ...form, popular_manual_enabled: checked })
                }
              />
            </div>

            <div>
              <Label className="text-gray-300">
                Maximum Popular Items
              </Label>
              <Input
                type="number"
                min="2"
                max="12"
                value={form.popular_max_items}
                onChange={event =>
                  setForm({
                    ...form,
                    popular_max_items: event.target.value,
                  })
                }
                className="bg-gray-800 border-gray-700 text-white mt-1 w-28"
              />
            </div>
          </div>
        </Card>

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-6"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Homepage Settings'}
        </Button>
      </div>
    </AdminSettingsPageLayout>
  );
}
