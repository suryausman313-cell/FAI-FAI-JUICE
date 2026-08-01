import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole, LogIn, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAdmin } from '@/lib/admin-control';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (!username.trim() || !password) {
      toast.error('Username aur password likho');
      return;
    }

    setLoading(true);
    try {
      const session = await loginAdmin(username.trim(), password);
      toast.success(`Welcome, ${session.username}`);
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Login failed',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm bg-gray-900 border-gray-800 p-6">
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-green-600/15 border border-green-600/30 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-white text-2xl font-bold">
            Fai Fai Admin
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Secure dashboard login
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="admin-username" className="text-gray-300">
              Username
            </Label>
            <div className="relative mt-1">
              <User className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="admin-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="pl-9 bg-gray-950 border-gray-700 text-white"
                placeholder="Admin username"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="admin-password" className="text-gray-300">
              Password
            </Label>
            <div className="relative mt-1">
              <LockKeyhole className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="pl-9 bg-gray-950 border-gray-700 text-white"
                placeholder="Admin password"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-green-600 hover:bg-green-500 text-white"
          >
            <LogIn className="w-4 h-4 mr-2" />
            {loading ? 'Checking...' : 'Login'}
          </Button>
        </form>

        <p className="text-gray-600 text-[11px] text-center mt-5">
          Username, password aur staff accounts ab database me secure save hote hain.
        </p>
      </Card>
    </div>
  );
}
