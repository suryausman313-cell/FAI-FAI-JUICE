import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      // Get super admin credentials from settings
      let superUsername = 'vitanapoli';
      let superPassword = 'admin2024';
      const ext = localStorage.getItem('extended_settings');
      if (ext) {
        try {
          const parsed = JSON.parse(ext);
          superUsername = parsed.admin_username || superUsername;
          superPassword = parsed.admin_password || superPassword;
        } catch { /* */ }
      }

      // Check super admin
      if (username === superUsername && password === superPassword) {
        localStorage.setItem('admin_auth', JSON.stringify({ username, loggedIn: true, role: 'super_admin', timestamp: Date.now() }));
        toast.success('Welcome back, Super Admin!');
        navigate('/admin/dashboard');
        setLoading(false);
        return;
      }

      // Check sub-admin accounts
      const accountsStr = localStorage.getItem('admin_accounts');
      if (accountsStr) {
        try {
          const accounts = JSON.parse(accountsStr);
          const match = accounts.find((a: any) => a.username === username && a.password === password && a.is_active);
          if (match) {
            localStorage.setItem('admin_auth', JSON.stringify({
              username: match.username,
              loggedIn: true,
              role: match.role,
              permissions: match.permissions,
              timestamp: Date.now(),
            }));
            toast.success(`Welcome back, ${match.username}!`);
            navigate('/admin/dashboard');
            setLoading(false);
            return;
          }
        } catch { /* */ }
      }

      toast.error('Invalid username or password');
      setLoading(false);
    }, 500);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-600 to-green-700 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">VN</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Vita Napoli Admin</h1>
          <p className="text-gray-400 mt-2">Sign in to manage your restaurant</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="username" className="text-gray-300">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              className="bg-gray-900 border-gray-700 text-white mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="bg-gray-900 border-gray-700 text-white mt-1"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}