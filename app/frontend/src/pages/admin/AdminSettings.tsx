import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, MapPin, LocateFixed } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { client, RestaurantSettings } from '@/lib/api';

interface RiderInfo {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    restaurant_name: '',
    phone: '',
    address: '',
    opening_hours: '',
  });
  // Extended settings stored in localStorage
  const [extendedForm, setExtendedForm] = useState({
    delivery_enabled: false,
    delivery_charges: '5',
    estimated_delivery_time: '30-45 min',
    tax_percent: '5',
    promo_code: '',
    promo_discount: '0',
    offer_text: '',
    banner_text: '',
    kitchen_pin: '1234',
    admin_username: 'vitanapoli',
    admin_password: 'admin2024',
    auto_schedule_enabled: false,
    auto_open_time: '15:00',
    auto_close_time: '02:00',
    restaurant_lat: '25.2747',
    restaurant_lng: '56.3450',
    near_radius: '5',
    far_radius: '15',
    near_charge: '5',
    far_charge: '15',
    service_fee_enabled: false,
    service_fee_amount: '0',
    service_fee_type: 'fixed',  // 'fixed' or 'percentage'
    service_fee_applies_to: 'both',
    small_order_fee_enabled: false,
    small_order_fee_amount: '0',
    small_order_fee_threshold: '20',
    cash_enabled_pickup: true,
    card_enabled_pickup: true,
    cash_enabled_delivery: true,
    card_enabled_delivery: true,
    allowed_country_codes: '+971,+91,+92,+44,+1',
    blog_enabled: true,
    allow_cancel_preparing: false,
    allow_cancel_ready: false,
    allow_modify_preparing: false,
    order_accept_timeout_minutes: '5',
    order_expire_timeout_minutes: '15',
    // Checkout flow control
    checkout_flow: 'two_step' as 'two_step' | 'direct',
    // Homepage section toggles
    show_status_banner: true,
    show_offers: true,
    show_quick_actions: true,
    show_popular_items: true,
    show_reviews: true,
    show_restaurant_info: true,
    show_bottom_nav: true,
    // Popular items control
    popular_auto_enabled: true,
    popular_manual_enabled: true,
    popular_max_items: '6',
  });

  // Riders
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderPin, setNewRiderPin] = useState('');
  const [addingRider, setAddingRider] = useState(false);
  const [editingRiderId, setEditingRiderId] = useState<number | null>(null);
  const [editRiderName, setEditRiderName] = useState('');
  const [editRiderPhone, setEditRiderPhone] = useState('');
  const [editRiderPin, setEditRiderPin] = useState('');

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); setLoading(false); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); setLoading(false); return; }
    } catch { navigate('/admin'); setLoading(false); return; }
    await loadSettings();
    await loadRiders();
    setLoading(false);
  }

  async function loadSettings() {
    try {
      const res = await client.entities.restaurant_settings.query({ query: {}, limit: 1 });
      if (res?.data?.items?.length > 0) {
        const s = res.data.items[0] as any;
        setSettings(s);
        setForm({
          restaurant_name: s.restaurant_name || '',
          phone: s.phone || '',
          address: s.address || '',
          opening_hours: s.opening_hours || '',
        });
        // Load delivery settings from backend entity
        setExtendedForm(prev => ({
          ...prev,
          delivery_enabled: s.delivery_enabled === true,
          delivery_charges: s.delivery_charges || prev.delivery_charges,
          estimated_delivery_time: s.estimated_delivery_time || prev.estimated_delivery_time,
          restaurant_lat: s.restaurant_lat || prev.restaurant_lat,
          restaurant_lng: s.restaurant_lng || prev.restaurant_lng,
          near_radius: s.near_radius || prev.near_radius,
          far_radius: s.far_radius || prev.far_radius,
          near_charge: s.near_charge || prev.near_charge,
          far_charge: s.far_charge || prev.far_charge,
          auto_schedule_enabled: s.auto_schedule_enabled === true,
          auto_open_time: s.auto_open_time || prev.auto_open_time,
          auto_close_time: s.auto_close_time || prev.auto_close_time,
          service_fee_enabled: s.service_fee_enabled === true,
          service_fee_amount: String(s.service_fee_amount || 0),
          service_fee_type: s.service_fee_type || 'fixed',
          service_fee_applies_to: s.service_fee_applies_to || 'both',
          small_order_fee_enabled: s.small_order_fee_enabled === true,
          small_order_fee_amount: String(s.small_order_fee_amount || 0),
          small_order_fee_threshold: String(s.small_order_fee_threshold || 20),
          cash_enabled_pickup: s.cash_enabled_pickup !== false,
          card_enabled_pickup: s.card_enabled_pickup !== false,
          cash_enabled_delivery: s.cash_enabled_delivery !== false,
          card_enabled_delivery: s.card_enabled_delivery !== false,
          // Order timer & cancel settings
          allow_cancel_preparing: s.allow_cancel_preparing === true,
          allow_cancel_ready: s.allow_cancel_ready === true,
          allow_modify_preparing: s.allow_modify_preparing === true,
          order_accept_timeout_minutes: String(s.order_accept_timeout_minutes || 5),
          order_expire_timeout_minutes: String(s.order_expire_timeout_minutes || 15),
          // Checkout flow
          checkout_flow: s.checkout_flow || 'two_step',
        }));
      }
      // Load admin-only settings from localStorage (kitchen pin, credentials, homepage toggles)
      const ext = localStorage.getItem('extended_settings');
      if (ext) {
        const parsed = JSON.parse(ext);
        setExtendedForm(prev => ({
          ...prev,
          kitchen_pin: parsed.kitchen_pin || prev.kitchen_pin,
          admin_username: parsed.admin_username || prev.admin_username,
          admin_password: parsed.admin_password || prev.admin_password,
          tax_percent: parsed.tax_percent || prev.tax_percent,
          promo_code: parsed.promo_code || prev.promo_code,
          promo_discount: parsed.promo_discount || prev.promo_discount,
          offer_text: parsed.offer_text || prev.offer_text,
          banner_text: parsed.banner_text || prev.banner_text,
          allowed_country_codes: parsed.allowed_country_codes || prev.allowed_country_codes,
          blog_enabled: parsed.blog_enabled !== undefined ? parsed.blog_enabled : prev.blog_enabled,
          // Homepage section toggles
          show_status_banner: parsed.show_status_banner !== undefined ? parsed.show_status_banner : prev.show_status_banner,
          show_offers: parsed.show_offers !== undefined ? parsed.show_offers : prev.show_offers,
          show_quick_actions: parsed.show_quick_actions !== undefined ? parsed.show_quick_actions : prev.show_quick_actions,
          show_popular_items: parsed.show_popular_items !== undefined ? parsed.show_popular_items : prev.show_popular_items,
          show_reviews: parsed.show_reviews !== undefined ? parsed.show_reviews : prev.show_reviews,
          show_restaurant_info: parsed.show_restaurant_info !== undefined ? parsed.show_restaurant_info : prev.show_restaurant_info,
          show_bottom_nav: parsed.show_bottom_nav !== undefined ? parsed.show_bottom_nav : prev.show_bottom_nav,
          // Popular items control
          popular_auto_enabled: parsed.popular_auto_enabled !== undefined ? parsed.popular_auto_enabled : prev.popular_auto_enabled,
          popular_manual_enabled: parsed.popular_manual_enabled !== undefined ? parsed.popular_manual_enabled : prev.popular_manual_enabled,
          popular_max_items: parsed.popular_max_items || prev.popular_max_items,
        }));
      }
    } catch (e) { console.error('Failed to load settings:', e); }
  }

  async function loadRiders() {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/rider/admin/list',
        method: 'GET',
      });
      setRiders(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load riders:', e);
    }
  }

  async function addRider() {
    if (!newRiderName || !newRiderPhone || !newRiderPin) {
      toast.error('Please fill all rider fields');
      return;
    }
    setAddingRider(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/rider/admin/create',
        method: 'POST',
        data: { name: newRiderName, phone: newRiderPhone, pin: newRiderPin },
      });
      toast.success('Rider added!');
      setNewRiderName('');
      setNewRiderPhone('');
      setNewRiderPin('');
      await loadRiders();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to add rider');
    } finally {
      setAddingRider(false);
    }
  }

  function startEditRider(rider: RiderInfo) {
    setEditingRiderId(rider.id);
    setEditRiderName(rider.name);
    setEditRiderPhone(rider.phone);
    setEditRiderPin('');
  }

  function cancelEditRider() {
    setEditingRiderId(null);
    setEditRiderName('');
    setEditRiderPhone('');
    setEditRiderPin('');
  }

  async function saveEditRider(riderId: number) {
    if (!editRiderName || !editRiderPhone) {
      toast.error('Name and phone are required');
      return;
    }
    try {
      const updateData: any = { name: editRiderName, phone: editRiderPhone };
      if (editRiderPin) updateData.pin = editRiderPin;
      await client.apiCall.invoke({
        url: `/api/v1/rider/admin/${riderId}`,
        method: 'PUT',
        data: updateData,
      });
      toast.success('Rider updated!');
      cancelEditRider();
      await loadRiders();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to update rider');
    }
  }

  async function deleteRider(riderId: number, riderName: string) {
    if (!confirm(`Delete rider "${riderName}"? This cannot be undone.`)) return;
    try {
      await client.apiCall.invoke({
        url: `/api/v1/rider/admin/${riderId}`,
        method: 'DELETE',
      });
      toast.success('Rider deleted!');
      await loadRiders();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to delete rider');
    }
  }

  async function toggleRiderActive(riderId: number, currentActive: boolean) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/rider/admin/${riderId}`,
        method: 'PUT',
        data: { is_active: !currentActive },
      });
      toast.success(currentActive ? 'Rider deactivated' : 'Rider activated');
      await loadRiders();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to update rider');
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      // Save basic + delivery + fee settings to backend entity (accessible to all users)
      await client.entities.restaurant_settings.update({
        id: String(settings.id),
        data: {
          ...form,
          delivery_enabled: extendedForm.delivery_enabled,
          delivery_charges: extendedForm.delivery_charges,
          estimated_delivery_time: extendedForm.estimated_delivery_time,
          restaurant_lat: extendedForm.restaurant_lat,
          restaurant_lng: extendedForm.restaurant_lng,
          near_radius: extendedForm.near_radius,
          far_radius: extendedForm.far_radius,
          near_charge: extendedForm.near_charge,
          far_charge: extendedForm.far_charge,
          auto_schedule_enabled: extendedForm.auto_schedule_enabled,
          auto_open_time: extendedForm.auto_open_time,
          auto_close_time: extendedForm.auto_close_time,
          service_fee_enabled: extendedForm.service_fee_enabled,
          service_fee_amount: parseFloat(extendedForm.service_fee_amount) || 0,
          service_fee_type: extendedForm.service_fee_type,
          service_fee_applies_to: extendedForm.service_fee_applies_to,
          small_order_fee_enabled: extendedForm.small_order_fee_enabled,
          small_order_fee_amount: parseFloat(extendedForm.small_order_fee_amount) || 0,
          small_order_fee_threshold: parseFloat(extendedForm.small_order_fee_threshold) || 20,
          cash_enabled_pickup: extendedForm.cash_enabled_pickup,
          card_enabled_pickup: extendedForm.card_enabled_pickup,
          cash_enabled_delivery: extendedForm.cash_enabled_delivery,
          card_enabled_delivery: extendedForm.card_enabled_delivery,
        },
      });
      // Also save to localStorage for admin-only settings (kitchen pin, credentials, country codes, blog toggle)
      localStorage.setItem('extended_settings', JSON.stringify(extendedForm));
      // Save country codes, blog toggle, and homepage section toggles to backend for customer app access
      try {
        await client.entities.restaurant_settings.update({
          id: String(settings.id),
          data: {
            allowed_country_codes: extendedForm.allowed_country_codes,
            blog_enabled: extendedForm.blog_enabled,
            allow_cancel_preparing: extendedForm.allow_cancel_preparing,
            allow_cancel_ready: extendedForm.allow_cancel_ready,
            allow_modify_preparing: extendedForm.allow_modify_preparing,
            order_accept_timeout_minutes: parseInt(extendedForm.order_accept_timeout_minutes) || 5,
            order_expire_timeout_minutes: parseInt(extendedForm.order_expire_timeout_minutes) || 15,
            // Checkout flow
            checkout_flow: extendedForm.checkout_flow,
            // Homepage section visibility
            show_status_banner: extendedForm.show_status_banner,
            show_offers: extendedForm.show_offers,
            show_quick_actions: extendedForm.show_quick_actions,
            show_popular_items: extendedForm.show_popular_items,
            show_reviews: extendedForm.show_reviews,
            show_restaurant_info: extendedForm.show_restaurant_info,
            show_bottom_nav: extendedForm.show_bottom_nav,
            // Popular items control
            popular_auto_enabled: extendedForm.popular_auto_enabled,
            popular_manual_enabled: extendedForm.popular_manual_enabled,
            popular_max_items: parseInt(extendedForm.popular_max_items) || 6,
          },
        });
      } catch { /* already saved main settings above */ }
      toast.success('All settings saved!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-white text-2xl font-bold">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Language Management Link */}
          <Card
            className="bg-gray-900 border-gray-800 p-4 cursor-pointer hover:border-gray-700 transition-colors"
            onClick={() => navigate('/admin/languages')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <span className="text-lg">🌐</span>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Language Management</h3>
                  <p className="text-gray-500 text-xs">Manage multi-language support (EN, AR, UR)</p>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-gray-500 rotate-180" />
            </div>
          </Card>

          {/* Restaurant Info */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Restaurant Information</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Restaurant Name</Label>
                <Input value={form.restaurant_name} onChange={e => setForm({ ...form, restaurant_name: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">Phone Number</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-300">📍 Shop Location / Address (shown to customers)</Label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" placeholder="e.g. Murbah, Fujairah, UAE" />
                <p className="text-gray-500 text-xs mt-1">This address is displayed on the customer homepage and contact page</p>
              </div>
              <div>
                <Label className="text-gray-300">Opening Hours</Label>
                <Input value={form.opening_hours} onChange={e => setForm({ ...form, opening_hours: e.target.value })} className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
          </Card>

          {/* Phone Country Codes */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">📱 Allowed Phone Country Codes</h3>
            <p className="text-gray-400 text-sm mb-3">
              Add country codes that customers can use. Separate with commas. Default: +971 (UAE)
            </p>
            <div>
              <Label className="text-gray-300">Country Codes (comma-separated)</Label>
              <Input
                value={extendedForm.allowed_country_codes}
                onChange={e => setExtendedForm({ ...extendedForm, allowed_country_codes: e.target.value })}
                placeholder="+971,+91,+92,+44,+1"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
              <p className="text-gray-500 text-xs mt-2">
                Examples: +971 (UAE), +91 (India), +92 (Pakistan), +44 (UK), +1 (US/Canada), +966 (Saudi)
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {extendedForm.allowed_country_codes.split(',').filter(Boolean).map((code, i) => (
                  <span key={i} className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-green-400">
                    {code.trim()}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* Checkout Flow Control */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">🛒 Checkout Flow</h3>
            <p className="text-gray-400 text-sm mb-4">Control how customers proceed from cart to placing an order</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setExtendedForm({ ...extendedForm, checkout_flow: 'two_step' as 'two_step' | 'direct' })}
                className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                  extendedForm.checkout_flow === 'two_step'
                    ? 'border-red-600 bg-red-600/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📋</span>
                  <div>
                    <p className={`font-medium text-sm ${extendedForm.checkout_flow === 'two_step' ? 'text-white' : 'text-gray-300'}`}>
                      Two-Step (Cart → Checkout)
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Customer sees cart items first, then clicks "Proceed to Checkout" to fill details
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setExtendedForm({ ...extendedForm, checkout_flow: 'direct' as 'two_step' | 'direct' })}
                className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                  extendedForm.checkout_flow === 'direct'
                    ? 'border-red-600 bg-red-600/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">⚡</span>
                  <div>
                    <p className={`font-medium text-sm ${extendedForm.checkout_flow === 'direct' ? 'text-white' : 'text-gray-300'}`}>
                      Direct (Cart + Checkout together)
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Customer sees items + checkout form on same page (name, phone, location, Place Order)
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </Card>

          {/* Homepage Content Control - FULL Admin Control */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">🏠 Homepage Sections Control</h3>
            <p className="text-gray-400 text-sm mb-4">Show/hide any section on the customer homepage</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Status Banner</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Open/Busy/Closed message</p>
                </div>
                <Switch
                  checked={extendedForm.show_status_banner !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_status_banner: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Special Offers Carousel</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Active promotions slider</p>
                </div>
                <Switch
                  checked={extendedForm.show_offers !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_offers: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Quick Action Buttons</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Menu, Deals, Orders, Contact buttons</p>
                </div>
                <Switch
                  checked={extendedForm.show_quick_actions !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_quick_actions: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Popular Items</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Featured/popular menu items grid</p>
                </div>
                <Switch
                  checked={extendedForm.show_popular_items !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_popular_items: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Customer Reviews</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Reviews/feedback link section</p>
                </div>
                <Switch
                  checked={extendedForm.show_reviews !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_reviews: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Blog & Pizza Tips</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Blog link on customer homepage</p>
                </div>
                <Switch
                  checked={extendedForm.blog_enabled}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, blog_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Restaurant Info</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Hours, phone, address section</p>
                </div>
                <Switch
                  checked={extendedForm.show_restaurant_info !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_restaurant_info: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Bottom Navigation</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Home, Menu, Orders, Feedback tabs</p>
                </div>
                <Switch
                  checked={extendedForm.show_bottom_nav !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, show_bottom_nav: checked })}
                />
              </div>
            </div>
          </Card>

          {/* Popular Items Control */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">⭐ Popular Items Control</h3>
            <p className="text-gray-400 text-sm mb-4">Configure how popular items are determined on the homepage</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Auto-Popular (from orders)</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Automatically show most-ordered items as popular</p>
                </div>
                <Switch
                  checked={extendedForm.popular_auto_enabled !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, popular_auto_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Manual Popular Selection</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Admin can manually mark items as popular from Menu page</p>
                </div>
                <Switch
                  checked={extendedForm.popular_manual_enabled !== false}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, popular_manual_enabled: checked })}
                />
              </div>
              <div>
                <Label className="text-gray-300">Max Popular Items Shown</Label>
                <Input
                  type="number"
                  min="2"
                  max="12"
                  value={extendedForm.popular_max_items || '6'}
                  onChange={e => setExtendedForm({ ...extendedForm, popular_max_items: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1 w-24"
                />
                <p className="text-gray-500 text-xs mt-1">Number of popular items to display (2-12)</p>
              </div>
            </div>
          </Card>

          {/* Order Timer & Cancellation */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">⏱️ Order Timer & Cancellation</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300 text-sm">Accept Timeout (minutes)</Label>
                  <p className="text-gray-500 text-xs mb-1">Auto-expire if not accepted</p>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    className="bg-gray-800 border-gray-700 text-white"
                    value={extendedForm.order_accept_timeout_minutes}
                    onChange={(e) => setExtendedForm({ ...extendedForm, order_accept_timeout_minutes: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm">Expire Timeout (minutes)</Label>
                  <p className="text-gray-500 text-xs mb-1">Total order lifetime limit</p>
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    className="bg-gray-800 border-gray-700 text-white"
                    value={extendedForm.order_expire_timeout_minutes}
                    onChange={(e) => setExtendedForm({ ...extendedForm, order_expire_timeout_minutes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Allow Cancel During Preparing</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Customer can cancel after order is being prepared</p>
                </div>
                <Switch
                  checked={extendedForm.allow_cancel_preparing}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, allow_cancel_preparing: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Allow Cancel When Ready</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Customer can cancel after order is ready for pickup</p>
                </div>
                <Switch
                  checked={extendedForm.allow_cancel_ready}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, allow_cancel_ready: checked })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
                <div>
                  <Label className="text-gray-300">Allow Modify During Preparing</Label>
                  <p className="text-gray-500 text-xs mt-0.5">Customer can modify items while order is being prepared</p>
                </div>
                <Switch
                  checked={extendedForm.allow_modify_preparing}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, allow_modify_preparing: checked })}
                />
              </div>
            </div>
          </Card>

          {/* Auto Schedule */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Auto Open/Close Schedule</h3>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${extendedForm.auto_schedule_enabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {extendedForm.auto_schedule_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={extendedForm.auto_schedule_enabled}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, auto_schedule_enabled: checked })}
                />
              </div>
            </div>
            {extendedForm.auto_schedule_enabled && (
              <div className="space-y-4 pt-2 border-t border-gray-800 mt-4">
                <p className="text-gray-400 text-sm">Restaurant will automatically open and close at these times daily (like Talabat)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-300">Open Time</Label>
                    <Input
                      type="time"
                      value={extendedForm.auto_open_time}
                      onChange={e => setExtendedForm({ ...extendedForm, auto_open_time: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Close Time</Label>
                    <Input
                      type="time"
                      value={extendedForm.auto_close_time}
                      onChange={e => setExtendedForm({ ...extendedForm, auto_close_time: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                    />
                  </div>
                </div>
                <p className="text-yellow-400/80 text-xs">⚠️ Manual override from Dashboard is still available. Schedule resets daily.</p>
              </div>
            )}
          </Card>

          {/* Delivery Settings */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Delivery Settings</h3>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${extendedForm.delivery_enabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {extendedForm.delivery_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={extendedForm.delivery_enabled}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, delivery_enabled: checked })}
                />
              </div>
            </div>
            {extendedForm.delivery_enabled && (
              <div className="space-y-4 pt-2 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label className="text-gray-300">Estimated Delivery Time</Label>
                    <Input
                      value={extendedForm.estimated_delivery_time}
                      onChange={e => setExtendedForm({ ...extendedForm, estimated_delivery_time: e.target.value })}
                      placeholder="e.g. 30-45 min"
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                    />
                  </div>
                </div>

                {/* Multi-Zone Delivery Settings */}
                <div className="pt-3 border-t border-gray-800">
                  <h4 className="text-white font-medium text-sm mb-3">🗺️ Delivery Zones (Distance-Based Charges)</h4>
                  <p className="text-gray-400 text-xs mb-3">Configure multiple zones with different charges. The delivery charge = rider earnings for that zone.</p>
                  <DeliveryZonesManager />
                </div>

                <p className="text-yellow-400/80 text-xs">⚠️ When enabled, customers will see delivery as an option at checkout with map-based location selection</p>
              </div>
            )}
          </Card>

          {/* Restaurant Location (Map) */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-red-400" />
              <h3 className="text-white font-semibold">Set Shop Location</h3>
            </div>
            <p className="text-gray-400 text-sm mb-3">
              Drag the pin on the map to set your exact shop location, or go to the shop and click "Use My Current Location".
            </p>
            <div className="flex items-center gap-3 mb-3">
              <Button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    toast.error('Geolocation not supported by your browser');
                    return;
                  }
                  toast.info('Getting your location...');
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      const lat = pos.coords.latitude.toFixed(6);
                      const lng = pos.coords.longitude.toFixed(6);
                      setExtendedForm(prev => ({ ...prev, restaurant_lat: lat, restaurant_lng: lng }));
                      toast.success(`Location set: ${lat}, ${lng}`);
                    },
                    (err) => {
                      toast.error(`Location error: ${err.message}`);
                    },
                    { enableHighAccuracy: true, timeout: 15000 }
                  );
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                <LocateFixed className="w-4 h-4 mr-2" /> Use My Current Location
              </Button>
              <span className="text-gray-500 text-xs">
                Lat: {extendedForm.restaurant_lat}, Lng: {extendedForm.restaurant_lng}
              </span>
            </div>
            <LocationMap
              lat={parseFloat(extendedForm.restaurant_lat)}
              lng={parseFloat(extendedForm.restaurant_lng)}
              onLocationChange={(lat, lng) => {
                setExtendedForm(prev => ({ ...prev, restaurant_lat: lat.toFixed(6), restaurant_lng: lng.toFixed(6) }));
              }}
            />
            <p className="text-yellow-400/80 text-xs mt-2">⚠️ This location is used for delivery zone center, customer "Find Us" map, and delivery radius calculations. Remember to Save.</p>
          </Card>

          {/* Rider Management */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Delivery Riders</h3>
            {riders.length > 0 && (
              <div className="space-y-2 mb-4">
                {riders.map(rider => (
                  <div key={rider.id} className="p-3 bg-gray-800 rounded-lg">
                    {editingRiderId === rider.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            value={editRiderName}
                            onChange={e => setEditRiderName(e.target.value)}
                            placeholder="Name"
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                          />
                          <Input
                            value={editRiderPhone}
                            onChange={e => setEditRiderPhone(e.target.value)}
                            placeholder="Phone"
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                          />
                          <Input
                            value={editRiderPin}
                            onChange={e => setEditRiderPin(e.target.value)}
                            placeholder="New PIN (optional)"
                            maxLength={6}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => saveEditRider(rider.id)}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                          >
                            <Check className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button
                            onClick={cancelEditRider}
                            size="sm"
                            variant="ghost"
                            className="text-gray-400 cursor-pointer"
                          >
                            <X className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-white text-sm font-medium">{rider.name}</span>
                            <span className="text-gray-500 text-xs ml-2">{rider.phone}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rider.is_active}
                            onCheckedChange={() => toggleRiderActive(rider.id, rider.is_active)}
                          />
                          <Button
                            onClick={() => startEditRider(rider)}
                            size="sm"
                            variant="ghost"
                            className="text-blue-400 hover:text-blue-300 cursor-pointer p-1 h-auto"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            onClick={() => deleteRider(rider.id, rider.name)}
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 cursor-pointer p-1 h-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {riders.length === 0 && (
              <p className="text-gray-500 text-sm mb-4">No riders added yet.</p>
            )}
            <div className="space-y-3 pt-3 border-t border-gray-800">
              <p className="text-gray-400 text-sm">Add New Rider</p>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={newRiderName}
                  onChange={e => setNewRiderName(e.target.value)}
                  placeholder="Name"
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <Input
                  value={newRiderPhone}
                  onChange={e => setNewRiderPhone(e.target.value)}
                  placeholder="Phone"
                  className="bg-gray-800 border-gray-700 text-white"
                />
                <Input
                  value={newRiderPin}
                  onChange={e => setNewRiderPin(e.target.value)}
                  placeholder="PIN"
                  maxLength={6}
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </div>
              <Button
                onClick={addRider}
                disabled={addingRider}
                className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Rider
              </Button>
            </div>
          </Card>

          {/* Offers & Promos */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Offers & Promotions</h3>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-300">Banner Text (shown on homepage)</Label>
                <Textarea
                  value={extendedForm.banner_text}
                  onChange={e => setExtendedForm({ ...extendedForm, banner_text: e.target.value })}
                  placeholder="e.g. 🎉 20% OFF on all pizzas this weekend!"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-gray-300">Offer Text (shown in menu)</Label>
                <Input
                  value={extendedForm.offer_text}
                  onChange={e => setExtendedForm({ ...extendedForm, offer_text: e.target.value })}
                  placeholder="e.g. Buy 2 Get 1 Free"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Promo Code</Label>
                  <Input
                    value={extendedForm.promo_code}
                    onChange={e => setExtendedForm({ ...extendedForm, promo_code: e.target.value })}
                    placeholder="e.g. PIZZA20"
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Discount %</Label>
                  <Input
                    type="number"
                    value={extendedForm.promo_discount}
                    onChange={e => setExtendedForm({ ...extendedForm, promo_discount: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Payment Methods Control */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">💳 Payment Methods</h3>
            <p className="text-gray-400 text-sm mb-4">Control which payment methods are available for each order type</p>
            
            {/* Pickup Payment Methods */}
            <div className="p-4 rounded-lg bg-gray-800/50 mb-4">
              <h4 className="text-white font-medium text-sm mb-3">🚗 Pickup Orders</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💵</span>
                    <span className="text-gray-300 text-sm">Cash on Pickup</span>
                  </div>
                  <Switch
                    checked={extendedForm.cash_enabled_pickup}
                    onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, cash_enabled_pickup: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💳</span>
                    <span className="text-gray-300 text-sm">Card on Pickup</span>
                  </div>
                  <Switch
                    checked={extendedForm.card_enabled_pickup}
                    onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, card_enabled_pickup: checked })}
                  />
                </div>
              </div>
            </div>

            {/* Delivery Payment Methods */}
            {extendedForm.delivery_enabled && (
              <div className="p-4 rounded-lg bg-gray-800/50">
                <h4 className="text-white font-medium text-sm mb-3">🛵 Delivery Orders</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💵</span>
                      <span className="text-gray-300 text-sm">Cash on Delivery</span>
                    </div>
                    <Switch
                      checked={extendedForm.cash_enabled_delivery}
                      onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, cash_enabled_delivery: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💳</span>
                      <span className="text-gray-300 text-sm">Card on Delivery</span>
                    </div>
                    <Switch
                      checked={extendedForm.card_enabled_delivery}
                      onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, card_enabled_delivery: checked })}
                    />
                  </div>
                </div>
              </div>
            )}

            {!extendedForm.cash_enabled_pickup && !extendedForm.card_enabled_pickup && (
              <p className="text-red-400 text-xs mt-3">⚠️ Warning: No payment methods enabled for pickup. Customers won't be able to checkout.</p>
            )}
            {extendedForm.delivery_enabled && !extendedForm.cash_enabled_delivery && !extendedForm.card_enabled_delivery && (
              <p className="text-red-400 text-xs mt-3">⚠️ Warning: No payment methods enabled for delivery. Customers won't be able to checkout.</p>
            )}
          </Card>

          {/* Service Fee */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Service Fee</h3>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${extendedForm.service_fee_enabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {extendedForm.service_fee_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={extendedForm.service_fee_enabled}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, service_fee_enabled: checked })}
                />
              </div>
            </div>
            {extendedForm.service_fee_enabled && (
              <div className="space-y-4 pt-2 border-t border-gray-800 mt-2">
                {/* Fee Type Selection */}
                <div>
                  <Label className="text-gray-300 mb-2 block">Fee Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExtendedForm({ ...extendedForm, service_fee_type: 'fixed' })}
                      className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        extendedForm.service_fee_type === 'fixed'
                          ? 'border-red-600 bg-red-600/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      💰 Fixed Amount (AED)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtendedForm({ ...extendedForm, service_fee_type: 'percentage' })}
                      className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        extendedForm.service_fee_type === 'percentage'
                          ? 'border-red-600 bg-red-600/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      📊 Percentage (%)
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-gray-300">
                    {extendedForm.service_fee_type === 'percentage' ? 'Service Fee Percentage (%)' : 'Service Fee Amount (AED)'}
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max={extendedForm.service_fee_type === 'percentage' ? '100' : undefined}
                    value={extendedForm.service_fee_amount}
                    onChange={e => setExtendedForm({ ...extendedForm, service_fee_amount: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white mt-1 w-40"
                    placeholder={extendedForm.service_fee_type === 'percentage' ? 'e.g. 5' : 'e.g. 2'}
                  />
                  {extendedForm.service_fee_type === 'percentage' && (
                    <p className="text-gray-500 text-xs mt-1">Example: 5% of AED 100 order = AED 5 service fee</p>
                  )}
                </div>
                <div>
                  <Label className="text-gray-300 mb-2 block">Apply Service Fee To</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setExtendedForm({ ...extendedForm, service_fee_applies_to: 'pickup' })}
                      className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        extendedForm.service_fee_applies_to === 'pickup'
                          ? 'border-red-600 bg-red-600/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      🚗 Pickup Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtendedForm({ ...extendedForm, service_fee_applies_to: 'delivery' })}
                      className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        extendedForm.service_fee_applies_to === 'delivery'
                          ? 'border-red-600 bg-red-600/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      🛵 Delivery Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setExtendedForm({ ...extendedForm, service_fee_applies_to: 'both' })}
                      className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                        extendedForm.service_fee_applies_to === 'both'
                          ? 'border-red-600 bg-red-600/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      📦 Both
                    </button>
                  </div>
                </div>
                <p className="text-green-400/80 text-xs">
                  ✓ Service Fee: {extendedForm.service_fee_type === 'percentage' ? `${extendedForm.service_fee_amount}%` : `AED ${extendedForm.service_fee_amount}`} applies to {
                    extendedForm.service_fee_applies_to === 'both' ? 'all orders' :
                    extendedForm.service_fee_applies_to === 'pickup' ? 'pickup orders only' : 'delivery orders only'
                  }
                </p>
              </div>
            )}
          </Card>

          {/* Small Order Fee */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Small Order Fee</h3>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${extendedForm.small_order_fee_enabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {extendedForm.small_order_fee_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <Switch
                  checked={extendedForm.small_order_fee_enabled}
                  onCheckedChange={(checked) => setExtendedForm({ ...extendedForm, small_order_fee_enabled: checked })}
                />
              </div>
            </div>
            {extendedForm.small_order_fee_enabled && (
              <div className="space-y-3 pt-2 border-t border-gray-800 mt-2">
                <p className="text-gray-400 text-sm">This fee applies only when the order subtotal is below the minimum threshold.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-300">Fee Amount (AED)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      value={extendedForm.small_order_fee_amount}
                      onChange={e => setExtendedForm({ ...extendedForm, small_order_fee_amount: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-300">Minimum Order (AED)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={extendedForm.small_order_fee_threshold}
                      onChange={e => setExtendedForm({ ...extendedForm, small_order_fee_threshold: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white mt-1"
                      placeholder="e.g. 20"
                    />
                  </div>
                </div>
                <p className="text-yellow-400/80 text-xs">⚠️ Fee of AED {extendedForm.small_order_fee_amount} applies when subtotal &lt; AED {extendedForm.small_order_fee_threshold}. Fee disappears when customer adds more items.</p>
              </div>
            )}
          </Card>

          {/* Charges & Tax */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Tax Settings</h3>
            <div>
              <Label className="text-gray-300">Tax %</Label>
              <Input
                type="number"
                value={extendedForm.tax_percent}
                onChange={e => setExtendedForm({ ...extendedForm, tax_percent: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white mt-1 w-32"
              />
            </div>
          </Card>

          {/* Access Settings */}
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h3 className="text-white font-semibold mb-4">Access & Security</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300">Admin Username</Label>
                  <Input
                    value={extendedForm.admin_username}
                    onChange={e => setExtendedForm({ ...extendedForm, admin_username: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-gray-300">Admin Password</Label>
                  <Input
                    type="password"
                    value={extendedForm.admin_password}
                    onChange={e => setExtendedForm({ ...extendedForm, admin_password: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-gray-300">Kitchen PIN</Label>
                <Input
                  value={extendedForm.kitchen_pin}
                  onChange={e => setExtendedForm({ ...extendedForm, kitchen_pin: e.target.value })}
                  placeholder="4-digit PIN for kitchen access"
                  maxLength={4}
                  className="bg-gray-800 border-gray-700 text-white mt-1 w-32"
                />
              </div>
            </div>
          </Card>

          {/* Data Reset - Danger Zone */}
          <Card className="bg-gray-900 border-red-900/50 p-6">
            <h3 className="text-red-400 font-semibold mb-2">⚠️ Danger Zone - Reset Data</h3>
            <p className="text-gray-400 text-sm mb-4">
              Choose what data to reset. Each action requires confirmation and cannot be undone.
            </p>
            <div className="space-y-3">
              <ResetButton
                label="Reset Orders"
                description="Delete all orders and delivery assignments"
                resetType="orders"
                icon="📦"
              />
              <ResetButton
                label="Reset Sales / Revenue"
                description="Delete all sales data (clears orders)"
                resetType="sales"
                icon="💰"
              />
              <ResetButton
                label="Reset Menu"
                description="Delete all menu items, categories, and extras"
                resetType="menu"
                icon="🍕"
              />
              <ResetButton
                label="Reset Customers"
                description="Delete all customer session/registration data"
                resetType="customers"
                icon="👥"
              />
              <ResetButton
                label="Reset Rider History"
                description="Delete all rider delivery assignments"
                resetType="rider_history"
                icon="🛵"
              />
              <ResetButton
                label="Reset Feedback"
                description="Delete all customer feedback and reviews"
                resetType="feedback"
                icon="⭐"
              />
              <ResetButton
                label="Reset Activity Logs"
                description="Delete all admin activity logs"
                resetType="activity_logs"
                icon="📋"
              />
              <ResetButton
                label="Reset Notifications"
                description="Delete all notifications"
                resetType="notifications"
                icon="🔔"
              />
              <div className="pt-4 border-t border-red-900/30">
                <ResetButton
                  label="⚠️ Reset ALL Data"
                  description="Delete everything except admin accounts, settings, riders, deals & offers"
                  resetType="all"
                  icon="🗑️"
                  isDanger
                />
              </div>
            </div>
          </Card>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryZonesManager() {
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newZone, setNewZone] = useState({ zone_name: '', min_distance_km: '', max_distance_km: '', charge: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editZone, setEditZone] = useState({ zone_name: '', min_distance_km: '', max_distance_km: '', charge: '' });

  useEffect(() => { loadZones(); }, []);

  async function loadZones() {
    try {
      const res = await client.apiCall.invoke({
        url: '/api/v1/entities/delivery_zones?sort=min_distance_km&limit=50',
        method: 'GET',
      });
      setZones(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load zones:', e);
    } finally {
      setLoading(false);
    }
  }

  async function addZone() {
    if (!newZone.zone_name || !newZone.min_distance_km || !newZone.max_distance_km || !newZone.charge) {
      toast.error('Please fill all zone fields');
      return;
    }
    setAdding(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/entities/delivery_zones',
        method: 'POST',
        data: {
          zone_name: newZone.zone_name,
          min_distance_km: parseFloat(newZone.min_distance_km),
          max_distance_km: parseFloat(newZone.max_distance_km),
          charge: parseFloat(newZone.charge),
          is_active: true,
        },
      });
      toast.success('Zone added!');
      setNewZone({ zone_name: '', min_distance_km: '', max_distance_km: '', charge: '' });
      await loadZones();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to add zone');
    } finally {
      setAdding(false);
    }
  }

  async function updateZone(id: number) {
    if (!editZone.zone_name || !editZone.min_distance_km || !editZone.max_distance_km || !editZone.charge) {
      toast.error('Please fill all zone fields');
      return;
    }
    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${id}`,
        method: 'PUT',
        data: {
          zone_name: editZone.zone_name,
          min_distance_km: parseFloat(editZone.min_distance_km),
          max_distance_km: parseFloat(editZone.max_distance_km),
          charge: parseFloat(editZone.charge),
        },
      });
      toast.success('Zone updated!');
      setEditingId(null);
      await loadZones();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to update zone');
    }
  }

  async function deleteZone(id: number, name: string) {
    if (!confirm(`Delete zone "${name}"?`)) return;
    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${id}`,
        method: 'DELETE',
      });
      toast.success('Zone deleted!');
      await loadZones();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to delete zone');
    }
  }

  async function toggleZoneActive(id: number, currentActive: boolean) {
    try {
      await client.apiCall.invoke({
        url: `/api/v1/entities/delivery_zones/${id}`,
        method: 'PUT',
        data: { is_active: !currentActive },
      });
      toast.success(currentActive ? 'Zone deactivated' : 'Zone activated');
      await loadZones();
    } catch (e: any) {
      toast.error('Failed to toggle zone');
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading zones...</p>;

  return (
    <div className="space-y-3">
      {/* Existing zones */}
      {zones.length > 0 ? (
        <div className="space-y-2">
          {zones.map((zone) => (
            <div key={zone.id} className="p-3 bg-gray-800 rounded-lg">
              {editingId === zone.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      value={editZone.zone_name}
                      onChange={e => setEditZone({ ...editZone, zone_name: e.target.value })}
                      placeholder="Zone Name"
                      className="bg-gray-700 border-gray-600 text-white text-xs"
                    />
                    <Input
                      type="number"
                      value={editZone.min_distance_km}
                      onChange={e => setEditZone({ ...editZone, min_distance_km: e.target.value })}
                      placeholder="Min km"
                      className="bg-gray-700 border-gray-600 text-white text-xs"
                    />
                    <Input
                      type="number"
                      value={editZone.max_distance_km}
                      onChange={e => setEditZone({ ...editZone, max_distance_km: e.target.value })}
                      placeholder="Max km"
                      className="bg-gray-700 border-gray-600 text-white text-xs"
                    />
                    <Input
                      type="number"
                      value={editZone.charge}
                      onChange={e => setEditZone({ ...editZone, charge: e.target.value })}
                      placeholder="AED"
                      className="bg-gray-700 border-gray-600 text-white text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => updateZone(zone.id)} size="sm" className="bg-green-600 hover:bg-green-700 text-white cursor-pointer">
                      <Check className="w-3 h-3 mr-1" /> Save
                    </Button>
                    <Button onClick={() => setEditingId(null)} size="sm" variant="ghost" className="text-gray-400 cursor-pointer">
                      <X className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${zone.is_active ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                      <span className="text-white text-sm font-medium">{zone.zone_name}</span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5 ml-4">
                      {zone.min_distance_km} - {zone.max_distance_km} km → AED {zone.charge}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={zone.is_active !== false}
                      onCheckedChange={() => toggleZoneActive(zone.id, zone.is_active !== false)}
                    />
                    <Button
                      onClick={() => { setEditingId(zone.id); setEditZone({ zone_name: zone.zone_name, min_distance_km: String(zone.min_distance_km), max_distance_km: String(zone.max_distance_km), charge: String(zone.charge) }); }}
                      size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 cursor-pointer p-1 h-auto"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => deleteZone(zone.id, zone.zone_name)}
                      size="sm" variant="ghost" className="text-red-400 hover:text-red-300 cursor-pointer p-1 h-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No delivery zones configured. Add zones below.</p>
      )}

      {/* Add new zone */}
      <div className="pt-3 border-t border-gray-700 space-y-2">
        <p className="text-gray-400 text-xs font-medium">Add New Zone</p>
        <div className="grid grid-cols-4 gap-2">
          <Input
            value={newZone.zone_name}
            onChange={e => setNewZone({ ...newZone, zone_name: e.target.value })}
            placeholder="Zone Name"
            className="bg-gray-800 border-gray-700 text-white text-xs"
          />
          <Input
            type="number"
            value={newZone.min_distance_km}
            onChange={e => setNewZone({ ...newZone, min_distance_km: e.target.value })}
            placeholder="Min km"
            className="bg-gray-800 border-gray-700 text-white text-xs"
            min="0"
          />
          <Input
            type="number"
            value={newZone.max_distance_km}
            onChange={e => setNewZone({ ...newZone, max_distance_km: e.target.value })}
            placeholder="Max km"
            className="bg-gray-800 border-gray-700 text-white text-xs"
            min="0"
          />
          <Input
            type="number"
            value={newZone.charge}
            onChange={e => setNewZone({ ...newZone, charge: e.target.value })}
            placeholder="AED"
            className="bg-gray-800 border-gray-700 text-white text-xs"
            min="0"
          />
        </div>
        <Button onClick={addZone} disabled={adding} size="sm" className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
          <Plus className="w-3 h-3 mr-1" /> {adding ? 'Adding...' : 'Add Zone'}
        </Button>
      </div>

      {/* Info */}
      <div className="pt-2 text-xs space-y-1">
        <p className="text-green-400/80">💰 Zone charge = Rider delivery earnings per order</p>
        <p className="text-gray-500">Zones are checked in order. Customer distance determines which zone applies.</p>
        <p className="text-gray-500">Beyond all zones = delivery not available.</p>
      </div>
    </div>
  );
}

function LocationMap({ lat, lng, onLocationChange }: { lat: number; lng: number; onLocationChange: (lat: number, lng: number) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Fix default marker icon
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    const map = L.map(mapRef.current).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.bindPopup('<b>Vita Napoli</b>').openPopup();

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onLocationChange(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onLocationChange(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker position when lat/lng changes externally (e.g., from geolocation button)
  useEffect(() => {
    if (markerRef.current && mapInstanceRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.setView([lat, lng], 15);
      }
    }
  }, [lat, lng]);

  return (
    <div
      ref={mapRef}
      className="w-full h-[300px] rounded-lg border border-gray-700 overflow-hidden"
      style={{ zIndex: 1 }}
    />
  );
}

function ResetButton({ label, description, resetType, icon, isDanger }: {
  label: string;
  description: string;
  resetType: string;
  icon: string;
  isDanger?: boolean;
}) {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    const confirmMsg = isDanger
      ? `⚠️ FINAL WARNING!\n\nThis will DELETE ALL:\n- Orders & Sales\n- Customer sessions\n- Delivery history\n- Activity logs\n- Feedback\n- Notifications\n\nMenu, settings, riders, deals & offers will be kept.\n\nThis CANNOT be undone!`
      : `Are you sure you want to ${label.toLowerCase()}?\n\n${description}\n\nThis cannot be undone!`;

    if (!confirm(confirmMsg)) return;
    if (isDanger && !confirm('FINAL CONFIRMATION: Are you absolutely sure?')) return;

    setResetting(true);
    try {
      await client.apiCall.invoke({
        url: '/api/v1/admin/reset-selective',
        method: 'POST',
        data: { reset_type: resetType },
      });
      // Clear localStorage cached data that would recreate entries on next visit
      if (resetType === 'orders' || resetType === 'sales' || resetType === 'all') {
        localStorage.removeItem('vita_customer_name');
        localStorage.removeItem('vita_customer_phone');
        localStorage.removeItem('vita_cart');
        localStorage.removeItem('vita_orders');
        localStorage.removeItem('vita_last_order');
        localStorage.removeItem('vita_order_submitted');
      }
      if (resetType === 'customers' || resetType === 'all') {
        localStorage.removeItem('vita_customer_name');
        localStorage.removeItem('vita_customer_phone');
        localStorage.removeItem('vita_session_id');
        localStorage.removeItem('vita_cart');
        localStorage.removeItem('vita_orders');
        localStorage.removeItem('vita_last_order');
        localStorage.removeItem('vita_order_submitted');
        localStorage.removeItem('vita_language');
      }
      if (resetType === 'menu' || resetType === 'all') {
        localStorage.removeItem('vita_cart');
      }
      if (resetType === 'feedback' || resetType === 'all') {
        localStorage.removeItem('vita_reviewed_orders');
      }
      if (resetType === 'rider_history' || resetType === 'all') {
        localStorage.removeItem('rider_auth');
        localStorage.removeItem('rider_notifications');
      }
      if (resetType === 'all') {
        // Clear all vita-prefixed keys
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('vita_') || key.startsWith('rider_'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
      toast.success(`${label} completed successfully!`);
    } catch (e: any) {
      toast.error(e?.data?.detail || `Failed to ${label.toLowerCase()}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${isDanger ? 'bg-red-950/50 border border-red-800/50' : 'bg-gray-800/50 border border-gray-700/50'}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <div>
          <p className={`text-sm font-medium ${isDanger ? 'text-red-300' : 'text-gray-200'}`}>{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <Button
        onClick={handleReset}
        disabled={resetting}
        size="sm"
        className={`cursor-pointer ${isDanger ? 'bg-red-800 hover:bg-red-700 text-red-100 border border-red-600' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600'}`}
      >
        {resetting ? '...' : 'Reset'}
      </Button>
    </div>
  );
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}