import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiJson } from '../auth/api';
import { EntityNotInProjectError, navigateToWorkspaceEntity } from '../workspace/entityRouting';
import type { WorkspaceEntityKind } from '../workspace/entityRouting';
import { formatAuditLogMeta } from '../utils/auditLogMeta';

// Set page title
const usePageTitle = () => {
  useEffect(() => {
    document.title = 'Rizm - Dashboard';
  }, []);
};

type DashboardChildNode = {
  id: string;
  action: string;
  createdAt: number;
  actorUserId: string | null;
  actorUserEmail?: string | null;
  changes?: unknown;
};

type DashboardParentNode = {
  key: string;
  projectId: string;
  projectName: string;
  entityType: string;
  entityId: string;
  entityTitle: string;
  children: DashboardChildNode[];
};

type DashboardSection = {
  id: string;
  title: string;
  items: DashboardParentNode[];
};

type DashboardFeedResponse = {
  sections: DashboardSection[];
};

function formatAction(action: string): string {
  switch (action) {
    case 'TASK_CREATED':
      return 'Created';
    case 'TASK_UPDATED':
      return 'Updated';
    case 'TASK_DELETED':
      return 'Deleted';
    case 'WIKI_UPDATED':
      return 'Page updated';
    default:
      return action;
  }
}

function formatChangesForDisplay(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return '';
  const metaJson = JSON.stringify({ changes });
  const formatted = formatAuditLogMeta(metaJson);
  return formatted === '—' ? '' : formatted;
}

function entityKindFor(entityType: string): WorkspaceEntityKind | null {
  if (entityType === 'TASK') return 'task';
  if (entityType === 'WIKI') return 'page';
  return null;
}

/** The entity is gone when its most recent activity is a deletion; linking there would go nowhere. */
function isEntityDeleted(parent: DashboardParentNode): boolean {
  let latest: DashboardChildNode | null = null;
  for (const c of parent.children) {
    if (!latest || c.createdAt > latest.createdAt) latest = c;
  }
  return latest !== null && latest.action.endsWith('_DELETED');
}

export function DashboardPage() {
  usePageTitle();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardFeedResponse | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [navError, setNavError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiJson<DashboardFeedResponse>('/api/dashboard/feed');
        if (!cancelled) setData(res);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('Failed to load dashboard. Please check login status and backend settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => data?.sections ?? [], [data]);

  const handleOpen = async (parent: DashboardParentNode, kind: WorkspaceEntityKind) => {
    setNavError(null);
    setPendingKey(parent.key);
    try {
      await navigateToWorkspaceEntity({
        kind,
        projectId: parent.projectId,
        entityPk: parent.entityId,
        navigate,
        // The feed records the project an entity was in when the activity happened.
        verifyEntityExists: true,
      });
    } catch (e) {
      console.error(e);
      setNavError(
        e instanceof EntityNotInProjectError
          ? `"${parent.entityTitle}" is no longer in ${parent.projectName}. It may have been moved or deleted.`
          : `Failed to open "${parent.entityTitle}". Please try again.`
      );
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="min-h-full box-border bg-zinc-950 text-white p-6 sm:p-8 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors" to="/me">
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div>
        </div>

        {loading && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-300">Loading...</div>
        )}

        {error && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-red-300">{error}</div>}

        {navError && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-red-300">{navError}</div>
        )}

        {!loading && !error && sections.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-300">
            No updates to display.
          </div>
        )}

        {!loading &&
          !error &&
          sections.map((section) => (
            <div key={section.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-4 space-y-3">
                {section.items.length === 0 ? (
                  <div className="text-sm text-zinc-400">No matching updates.</div>
                ) : (
                  section.items.map((parent) => {
                    const kind = isEntityDeleted(parent) ? null : entityKindFor(parent.entityType);
                    return (
                      <details key={parent.key} className="bg-zinc-950/40 border border-zinc-800 rounded-lg">
                        <summary className="cursor-pointer select-none px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-zinc-400">
                              {parent.entityType === 'TASK' ? 'Task' : parent.entityType === 'WIKI' ? 'Wiki' : parent.entityType}
                              ：
                            </div>
                            {kind ? (
                              <button
                                type="button"
                                // The toggle is the summary's default click action, so preventDefault is what keeps it closed.
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleOpen(parent, kind);
                                }}
                                disabled={pendingKey === parent.key}
                                className="mt-0.5 block max-w-full truncate text-left font-medium hover:underline disabled:cursor-wait disabled:opacity-60"
                              >
                                {parent.entityTitle}
                              </button>
                            ) : (
                              <div className="mt-0.5 font-medium truncate">{parent.entityTitle}</div>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 whitespace-nowrap">{parent.projectName}</div>
                        </summary>
                        <div className="px-4 pb-3">
                          <div className="space-y-2">
                            {parent.children.map((c) => {
                              const changeDisplay = formatChangesForDisplay(c.changes);
                              return (
                                <div key={c.id} className="text-sm text-zinc-200 border-t border-zinc-800 pt-2">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-zinc-400">{new Date(c.createdAt).toLocaleString()}</span>
                                    <span>{formatAction(c.action)}</span>
                                    <span className="text-zinc-500">（by {c.actorUserEmail ?? c.actorUserId ?? '—'}）</span>
                                  </div>
                                  {changeDisplay && (
                                    <div className="mt-1 text-xs text-zinc-400 whitespace-pre-wrap break-words font-mono">
                                      {changeDisplay}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </details>
                    );
                  })
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

