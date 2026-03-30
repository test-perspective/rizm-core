import { useEffect, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiJson } from '../auth/api';
import { formatAuditLogMeta } from '../utils/auditLogMeta';
import { DELETED_USER_LABEL } from '../utils/userDisplay';

interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorUserEmail?: string | null;
  action: string;
  targetUserId: string | null;
  targetUserEmail?: string | null;
  metaJson: string | null;
  createdAt: number;
  isActivity: boolean;
}

interface BackendLogsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackendLogsDialog({ isOpen, onClose }: BackendLogsDialogProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'activity' | 'non-activity'>('all');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', '200');
      params.append('offset', '0');
      
      if (since) {
        const sinceMs = new Date(since).getTime();
        if (!isNaN(sinceMs)) {
          params.append('since', sinceMs.toString());
        }
      }
      if (until) {
        const untilMs = new Date(until).getTime();
        if (!isNaN(untilMs)) {
          params.append('until', untilMs.toString());
        }
      }

      if (activityFilter === 'activity') {
        params.append('isActivity', 'true');
      } else if (activityFilter === 'non-activity') {
        params.append('isActivity', 'false');
      }

      const data = await apiJson<AuditLogRow[]>(`/api/admin/audit-logs?${params.toString()}`);
      setLogs(data);
    } catch (e) {
      console.error(e);
      setError('Failed to fetch logs.');
    } finally {
      setLoading(false);
    }
  }, [since, until, activityFilter]);

  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setError(null);
      setSince('');
      setUntil('');
      setActivityFilter('all');
      return;
    }
    loadLogs();
  }, [isOpen, loadLogs]);

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('ja-JP');
  };

  const formatUserCell = (email?: string | null, userId?: string | null): string => {
    if (email) return email;
    if (userId) return `${DELETED_USER_LABEL} (${userId})`;
    return '—';
  };


  const setQuickFilter = (hours: number) => {
    const now = new Date();
    const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
    setSince(past.toISOString().slice(0, 16));
    setUntil(now.toISOString().slice(0, 16));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-6xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-white">Backend Logs</h3>
            <p className="text-xs text-zinc-500 mt-1">audit logs (max 200 entries)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Filter UI */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-white">Filter</div>
            
            {/* Log type filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActivityFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  activityFilter === 'all'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                All Logs
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('activity')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  activityFilter === 'activity'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                Activity Logs Only
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('non-activity')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  activityFilter === 'non-activity'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                Non-Activity Logs
              </button>
            </div>

            {/* Date range filter */}
            <div className="text-sm font-semibold text-white mt-4">Date Range Filter</div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setQuickFilter(24)}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Last 24 Hours
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter(24 * 7)}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setSince('');
                  setUntil('');
                }}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors"
              >
                All Time
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
                <input
                  type="datetime-local"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">End Date</label>
                <input
                  type="datetime-local"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={loadLogs}
                disabled={loading}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Load Logs
              </button>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md p-3">
              {error}
            </div>
          )}

          {/* Log list */}
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-zinc-400 text-center py-12">No logs found</div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950 border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-zinc-400 font-medium">Date/Time</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-medium">Action</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-medium">User</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-medium">Target</th>
                      <th className="px-4 py-3 text-left text-zinc-400 font-medium">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-950/50">
                        <td className="px-4 py-3 text-zinc-300 font-mono text-xs">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-white font-mono text-xs">{log.action}</td>
                        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                          {formatUserCell(log.actorUserEmail, log.actorUserId)}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                          {formatUserCell(log.targetUserEmail, log.targetUserId)}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs max-w-md">
                          <pre className="whitespace-pre-wrap break-all">
                            {formatAuditLogMeta(log.metaJson)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
