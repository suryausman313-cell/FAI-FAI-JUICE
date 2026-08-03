import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  ShieldAlert,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  clearAdminSession,
  getAdminMe,
  readAdminSession,
  updateSuperAdmin,
} from '@/lib/admin-control';

export default function AdminSecuritySettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    const session = readAdminSession();
    if (!session) {
      navigate('/admin');
      return;
    }
    if (session.role !== 'super_admin') {
      toast.error('Only the Super Admin can change the username and password.');
      navigate('/admin/dashboard');
      return;
    }

    void loadCurrentAdmin();
  }, [navigate]);

  async function loadCurrentAdmin() {
    try {
      const me = await getAdminMe();
      setUsername(me.username);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Admin details could not be loaded.',
      );
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (username.trim().length < 3) {
      toast.error('Username must be at least 3 characters.');
      return;
    }
    if (!currentPassword) {
      toast.error('Enter the current password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('The new password must be different from the current password.');
      return;
    }

    setSaving(true);
    try {
      const result = await updateSuperAdmin({
        current_password: currentPassword,
        new_username: username.trim(),
        new_password: newPassword,
      });

      toast.success(result.message);
      clearAdminSession();
      navigate('/admin');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Username and password could not be changed.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading security settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/admin/settings')}
            className="text-gray-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <h1 className="text-white text-2xl font-bold">
              Admin Security
            </h1>
            <p className="text-gray-500 text-sm">
              Change the Super Admin username and password
            </p>
          </div>
        </div>

        <Card className="bg-amber-950/20 border-amber-900/40 p-4 mb-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <p className="text-amber-200 text-sm font-semibold">
                You will be logged out automatically after saving
              </p>
              <p className="text-amber-300/60 text-xs mt-1">
                Log in again using the new username and password.
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-5">
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <Label htmlFor="new-admin-username" className="text-gray-300">
                New Admin Username
              </Label>
              <div className="relative mt-1">
                <User className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="new-admin-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="pl-9 bg-gray-950 border-gray-700 text-white"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="current-admin-password" className="text-gray-300">
                Current Password
              </Label>
              <div className="relative mt-1">
                <KeyRound className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="current-admin-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="pl-9 pr-10 bg-gray-950 border-gray-700 text-white"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="new-admin-password" className="text-gray-300">
                New Password
              </Label>
              <div className="relative mt-1">
                <LockKeyhole className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="new-admin-password"
                  type={showPasswords ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="pl-9 pr-10 bg-gray-950 border-gray-700 text-white"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="confirm-admin-password" className="text-gray-300">
                Confirm New Password
              </Label>
              <Input
                id="confirm-admin-password"
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 bg-gray-950 border-gray-700 text-white"
                autoComplete="new-password"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowPasswords((current) => !current)}
              className="text-gray-400 hover:text-white text-xs flex items-center gap-2"
            >
              {showPasswords ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {showPasswords ? 'Hide passwords' : 'Show passwords'}
            </button>

            <Button
              type="submit"
              disabled={saving}
              className="w-full h-12 bg-green-600 hover:bg-green-500"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Change Username & Password'}
            </Button>
          </form>
        </Card>

        <Card className="bg-gray-900 border-gray-800 p-4 mt-4">
          <p className="text-white text-sm font-semibold">Kitchen PIN</p>
          <p className="text-gray-500 text-xs mt-1">
            The Kitchen PIN is controlled by the KITCHEN_PIN variable in the Render Environment. Changing the Admin username or password here will not change the Kitchen PIN.
          </p>
          <p className="text-gray-600 text-xs mt-2">
            INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD are used only for the first Admin setup. For an existing Admin, change the credentials on this page.
          </p>
        </Card>
      </div>
    </div>
  );
}
