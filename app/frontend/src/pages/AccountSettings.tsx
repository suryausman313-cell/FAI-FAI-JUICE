import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { customerAuthApi } from '@/lib/customer-auth';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

export default function AccountSettings() {
  const navigate = useNavigate();
  const { customer, logout } = useCustomerAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleting) return;

    setDeleting(true);

    try {
      await customerAuthApi.deleteAccount();
      logout();

      // Remove device-only registration hints so Sign Up is available again
      // after a permanent account deletion.
      localStorage.removeItem('vita_customer_registered_on_device');
      localStorage.removeItem('vita_customer_registered_phone');
      localStorage.removeItem('vita_customer_phone');
      localStorage.removeItem('vita_customer_name');

      toast.success('Your account has been deleted');
      navigate('/account', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Account deletion failed'
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600/20">
              <UserRound className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Account</h1>
              <p className="text-sm text-gray-400">
                Manage your Fai Fai Juice customer account
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-gray-950 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Name</p>
            <p className="mt-1 font-medium">{customer?.name || 'Customer'}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-500">Mobile</p>
            <p className="mt-1 font-medium">{customer?.phone || ''}</p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              logout();
              navigate('/account', { replace: true });
            }}
            className="mt-5 h-12 w-full border-gray-700 text-gray-200"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border border-red-900/60 bg-red-950/20 p-5">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <h2 className="font-bold text-red-300">Delete Account</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Permanently deletes your Fai Fai Juice login account and direct
                customer profile data. Transaction records may be retained where
                required for accounting, fraud prevention, tax, or legal purposes.
              </p>
            </div>
          </div>

          {!showDeleteConfirm ? (
            <Button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-5 h-12 w-full bg-red-700 hover:bg-red-800"
            >
              Delete Account
            </Button>
          ) : (
            <div className="mt-5 rounded-xl border border-red-800 bg-black/20 p-4">
              <p className="text-sm font-semibold text-red-200">
                Are you sure? This cannot be undone.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={deleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="border-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteAccount}
                  className="bg-red-700 hover:bg-red-800"
                >
                  {deleting ? 'Deleting…' : 'Permanently Delete'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
