import { useEffect, useState } from 'react';
import { Archive, RefreshCw, Save, X } from 'lucide-react';
import { apiFetch, apiJson } from '../../auth/api';
import { formatBytes } from '../../utils/formatBytes';

type DbBackupSettings = {
  enabled: boolean;
  scheduledTime: string;
  retentionDays: number;
  lastRunDay?: string | null;
};

type DbSnapshotRow = {
  fileName: string;
  createdAtMs: number;
  sizeBytes: number;
  kind: string;
};

type DbSnapshotsDialogProps = {
  open: boolean;
  onClose: () => void;
};

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(ms);
  }
}

export function DbSnapshotsDialog({ open, onClose }: DbSnapshotsDialogProps) {
  const [settings, setSettings] = useState<DbBackupSettings>({
    enabled: false,
    scheduledTime: '02:30',
    retentionDays: 7,
    lastRunDay: null,
  });
  const [snapshots, setSnapshots] = useState<DbSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    setSavedOk(false);
    try {
      const s = await apiJson<{ settings: DbBackupSettings }>('/api/admin/db-backup/settings');
      setSettings({
        enabled: !!s.settings.enabled,
        scheduledTime: (s.settings.scheduledTime || '02:30').trim(),
        retentionDays: Math.max(1, Number(s.settings.retentionDays) || 7),
        lastRunDay: s.settings.lastRunDay ?? null,
      });
      const list = await apiJson<DbSnapshotRow[]>('/api/admin/db-backup/snapshots');
      setSnapshots(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load DB snapshots.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadAll();
  }, [open]);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await apiFetch('/api/admin/db-backup/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            enabled: settings.enabled,
            scheduledTime: settings.scheduledTime.trim(),
            retentionDays: settings.retentionDays,
            lastRunDay: settings.lastRunDay ?? undefined,
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { settings: DbBackupSettings };
      setSettings({
        enabled: !!body.settings.enabled,
        scheduledTime: (body.settings.scheduledTime || '02:30').trim(),
        retentionDays: Math.max(1, Number(body.settings.retentionDays) || 7),
        lastRunDay: body.settings.lastRunDay ?? null,
      });
      setSavedOk(true);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const createManual = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/db-backup/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'manual' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      await loadAll();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to create snapshot.');
    } finally {
      setCreating(false);
    }
  };

  const startRestore = (fileName: string) => {
    setRestoreTarget(fileName);
    setRestoreConfirm('');
  };

  const cancelRestore = () => {
    setRestoreTarget(null);
    setRestoreConfirm('');
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    if (restoreConfirm.trim() !== 'RESTORE') {
      setError('Type RESTORE to confirm.');
      return;
    }
    setRestoring(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeoutMs = 120_000;
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      const res = await apiFetch('/api/admin/db-backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: restoreTarget, confirm: 'RESTORE' }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      cancelRestore();
      window.location.reload();
    } catch (e) {
      console.error(e);
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(`Restore timed out after ${Math.round(120_000 / 1000)}s. Try again when the server is idle.`);
      } else {
        setError(e instanceof Error ? e.message : 'Restore failed.');
      }
    } finally {
      setRestoring(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-labelledby="db-snapshots-title"
        aria-modal="true"
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h3 id="db-snapshots-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <Archive className="w-5 h-5 text-violet-400 shrink-0" />
            DB snapshots
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-6">
          <p className="text-sm text-zinc-400">
            Scheduled backups store the SQLite database only (attachments are excluded). Restoring replaces the live
            database and reloads the app.
          </p>

          {error && <div className="text-sm text-red-400 border border-red-900/50 rounded-md px-3 py-2">{error}</div>}
          {savedOk && <div className="text-sm text-emerald-400">Settings saved.</div>}

          {loading && <div className="text-sm text-zinc-400">Loading...</div>}

          {!loading && (
            <>
              <div className="rounded-lg border border-zinc-800 p-4 space-y-4">
                <div className="text-sm font-medium text-zinc-200">Schedule</div>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
                  />
                  Enable daily automatic snapshot
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Local time (HH:MM)</div>
                    <input
                      type="text"
                      value={settings.scheduledTime}
                      onChange={(e) => setSettings((s) => ({ ...s, scheduledTime: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm font-mono"
                      placeholder="02:30"
                      aria-label="Scheduled time"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Retention (days)</div>
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={settings.retentionDays}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, retentionDays: Math.max(1, Number(e.target.value) || 1) }))
                      }
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm font-mono"
                      aria-label="Retention days"
                    />
                  </div>
                </div>
                {settings.lastRunDay && (
                  <div className="text-xs text-zinc-500">Last automatic run (day): {settings.lastRunDay}</div>
                )}
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-md text-sm font-medium"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save schedule'}
                </button>
              </div>

              <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-zinc-200">Snapshots</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void loadAll()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => void createManual()}
                      disabled={creating}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-md"
                    >
                      {creating ? 'Creating...' : 'Create now'}
                    </button>
                  </div>
                </div>

                {snapshots.length === 0 ? (
                  <div className="text-sm text-zinc-500">No snapshots yet.</div>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {snapshots.map((row) => (
                      <li
                        key={row.fileName}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm border border-zinc-800 rounded-md px-3 py-2"
                      >
                        <div>
                          <div className="font-mono text-xs text-zinc-200 break-all">{row.fileName}</div>
                          <div className="text-xs text-zinc-500">
                            {formatTs(row.createdAtMs)} · {formatBytes(row.sizeBytes)} · {row.kind}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startRestore(row.fileName)}
                          className="shrink-0 px-2 py-1 text-xs border border-amber-700 text-amber-200 hover:bg-amber-950 rounded"
                        >
                          Restore…
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {restoreTarget && (
          <div className="border-t border-zinc-800 px-6 py-4 bg-zinc-900/80 space-y-3">
            <div className="text-sm text-amber-200 font-medium">Danger: restore database</div>
            <p className="text-xs text-zinc-400">
              This will replace the current SQLite database with &quot;{restoreTarget}&quot;. Type RESTORE to confirm.
            </p>
            <p className="text-xs text-zinc-500 border-l-2 border-amber-800/80 pl-2">
              After a successful restore, your current session usually no longer matches the restored database. Expect to
              land on the sign-in page and log in again with a user that exists in that backup.
            </p>
            <input
              type="text"
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-sm font-mono"
              placeholder="RESTORE"
              aria-label="Type RESTORE to confirm"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={cancelRestore}
                className="px-4 py-2 text-sm border border-zinc-700 rounded-md hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmRestore()}
                disabled={restoring}
                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-md"
              >
                {restoring ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
