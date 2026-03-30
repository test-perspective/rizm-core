import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../auth/api';

type ChangePasswordDialogProps = {
  open: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

export function ChangePasswordDialog({ open, onClose, onRefresh }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      setCurrentPassword('');
      setNewPassword('');
      setStatus('Password changed successfully.');
      await onRefresh();
    } catch (e) {
      console.error(e);
      setStatus('Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Change Password</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-zinc-400 mb-4">New password must be at least 12 characters.</p>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-300">Current Password</label>
              <input
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-300">New Password</label>
              <input
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={12}
              />
            </div>
            {status && (
              <div className="text-sm text-zinc-200 bg-zinc-950/40 border border-zinc-800 rounded-md p-3">
                {status}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
                type="submit"
              >
                {saving ? 'Updating...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
