import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DEFAULT_USERNAME = 'faifaiadmin';
const DEFAULT_PASSWORD = 'FaiFai@2026';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    window.setTimeout(() => {
      let superUsername = DEFAULT_USERNAME;
      let superPassword = DEFAULT_PASSWORD;
      const ext = localStorage.getItem('extended_settings');

      if (ext) {
        try {
          const parsed = JSON.parse(ext);
          superUsername = parsed.admin_username || superUsername;
          superPassword = parsed.admin_password || superPassword;
        } catch {
          // Use Fai Fai defaults.
        }
      }

      if (username === superUsername && password === superPassword) {
        localStorage.setItem(
          'admin_auth',
          JSON.stringify({
            username,
            loggedIn: true,
            role: 'super_admin',
            timestamp: Date.now(),
          }),
        );
        toast.success('Welcome back, Super Admin!');
        navigate('/admin/dashboard');
        setLoading(false);
        return;
      }

      const accountsStr = localStorage.getItem('admin_accounts');
      if (accountsStr) {
        try {
          const accounts = JSON.parse(accountsStr);
          const match = accounts.find(
            (account: any) =>
              account.username === username &&
              account.password === password &&
              account.is_active,
          );

          if (match) {
            localStorage.setItem(
              'admin_auth',
              JSON.stringify({
                username: match.username,
                loggedIn: true,
                role: match.role,
                permissions: match.permissions,
                timestamp: Date.now(),
              }),
            );
            toast.success(`Welcome back, ${match.username}!`);
            navigate('/admin/dashboard');
            setLoading(false);
            return;
          }
        } catch {
          // Continue to invalid-login message.
        }
      }

      toast.error('Invalid username or password');
      setLoading(false);
    }, 400);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-orange-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">FF</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Fai Fai Juice Admin</h1>
          <p className="text-gray-400 mt-2">Sign in to manage your shop</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="username" className="text-gray-300">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className="bg-gray-900 border-gray-700 text-white mt-1"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-semibold rounded-xl cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
