import { useState } from 'react';
import { LayoutDashboard, FileText } from 'lucide-react';
import { BackendLogsDialog } from '../../components/BackendLogsDialog';
import { DashboardPolicyDialog } from './DashboardPolicyDialog';

type DashboardAndLogsPanelProps = {
  user: { role: string } | null;
};

export function DashboardAndLogsPanel({ user }: DashboardAndLogsPanelProps) {
  const [dashboardPolicyOpen, setDashboardPolicyOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Dashboard & Logs</h2>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setDashboardPolicyOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
          >
            <LayoutDashboard className="w-4 h-4 text-violet-400 shrink-0" />
            <div>
              <div className="font-medium">Dashboard Policy</div>
              <div className="text-xs text-zinc-500">Define Activity Log projection in JSON</div>
            </div>
          </button>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setLogsDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
            >
              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <div className="font-medium">Backend Logs</div>
                <div className="text-xs text-zinc-500">View backend audit logs with date range filter</div>
              </div>
            </button>
          )}
        </div>
      </div>

      <DashboardPolicyDialog
        open={dashboardPolicyOpen}
        onClose={() => setDashboardPolicyOpen(false)}
        user={user}
      />
      <BackendLogsDialog isOpen={logsDialogOpen} onClose={() => setLogsDialogOpen(false)} />
    </>
  );
}
