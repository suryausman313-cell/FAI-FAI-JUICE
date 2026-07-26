import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { client } from '@/lib/api';

interface AppNotification {
  id: number;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingNotif, setEditingNotif] = useState<AppNotification | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    await loadData();
    setLoading(false);
  }

  async function loadData() {
    try {
      const res = await client.entities.app_notifications.query({ query: {}, sort: '-id', limit: 100 });
      const items = res?.data?.items || res?.items || [];
      setNotifications(items);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }

  function openCreateForm() {
    setEditingNotif(null);
    setFormTitle('');
    setFormMessage('');
    setFormActive(true);
    setShowForm(true);
  }

  function openEditForm(notif: AppNotification) {
    setEditingNotif(notif);
    setFormTitle(notif.title);
    setFormMessage(notif.message);
    setFormActive(notif.is_active);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formTitle || !formMessage) {
      toast.error('Please fill in both title and message');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formTitle,
        message: formMessage,
        is_active: formActive,
      };

      if (editingNotif) {
        await client.entities.app_notifications.update({ id: String(editingNotif.id), data: payload });
        toast.success('Notification updated!');
      } else {
        await client.entities.app_notifications.create({ data: payload });
        toast.success('Notification created!');
      }

      setShowForm(false);
      await loadData();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to save notification');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this notification permanently?')) return;
    try {
      await client.entities.app_notifications.delete({ id: String(id) });
      toast.success('Notification deleted');
      await loadData();
    } catch (e: any) {
      toast.error(e?.data?.detail || 'Failed to delete');
    }
  }

  async function handleToggleActive(notif: AppNotification) {
    try {
      await client.entities.app_notifications.update({ id: String(notif.id), data: { is_active: !notif.is_active } });
      toast.success(notif.is_active ? 'Notification disabled' : 'Notification enabled');
      await loadData();
    } catch (e: any) {
      toast.error('Failed to toggle notification');
    }
  }

  if (loading) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen px-4 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/dashboard')} className="text-gray-400 hover:text-white cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-400" />
              Notifications
            </h1>
            <p className="text-gray-400 text-sm">Send announcements to customers</p>
          </div>
        </div>
        <Button onClick={openCreateForm} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800 p-8 text-center">
          <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No notifications yet. Create your first announcement!</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map(notif => (
            <Card key={notif.id} className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold">{notif.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${notif.is_active ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {notif.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">{notif.message}</p>
                  <p className="text-gray-600 text-xs mt-2">
                    Created: {new Date(notif.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Switch
                    checked={notif.is_active}
                    onCheckedChange={() => handleToggleActive(notif)}
                  />
                  <button onClick={() => openEditForm(notif)} className="text-gray-400 hover:text-white p-1 cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(notif.id)} className="text-gray-400 hover:text-red-400 p-1 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingNotif ? 'Edit Notification' : 'New Notification'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-gray-300">Title *</Label>
              <Input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="e.g. Weekend Special!"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>

            <div>
              <Label className="text-gray-300">Message *</Label>
              <Textarea
                value={formMessage}
                onChange={e => setFormMessage(e.target.value)}
                placeholder="e.g. Get 20% off all pizzas this weekend!"
                className="bg-gray-800 border-gray-700 text-white mt-1"
                rows={3}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label className="text-gray-300">Active (visible to customers)</Label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                {saving ? 'Saving...' : editingNotif ? 'Update' : 'Create'}
              </Button>
              <Button
                onClick={() => setShowForm(false)}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800 cursor-pointer"
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