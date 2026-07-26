import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Shield, ShieldCheck, Eye, EyeOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface AdminAccount {
  id: string;
  username: string;
  password: string;
  role: 'super_admin' | 'admin' | 'manager';
  permissions: {
    orders: boolean;
    menu: boolean;
    sales: boolean;
    customers: boolean;
    settings: boolean;
    deals: boolean;
    notifications: boolean;
    feedback: boolean;
    accounts: boolean;
    riders: boolean;
    kitchen: boolean;
    logs: boolean;
  };
  created_at: string;
  is_active: boolean;
}

const DEFAULT_PERMISSIONS = {
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

export default function AdminAccounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newAccount, setNewAccount] = useState({
    username: '',
    password: '',
    role: 'admin' as 'admin' | 'manager',
    permissions: { ...DEFAULT_PERMISSIONS },
  });

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  function checkAuthAndLoad() {
    const auth = localStorage.getItem('admin_auth');
    if (!auth) { navigate('/admin'); return; }
    try {
      const parsed = JSON.parse(auth);
      if (!parsed.loggedIn) { navigate('/admin'); return; }
    } catch { navigate('/admin'); return; }
    loadAccounts();
  }

  function loadAccounts() {
    const stored = localStorage.getItem('admin_accounts');
    if (stored) {
      try {
        setAccounts(JSON.parse(stored));
      } catch { /* */ }
    }
  }

  function saveAccounts(updated: AdminAccount[]) {
    setAccounts(updated);
    localStorage.setItem('admin_accounts', JSON.stringify(updated));
  }

  function createAccount() {
    if (!newAccount.username.trim()) {
      toast.error('Username is required');
      return;
    }
    if (newAccount.username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (!newAccount.password.trim()) {
      toast.error('Password is required');
      return;
    }
    if (newAccount.password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    // Check if username already exists
    const ext = localStorage.getItem('extended_settings');
    let superAdminUsername = 'vitanapoli';
    if (ext) {
      try {
        const parsed = JSON.parse(ext);
        superAdminUsername = parsed.admin_username || 'vitanapoli';
      } catch { /* */ }
    }

    if (newAccount.username.toLowerCase() === superAdminUsername.toLowerCase()) {
      toast.error('Username already taken (Super Admin)');
      return;
    }
    if (accounts.some(a => a.username.toLowerCase() === newAccount.username.toLowerCase())) {
      toast.error('Username already exists');
      return;
    }

    const account: AdminAccount = {
      id: Date.now().toString(),
      username: newAccount.username.trim(),
      password: newAccount.password,
      role: newAccount.role,
      permissions: { ...newAccount.permissions },
      created_at: new Date().toISOString(),
      is_active: true,
    };

    const updated = [...accounts, account];
    saveAccounts(updated);
    toast.success(`Admin account "${account.username}" created!`);
    setShowCreateDialog(false);
    setNewAccount({
      username: '',
      password: '',
      role: 'admin',
      permissions: { ...DEFAULT_PERMISSIONS },
    });
  }

  function toggleAccountActive(id: string) {
    const updated = accounts.map(a =>
      a.id === id ? { ...a, is_active: !a.is_active } : a
    );
    saveAccounts(updated);
    const account = updated.find(a => a.id === id);
    toast.success(`${account?.username} ${account?.is_active ? 'activated' : 'deactivated'}`);
  }

  function deleteAccount(id: string) {
    const account = accounts.find(a => a.id === id);
    if (!confirm(`Delete admin account "${account?.username}"? This cannot be undone.`)) return;
    const updated = accounts.filter(a => a.id !== id);
    saveAccounts(updated);
    toast.success(`Account "${account?.username}" deleted`);
  }

  function togglePermission(id: string, perm: keyof AdminAccount['permissions']) {
    const updated = accounts.map(a =>
      a.id === id ? { ...a, permissions: { ...a.permissions, [perm]: !a.permissions[perm] } } : a
    );
    saveAccounts(updated);
  }

  function togglePasswordVisibility(id: string) {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const permissionLabels: Record<keyof AdminAccount['permissions'], string> = {
    orders: '📦 Orders',
    menu: '🍕 Menu',
    sales: '📊 Sales',
    customers: '👥 Customers',
    settings: '⚙️ Settings',
    deals: '🏷️ Deals',
    notifications: '🔔 Notifications',
    feedback: '💬 Feedback',
    accounts: '👤 Accounts',
    riders: '🏍️ Riders',
    kitchen: '👨‍🍳 Kitchen',
    logs: '📋 Logs',
  };

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-gray-400 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-white text-2xl font-bold">Admin Accounts</h1>
            <p className="text-gray-500 text-xs">Manage sub-admin accounts and permissions</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="bg-red-600 hover:bg-red-700 text-white cursor-pointer">
            <UserPlus className="w-4 h-4 mr-2" /> New Admin
          </Button>
        </div>

        {/* Super Admin Info */}
        <Card className="bg-gray-900 border-gray-800 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">Super Admin</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-600/20 text-yellow-400">OWNER</span>
              </div>
              <p className="text-gray-500 text-xs">Full access to all features • Cannot be deleted</p>
            </div>
            <span className="text-green-400 text-xs font-medium">● Active</span>
          </div>
        </Card>

        {/* Sub-Admin Accounts */}
        {accounts.length === 0 && (
          <div className="text-center py-16">
            <Shield className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No sub-admin accounts yet</p>
            <p className="text-gray-700 text-xs mt-1">Create accounts for your staff with specific permissions</p>
          </div>
        )}

        <div className="space-y-3">
          {accounts.map(account => (
            <Card key={account.id} className={`bg-gray-900 border-gray-800 p-4 ${!account.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${account.role === 'admin' ? 'bg-blue-600/20' : 'bg-purple-600/20'}`}>
                    <Shield className={`w-4 h-4 ${account.role === 'admin' ? 'text-blue-400' : 'text-purple-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{account.username}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${account.role === 'admin' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                        {account.role.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-gray-500 text-[10px]">Password: </span>
                      <span className="text-gray-400 text-[10px] font-mono">
                        {showPasswords[account.id] ? account.password : '••••••'}
                      </span>
                      <button onClick={() => togglePasswordVisibility(account.id)} className="text-gray-600 hover:text-gray-400 cursor-pointer">
                        {showPasswords[account.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={account.is_active}
                    onCheckedChange={() => toggleAccountActive(account.id)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => deleteAccount(account.id)} className="text-red-400 hover:text-red-300 cursor-pointer p-1 h-auto">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Permissions */}
              <div className="border-t border-gray-800 pt-3">
                <p className="text-gray-400 text-[10px] uppercase mb-2">Permissions</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(permissionLabels) as Array<keyof AdminAccount['permissions']>).map(perm => (
                    <button
                      key={perm}
                      onClick={() => togglePermission(account.id, perm)}
                      className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                        account.permissions[perm]
                          ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                          : 'bg-gray-800 text-gray-600 border border-gray-700'
                      }`}
                    >
                      {permissionLabels[perm]}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-gray-700 text-[10px] mt-2">Created: {new Date(account.created_at).toLocaleDateString()}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Account Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-red-400" />
              Create Admin Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-gray-300">Username</Label>
              <Input
                value={newAccount.username}
                onChange={e => setNewAccount({ ...newAccount, username: e.target.value })}
                placeholder="e.g. staff1"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300">Password</Label>
              <Input
                value={newAccount.password}
                onChange={e => setNewAccount({ ...newAccount, password: e.target.value })}
                placeholder="Min 4 characters"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300">Role</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setNewAccount({ ...newAccount, role: 'admin' })}
                  className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                    newAccount.role === 'admin'
                      ? 'border-blue-600 bg-blue-600/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  🛡️ Admin
                </button>
                <button
                  type="button"
                  onClick={() => setNewAccount({ ...newAccount, role: 'manager' })}
                  className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all cursor-pointer ${
                    newAccount.role === 'manager'
                      ? 'border-purple-600 bg-purple-600/10 text-white'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  👔 Manager
                </button>
              </div>
            </div>
            <div>
              <Label className="text-gray-300 mb-2 block">Permissions</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(permissionLabels) as Array<keyof AdminAccount['permissions']>).map(perm => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => setNewAccount({
                      ...newAccount,
                      permissions: { ...newAccount.permissions, [perm]: !newAccount.permissions[perm] }
                    })}
                    className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      newAccount.permissions[perm]
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                        : 'bg-gray-800 text-gray-600 border border-gray-700'
                    }`}
                  >
                    {permissionLabels[perm]}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createAccount} className="w-full bg-red-600 hover:bg-red-700 text-white cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Create Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}