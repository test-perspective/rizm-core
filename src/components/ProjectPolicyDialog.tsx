import { useCallback, useEffect, useState } from 'react';
import { fetchProjectPolicy, updateProjectPolicy } from '../api/permissions';
import type { ProjectPolicy, Permission, UserGroup } from '../auth/types';
import { fetchUserGroups } from '../api/permissions';
import { apiJson } from '../auth/api';
import { X, Save, Trash2 } from 'lucide-react';

interface ProjectPolicyDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

interface User {
  id: string;
  email: string;
}

export function ProjectPolicyDialog({ projectId, projectName, open, onClose, onSave }: ProjectPolicyDialogProps) {
  const [policy, setPolicy] = useState<ProjectPolicy | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [policyData, groupsData, usersData] = await Promise.all([
        fetchProjectPolicy(projectId),
        fetchUserGroups(),
        apiJson<Array<{ id: string; email: string }>>('/api/admin/users').then((rows) =>
          rows.map((row) => ({ id: row.id, email: row.email }))
        ),
      ]);
      setPolicy(policyData);
      setGroups(groupsData);
      setUsers(usersData);
    } catch (e) {
      console.error('Failed to load data:', e);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleSave = async () => {
    if (!policy) return;
    try {
      setSaving(true);
      setError(null);
      await updateProjectPolicy(projectId, policy);
      onSave?.();
      onClose();
    } catch (e) {
      console.error('Failed to save policy:', e);
      setError('Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const updateProjectDefault = (field: 'groups' | 'users' | 'anonymous', key: string | null, value: Permission | null) => {
    if (!policy) return;
    const updated = { ...policy };
    if (field === 'anonymous') {
      updated.projectDefaults = { ...updated.projectDefaults, anonymous: value || 'none' };
    } else if (key) {
      if (value === null) {
        // Delete the entry
        const newFields = { ...updated.projectDefaults[field] };
        delete newFields[key];
        updated.projectDefaults = { ...updated.projectDefaults, [field]: newFields };
      } else {
        // Update the entry
        updated.projectDefaults = {
          ...updated.projectDefaults,
          [field]: {
            ...updated.projectDefaults[field],
            [key]: value,
          },
        };
      }
    }
    setPolicy(updated);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-xl font-bold text-white">Access Policy: {projectName}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-zinc-400 py-8">Loading...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : !policy ? (
            <div className="text-center text-zinc-400 py-8">Policy not found</div>
          ) : (
            <div className="space-y-6">
              {/* Project Defaults */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Project Defaults</h3>
                
                {/* Anonymous */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Anonymous Users</label>
                  <select
                    value={policy.projectDefaults.anonymous}
                    onChange={(e) => updateProjectDefault('anonymous', null, e.target.value as Permission)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                  >
                    <option value="none">No Access</option>
                    <option value="read">Read Only</option>
                  </select>
                </div>

                {/* Groups */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Group Permissions</label>
                  <div className="space-y-2">
                    {Object.entries(policy.projectDefaults.groups || {}).map(([groupId, perm]) => (
                      <div key={groupId} className="flex items-center gap-2">
                        <select
                          value={perm}
                          onChange={(e) => updateProjectDefault('groups', groupId, e.target.value as Permission)}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                        >
                          <option value="none">No Access</option>
                          <option value="read">Read Only</option>
                          <option value="write">Read/Write</option>
                        </select>
                        <span className="text-zinc-400 w-48 truncate">{groups.find((g) => g.id === groupId)?.name || groupId}</span>
                        <button
                          onClick={() => updateProjectDefault('groups', groupId, null)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          updateProjectDefault('groups', e.target.value, 'read');
                          e.target.value = '';
                        }
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                    >
                      <option value="">Add group...</option>
                      {groups
                        .filter((g) => !policy.projectDefaults.groups?.[g.id])
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Users */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">User Permissions</label>
                  <div className="space-y-2">
                    {Object.entries(policy.projectDefaults.users || {}).map(([userId, perm]) => (
                      <div key={userId} className="flex items-center gap-2">
                        <select
                          value={perm}
                          onChange={(e) => updateProjectDefault('users', userId, e.target.value as Permission)}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                        >
                          <option value="none">No Access</option>
                          <option value="read">Read Only</option>
                          <option value="write">Read/Write</option>
                        </select>
                        <span className="text-zinc-400 w-48 truncate">{users.find((u) => u.id === userId)?.email || userId}</span>
                        <button
                          onClick={() => updateProjectDefault('users', userId, null)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          updateProjectDefault('users', e.target.value, 'read');
                          e.target.value = '';
                        }
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                    >
                      <option value="">Add user...</option>
                      {users
                        .filter((u) => !policy.projectDefaults.users?.[u.id])
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-4 p-4 border-t border-zinc-700">
          <button onClick={onClose} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || !policy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
