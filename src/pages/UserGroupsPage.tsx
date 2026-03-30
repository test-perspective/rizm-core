import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { RequireRole } from '../auth/RequireRole';
import {
  fetchUserGroups,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
} from '../api/permissions';
import { apiJson } from '../auth/api';
import type { UserGroup } from '../auth/types';
import { Plus, Trash2, X } from 'lucide-react';
import { useAppDialog } from '../components/dialogs';

interface User {
  id: string;
  email: string;
}

async function fetchUsers(): Promise<User[]> {
  const rows = await apiJson<Array<{ id: string; email: string }>>('/api/admin/users');
  return rows.map((row) => ({ id: row.id, email: row.email }));
}

export function UserGroupsPage() {
  const dialog = useAppDialog();
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, string[]>>({});

  // Set page title
  useEffect(() => {
    document.title = 'Rizm - Group Management';
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsData, usersData] = await Promise.all([fetchUserGroups(), fetchUsers()]);
      setGroups(groupsData);
      setUsers(usersData);
      
      // Load members for all groups
      const members: Record<string, string[]> = {};
      for (const group of groupsData) {
        try {
          const memberIds = await getGroupMembers(group.id);
          members[group.id] = memberIds;
        } catch (e) {
          console.error(`Failed to load members for group ${group.id}:`, e);
          members[group.id] = [];
        }
      }
      setGroupMembers(members);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createUserGroup(newGroupName.trim(), newGroupDescription.trim() || undefined);
      setNewGroupName('');
      setNewGroupDescription('');
      await loadData();
    } catch (error) {
      console.error('Failed to create group:', error);
      await dialog.alert({ message: 'Failed to create group' });
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !editingGroup.name.trim()) return;
    try {
      await updateUserGroup(editingGroup.id, editingGroup.name.trim(), editingGroup.description?.trim() || undefined);
      setEditingGroup(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update group:', error);
      await dialog.alert({ message: 'Failed to update group' });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteUserGroup(groupId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete group:', error);
      await dialog.alert({ message: 'Failed to delete group' });
    }
  };

  const handleAddMember = async (groupId: string, userId: string) => {
    try {
      await addUserToGroup(groupId, userId);
      await loadData();
    } catch (error) {
      console.error('Failed to add member:', error);
      await dialog.alert({ message: 'Failed to add member' });
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await removeUserFromGroup(groupId, userId);
      await loadData();
    } catch (error) {
      console.error('Failed to remove member:', error);
      await dialog.alert({ message: 'Failed to remove member' });
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <RequireRole minRole="admin">
        <div />
      </RequireRole>
    );
  }

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full box-border bg-zinc-950 text-white p-6 sm:p-8 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors" to="/me">
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
            <h1 className="text-2xl font-bold">User Group Management</h1>
          </div>
        </div>

        {/* Create new group */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create New Group</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
            />
            <button
              onClick={handleCreateGroup}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
          </div>
        </div>

        {/* Groups list */}
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {editingGroup?.id === group.id ? (
                    <div className="flex gap-4 items-start">
                      <input
                        type="text"
                        value={editingGroup.name}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={editingGroup.description || ''}
                        onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value || undefined })}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                      />
                      <button
                        onClick={handleUpdateGroup}
                        className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingGroup(null)}
                        className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold">{group.name}</h3>
                      {group.description && <p className="text-zinc-400 mt-1">{group.description}</p>}
                    </>
                  )}
                </div>
                {!editingGroup && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingGroup(group)}
                      className="bg-zinc-700 hover:bg-zinc-600 px-3 py-1 rounded text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                    <button
                      onClick={() => setSelectedGroup(selectedGroup === group.id ? null : group.id)}
                      className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm"
                    >
                      {selectedGroup === group.id ? 'Close' : 'Manage Members'}
                    </button>
                  </div>
                )}
              </div>

              {selectedGroup === group.id && (
                <div className="mt-4 pt-4 border-t border-zinc-700">
                  <h4 className="font-semibold mb-3">Members ({groupMembers[group.id]?.length || 0})</h4>
                  <div className="space-y-2 mb-4">
                    {groupMembers[group.id]?.map((userId) => {
                      const user = users.find((u) => u.id === userId);
                      return (
                        <div key={userId} className="flex items-center justify-between bg-zinc-800 rounded px-3 py-2">
                          <span>{user?.email || userId}</span>
                          <button
                            onClick={() => handleRemoveMember(group.id, userId)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddMember(group.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
                    >
                      <option value="">Add user...</option>
                      {users
                        .filter((u) => !groupMembers[group.id]?.includes(u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="text-center text-zinc-400 py-8">No groups found</div>
        )}
      </div>
    </div>
  );
}
