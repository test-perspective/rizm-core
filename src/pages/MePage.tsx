import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Key, MessageSquareText, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserAvatar } from '../components/UserAvatar';
import { AdminSection } from './me/AdminSection';
import { AssistantDialog } from './me/AssistantDialog';
import { ChangePasswordDialog } from './me/ChangePasswordDialog';
import { McpApiKeyDialog } from './me/McpApiKeyDialog';
import { DashboardAndLogsPanel } from './me/DashboardAndLogsPanel';
import { useIsMobile } from '../hooks/useIsMobile';

export function MePage() {
  const { user, logout, refresh } = useAuth();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [mcpApiKeyOpen, setMcpApiKeyOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    document.title = 'Rizm - Settings';
  }, []);

  if (!user) return null;

  // REQ-286: on mobile, the /me screen is intentionally minimal — just the user
  // identity and Logout. AI Assistant, Account/Change Password, Integrations,
  // Dashboard & Logs, and Admin sections are desktop-only.
  if (isMobile) {
    return (
      <div className="box-border w-full shrink-0 bg-zinc-950 text-white px-6 pt-6 pb-24">
        <header className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
          <span className="w-10" aria-hidden />
        </header>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
          <UserAvatar email={user.email} size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{user.email}</div>
            <div className="text-xs text-zinc-500">role: {user.role}</div>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-sm text-zinc-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="box-border w-full shrink-0 bg-zinc-950 text-white px-6 pt-6 sm:px-8 sm:pt-8 md:px-10 md:pt-10 pb-24 sm:pb-28 md:pb-32">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </Link>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
            >
              <MessageSquareText className="w-4 h-4" />
              AI Assistant
            </button>
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">Account</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="text-sm text-zinc-400">Email</div>
                <div className="mt-1 flex items-center gap-2">
                  <UserAvatar email={user.email} size="md" />
                  <span className="font-mono">{user.email}</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-zinc-400">Role</div>
                <div className="mt-1 font-mono">{user.role}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-zinc-400">
              Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm text-zinc-300 transition-colors"
              >
                <Key className="w-4 h-4" />
                Change Password
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">Integrations</h2>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setMcpApiKeyOpen(true)}
                className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
              >
                <Key className="w-4 h-4 text-violet-400 shrink-0" />
                <div>
                  <div className="font-medium">MCP API Key</div>
                  <div className="text-xs text-zinc-500">Manage Cursor MCP HTTP connection key</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashboardAndLogsPanel user={user} />
          <AdminSection user={user} />
        </div>
      </div>

      <AssistantDialog open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onRefresh={refresh}
      />
      <McpApiKeyDialog open={mcpApiKeyOpen} onClose={() => setMcpApiKeyOpen(false)} />
    </div>
  );
}
