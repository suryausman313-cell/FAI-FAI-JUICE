import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AdminAccount,
  AdminPermissions,
  createAdminAccount,
  deleteAdminAccount,
  getAdminMe,
  listAdminAccounts,
  readAdminSession,
  updateAdminAccount,
} from '@/lib/admin-control';

const DEFAULT_PERMISSIONS: AdminPermissions = {
  orders: true,
  menu: false,
  sales: false,
  customers: false,
  settings: false,
  deals: false,
  notifications: false,
  feedback: false,
  accounts: false,
  riders: false,
  kitchen: false,
  logs: false,
};

const PERMISSION_LABELS: Record<keyof AdminPermissions, string> = {
  orders: 'Orders',
  menu: 'Menu',
  sales: 'Sales',
  customers: 'Customers',
  settings: 'Settings',
  deals: 'Deals',
  notifications: 'Notifications',
  feedback: 'Feedback',
  accounts: 'Admin Accounts',
  riders: 'Riders',
  kitchen: 'Kitchen',
  logs: 'Activity Logs',
};

interface AccountForm {
  username: string;
  password: string;
  role: 'admin' | 'manager';
  permissions: AdminPermissions;
}

const EMPTY_FORM: AccountForm = {
  username: '',
  password: '',
  role: 'admin',
  permissions: { ...DEFAULT_PERMISSIONS },
};

export default function AdminAccounts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [superUsername, setSuperUsername] = useState('Super Admin');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [form, setForm] = useState<AccountForm>({ ...EMPTY_FORM });

  const session = useMemo(() => readAdminSession(), []);

  useEffect(() => {
    if (!session) {
      navigate('/admin');
      return;
    }

    if (
      session.role !== 'super_admin' &&
      !session.permissions?.accounts
    ) {
      toast.error('Admin Accounts permission nahi hai');
      navigate('/admin/dashboard');
      return;
    }

    void loadAccounts();
  }, [navigate, session]);

  async function loadAccounts() {
    setLoading(true);
    try {
      const [me, items] = await Promise.all([
        getAdminMe(),
        listAdminAccounts(),
      ]);
      setSuperUsername(me.username);
      setAccounts(items);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Admin accounts load nahi huay',
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({
      username: '',
      password: '',
      role: 'admin',
      permissions: { ...DEFAULT_PERMISSIONS },
    });
    setDialogOpen(true);
  }

  function openEdit(account: AdminAccount) {
    setEditing(account);
    setForm({
      username: account.username,
      password: '',
      role: account.role,
      permissions: { ...account.permissions },
    });
    setDialogOpen(true);
  }

  function togglePermission(permission: keyof AdminPermissions) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permission]: !current.permissions[permission],
      },
    }));
  }

  async function saveAccount() {
    if (form.username.trim().length < 3) {
      toast.error('Username minimum 3 characters hona chahiye');
      return;
    }
    if (!editing && form.password.length < 8) {
      toast.error('Password minimum 8 characters hona chahiye');
      return;
    }
    if (editing && form.password && form.password.length < 8) {
      toast.error('New password minimum 8 characters hona chahiye');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateAdminAccount(editing.id, {
          username: form.username.trim(),
          role: form.role,
          permissions: form.permissions,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('Admin account updated');
      } else {
        await createAdminAccount({
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          permissions: form.permissions,
        });
        toast.success('New admin account created');
      }

      setDialogOpen(false);
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Account save nahi hua',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(account: AdminAccount) {
    try {
      await updateAdminAccount(account.id, {
        is_active: !account.is_active,
      });
      toast.success(
        account.is_active
          ? `${account.username} disabled`
          : `${account.username} enabled`,
      );
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Account status change nahi hua',
      );
    }
  }

  async function removeAccount(account: AdminAccount) {
    if (
      !window.confirm(
        `Admin account "${account.username}" permanently delete karna hai?`,
      )
    ) {
      return;
    }

    try {
      await deleteAdminAccount(account.id);
      toast.success('Admin account deleted');
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Account delete nahi hua',
      );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading admin accounts...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/dashboard')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">
              Admin Accounts
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Staff admins, passwords aur permissions ab database me save hote hain
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadAccounts()}
            className="text-gray-400"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button
            onClick={openCreate}
            className="bg-green-600 hover:bg-green-500"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            New Admin
          </Button>
        </div>

        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-white font-bold">{superUsername}</p>
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-400">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                Full access · cannot be deleted from this page
              </p>
            </div>
            <span className="text-green-400 text-xs">● Active</span>
          </div>
        </Card>

        {accounts.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 p-10 text-center">
            <Shield className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400">Abhi koi staff admin nahi hai</p>
            <Button
              onClick={openCreate}
              className="mt-4 bg-green-600 hover:bg-green-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Admin
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <Card
                key={account.id}
                className={`bg-gray-900 border-gray-800 p-4 ${
                  account.is_active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-white font-bold">
                        {account.username}
                      </p>
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-blue-500/10 text-blue-400 uppercase">
                        {account.role}
                      </span>
                    </div>
                    <p className="text-gray-600 text-[11px] mt-1">
                      Password hidden · Edit se password change hoga
                    </p>
                  </div>

                  <Switch
                    checked={account.is_active}
                    onCheckedChange={() => void toggleActive(account)}
                  />

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(account)}
                    className="text-gray-400 hover:text-white p-2"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeAccount(account)}
                    className="text-red-400 hover:text-red-300 p-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERMISSION_LABELS) as Array<
                      keyof AdminPermissions
                    >)
                      .filter((key) => account.permissions[key])
                      .map((key) => (
                        <span
                          key={key}
                          className="text-[10px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400"
                        >
                          {PERMISSION_LABELS[key]}
                        </span>
                      ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Admin Account' : 'Create Admin Account'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-gray-300">Username</Label>
              <Input
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                className="mt-1 bg-gray-950 border-gray-700 text-white"
              />
            </div>

            <div>
              <Label className="text-gray-300">
                {editing
                  ? 'New Password (blank rakho to same rahega)'
                  : 'Password'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                className="mt-1 bg-gray-950 border-gray-700 text-white"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <Label className="text-gray-300">Role</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['admin', 'manager'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({ ...current, role }))
                    }
                    className={`rounded-xl border px-3 py-3 text-sm capitalize ${
                      form.role === role
                        ? 'border-green-500 bg-green-500/10 text-white'
                        : 'border-gray-700 bg-gray-950 text-gray-500'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-300">Permissions</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {(Object.keys(PERMISSION_LABELS) as Array<
                  keyof AdminPermissions
                >).map((permission) => (
                  <button
                    key={permission}
                    type="button"
                    onClick={() => togglePermission(permission)}
                    className={`px-2 py-2 rounded-lg border text-[11px] ${
                      form.permissions[permission]
                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                        : 'bg-gray-950 border-gray-700 text-gray-600'
                    }`}
                  >
                    {PERMISSION_LABELS[permission]}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => void saveAccount()}
              disabled={saving}
              className="w-full h-12 bg-green-600 hover:bg-green-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              {saving
                ? 'Saving...'
                : editing
                  ? 'Save Admin Changes'
                  : 'Create Admin'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
