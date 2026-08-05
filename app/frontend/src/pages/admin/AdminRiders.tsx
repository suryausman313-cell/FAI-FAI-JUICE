import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, UserCheck, UserX, RefreshCw, MapPin, Clock, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getAPIBaseURL } from '@/lib/config';


type RiderAdminApiOptions = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
};

function riderAdminApi(options: RiderAdminApiOptions) {
  return axios.request({
    url: `${getAPIBaseURL().replace(/\/$/, '')}${options.url}`,
    method: options.method,
    data: options.data,
    headers: {
      Authorization: `Bearer ${localStorage.getItem('fai_fai_admin_token') || ''}`,
    },
    timeout: 25000,
  });
}

interface RiderReport {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  is_online: boolean;
  total_orders: number;
  today_orders: number;
  today_order_value: number;
  pending_orders: number;
  total_earnings: number;
  delivery_charges_earned: number;
  delivery_charge_per_order: number;
  cash_collected: number;
  approved_cash: number;
  awaiting_approval: number;
  cash_pending: number;
  card_orders: number;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  shift_start: string | null;
  shift_end: string | null;
}

interface DeliveryAssignment {
  id: number;
  order_id: number;
  rider_id: number;
  status: string;
  customer_name: string;
  customer_address: string;
  created_at: string;
}

export default function AdminRiders() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<RiderReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newDeliveryCharge, setNewDeliveryCharge] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('');
  const [newShiftEnd, setNewShiftEnd] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editDeliveryCharge, setEditDeliveryCharge] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('');
  const [editShiftEnd, setEditShiftEnd] = useState('');
  const [timeLimit, setTimeLimit] = useState('30'); // minutes

  useEffect(() => {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    loadReports();
    // Load time limit setting
    const saved = localStorage.getItem('rider_time_limit');
    if (saved) setTimeLimit(saved);
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(loadReports, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadReports() {
    try {
      const res = await riderAdminApi({ url: '/api/v1/rider/admin/reports', method: 'GET' });
      setReports(res?.data?.items || []);
    } catch (e) {
      console.error('Failed to load rider reports:', e);
    } finally {
      setLoading(false);
    }
  }

  async function addRider() {
    if (!newName || !newPhone || !newPin) { toast.error('Fill all fields'); return; }
    try {
      await riderAdminApi({
        url: '/api/v1/rider/admin/create',
        method: 'POST',
        data: {
          name: newName,
          phone: newPhone,
          pin: newPin,
          delivery_charge: parseFloat(newDeliveryCharge) || 0,
          shift_start: newShiftStart || null,
          shift_end: newShiftEnd || null,
        }
      });
      toast.success('Rider added!');
      setNewName(''); setNewPhone(''); setNewPin('');
      setNewDeliveryCharge(''); setNewShiftStart(''); setNewShiftEnd('');
      setShowAddForm(false);
      await loadReports();
    } catch (e: any) { toast.error(e?.response?.data?.detail || e?.data?.detail || 'Failed to add rider'); }
  }

  async function toggleActive(riderId: number, currentActive: boolean) {
    try {
      await riderAdminApi({ url: `/api/v1/rider/admin/${riderId}`, method: 'PUT', data: { is_active: !currentActive } });
      toast.success(currentActive ? 'Rider blocked' : 'Rider unblocked');
      await loadReports();
    } catch (e: any) { toast.error(e?.response?.data?.detail || e?.data?.detail || 'Failed'); }
  }

  async function deleteRider(riderId: number, name: string) {
    if (!confirm(`Delete rider "${name}" permanently?`)) return;
    try {
      await riderAdminApi({ url: `/api/v1/rider/admin/${riderId}`, method: 'DELETE' });
      toast.success('Rider deleted');
      await loadReports();
    } catch (e: any) { toast.error(e?.response?.data?.detail || e?.data?.detail || 'Failed'); }
  }

  function startEdit(rider: RiderReport) {
    setEditingId(rider.id);
    setEditName(rider.name);
    setEditPhone(rider.phone);
    setEditPin('');
    setEditDeliveryCharge(String(rider.delivery_charge_per_order || 0));
    setEditShiftStart(rider.shift_start || '');
    setEditShiftEnd(rider.shift_end || '');
  }

  async function saveEdit(riderId: number) {
    if (!editName || !editPhone) { toast.error('Name and phone required'); return; }
    try {
      const data: any = {
        name: editName,
        phone: editPhone,
        delivery_charge: parseFloat(editDeliveryCharge) || 0,
        shift_start: editShiftStart || null,
        shift_end: editShiftEnd || null,
      };
      if (editPin) data.pin = editPin;
      await riderAdminApi({ url: `/api/v1/rider/admin/${riderId}`, method: 'PUT', data });
      toast.success('Rider updated');
      setEditingId(null);
      await loadReports();
    } catch (e: any) { toast.error(e?.response?.data?.detail || e?.data?.detail || 'Failed'); }
  }

  function saveTimeLimit() {
    localStorage.setItem('rider_time_limit', timeLimit);
    toast.success(`Time limit set to ${timeLimit} minutes`);
  }

  const totalOrders = reports.reduce((s, r) => s + r.total_orders, 0);
  const totalEarnings = reports.reduce((s, r) => s + r.total_earnings, 0);
  const totalCash = reports.reduce((s, r) => s + r.cash_collected, 0);
  const onlineCount = reports.filter(r => r.is_online).length;

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-white text-2xl font-bold">Rider Management <span className="text-xs text-emerald-400">FINAL V5</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={loadReports} variant="ghost" size="sm" className="text-gray-400 cursor-pointer">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Add Rider
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <p className="text-2xl font-bold text-white">{reports.length}</p>
            <p className="text-gray-500 text-xs">Total Riders</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{onlineCount}</p>
            <p className="text-gray-500 text-xs">Online Now</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{totalOrders}</p>
            <p className="text-gray-500 text-xs">Total Deliveries</p>
          </Card>
          <Card className="bg-gray-900 border-gray-800 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">AED {totalEarnings.toFixed(0)}</p>
            <p className="text-gray-500 text-xs">Total Earnings</p>
          </Card>
        </div>

        {/* Add Rider Form */}
        {showAddForm && (
          <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">Add New Rider</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <Label className="text-gray-400 text-xs">Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Rider name" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Phone</Label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+971..." className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">PIN</Label>
                <Input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="4-6 digits" maxLength={6} className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <Label className="text-gray-400 text-xs">Delivery Charge (AED)</Label>
                <Input value={newDeliveryCharge} onChange={e => setNewDeliveryCharge(e.target.value)} placeholder="e.g. 5" type="number" min="0" step="0.5" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Shift Start</Label>
                <Input value={newShiftStart} onChange={e => setNewShiftStart(e.target.value)} placeholder="15:00" type="time" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Shift End</Label>
                <Input value={newShiftEnd} onChange={e => setNewShiftEnd(e.target.value)} placeholder="02:00" type="time" className="bg-gray-800 border-gray-700 text-white mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={addRider} className="bg-green-600 hover:bg-green-700 text-white cursor-pointer" size="sm">
                <Check className="w-3 h-3 mr-1" /> Add
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="ghost" className="text-gray-400 cursor-pointer" size="sm">
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Time Limit Control */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" /> Rider Working Time Limit
              </h3>
              <p className="text-gray-500 text-xs mt-1">If rider doesn't accept within limit, order auto-reassigns or admin gets notified</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={['15','30','45','60','90','120'].includes(timeLimit) ? timeLimit : 'custom'}
                onChange={e => {
                  if (e.target.value === 'custom') {
                    setTimeLimit('');
                  } else {
                    setTimeLimit(e.target.value);
                  }
                }}
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="custom">Custom...</option>
              </select>
              {!['15','30','45','60','90','120'].includes(timeLimit) && (
                <div className="flex items-center gap-1">
                  <Input
                    value={timeLimit}
                    onChange={e => setTimeLimit(e.target.value)}
                    placeholder="e.g. 25"
                    type="number"
                    min="1"
                    max="480"
                    className="bg-gray-800 border-gray-700 text-white w-20 text-sm"
                  />
                  <span className="text-gray-400 text-xs">min</span>
                </div>
              )}
              <Button onClick={saveTimeLimit} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white cursor-pointer">
                Save
              </Button>
            </div>
          </div>
        </Card>

        {/* Rider List with Reports */}
        <div className="space-y-3">
          {reports.map(rider => (
            <Card key={rider.id} className="bg-gray-900 border-gray-800 p-4">
              {editingId === rider.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    <Input value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="New PIN (optional)" maxLength={6} className="bg-gray-800 border-gray-700 text-white text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-gray-500 text-[10px]">Delivery Charge (AED)</Label>
                      <Input value={editDeliveryCharge} onChange={e => setEditDeliveryCharge(e.target.value)} placeholder="5" type="number" min="0" step="0.5" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-500 text-[10px]">Shift Start</Label>
                      <Input value={editShiftStart} onChange={e => setEditShiftStart(e.target.value)} type="time" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-500 text-[10px]">Shift End</Label>
                      <Input value={editShiftEnd} onChange={e => setEditShiftEnd(e.target.value)} type="time" className="bg-gray-800 border-gray-700 text-white text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => saveEdit(rider.id)} size="sm" className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"><Check className="w-3 h-3 mr-1" /> Save</Button>
                    <Button onClick={() => setEditingId(null)} size="sm" variant="ghost" className="text-gray-400 cursor-pointer"><X className="w-3 h-3 mr-1" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Rider Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${rider.is_online ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{rider.name}</span>
                          {!rider.is_active && <span className="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded">Blocked</span>}
                        </div>
                        <span className="text-gray-500 text-xs">{rider.phone}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={rider.is_active} onCheckedChange={() => toggleActive(rider.id, rider.is_active)} />
                      <Button onClick={() => startEdit(rider)} size="sm" variant="ghost" className="text-blue-400 cursor-pointer p-1 h-auto">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button onClick={() => deleteRider(rider.id, rider.name)} size="sm" variant="ghost" className="text-red-400 cursor-pointer p-1 h-auto">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-white">{rider.today_orders}</p>
                      <p className="text-gray-500 text-[10px]">Today Orders</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-400">AED {(rider.today_order_value || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-[10px]">Today Sale</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-400">{rider.pending_orders}</p>
                      <p className="text-gray-500 text-[10px]">Active / Pending</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-yellow-400">AED {(rider.cash_pending || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-[10px]">Cash Pending</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-emerald-400">AED {(rider.approved_cash || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-[10px]">Cash Approved</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-amber-300">AED {(rider.awaiting_approval || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-[10px]">Awaiting Approval</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-purple-400">AED {(rider.delivery_charges_earned || 0).toFixed(2)}</p>
                      <p className="text-gray-500 text-[10px]">Total Del. Earnings</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-blue-300">{rider.total_orders}</p>
                      <p className="text-gray-500 text-[10px]">All Deliveries</p>
                    </div>
                  </div>

                  {/* Status Row */}
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span className={`flex items-center gap-1 ${rider.is_online ? 'text-green-400' : 'text-gray-500'}`}>
                      {rider.is_online ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {rider.is_online ? 'Online' : 'Offline'}
                    </span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-500">Today: {rider.today_orders} orders</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-purple-400">AED {rider.delivery_charge_per_order || 0}/delivery</span>
                    {rider.shift_start && rider.shift_end && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-blue-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rider.shift_start} - {rider.shift_end}
                        </span>
                      </>
                    )}
                    {rider.location_updated_at && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          Last seen {getTimeAgo(rider.location_updated_at)}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}

          {reports.length === 0 && (
            <div className="text-center py-12">
              <Bike className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500">No riders yet</p>
              <p className="text-gray-600 text-sm mt-1">Add your first rider to get started</p>
            </div>
          )}
        </div>

        {/* Cash Summary */}
        {reports.length > 0 && (
          <Card className="bg-gray-900 border-gray-800 p-4 mt-6">
            <h3 className="text-white font-semibold mb-3">💰 Cash Collection Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-yellow-600/10 border border-yellow-600/30 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-yellow-400">AED {totalCash.toFixed(2)}</p>
                <p className="text-yellow-400/70 text-xs mt-1">Total Cash Collected</p>
              </div>
              <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-400">{reports.reduce((s, r) => s + r.card_orders, 0)}</p>
                <p className="text-blue-400/70 text-xs mt-1">Total Card Orders</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
