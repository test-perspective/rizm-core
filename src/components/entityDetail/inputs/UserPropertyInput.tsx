import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { UserSummary } from '../../../types';
import { UserAvatar } from '../../UserAvatar';
import { DELETED_USER_LABEL, getUserDisplayName } from '../../../utils/userDisplay';
import { searchUsersApi } from '../../../api/users';

type UserPropertyInputProps = {
  value: unknown;
  usersById: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  onChange: (nextValue: string | null) => void;
};

export const UserPropertyInput = ({
  value,
  usersById,
  onResolveUsers,
  onChange,
}: UserPropertyInputProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserId = typeof value === 'string' && value.trim() ? value.trim() : null;
  const currentUser = currentUserId ? usersById[currentUserId] : null;

  useEffect(() => {
    if (!currentUserId || currentUser || !onResolveUsers) return;
    onResolveUsers([currentUserId]);
  }, [currentUserId, currentUser, onResolveUsers]);

  const searchUsers = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const users = await searchUsersApi(query, 20);
      setOptions(users);
    } catch (e) {
      console.error('Failed to search users:', e);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      searchUsers(searchQuery);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen, searchUsers, searchQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(newValue);
    }, 300);
  };

  const handleSelect = (selectedUser: UserSummary) => {
    onChange(selectedUser.id);
    if (!usersById[selectedUser.id] && onResolveUsers) {
      onResolveUsers([selectedUser.id]);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = () => {
    onChange(null);
  };

  return (
    <div className="space-y-2">
      {currentUser ? (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">
          <UserAvatar email={currentUser.email} size="sm" />
          <span className="text-white text-sm flex-1" title={currentUser.email}>
            {getUserDisplayName(currentUser.email)}
          </span>
          <span className="text-zinc-500 text-xs">{currentUser.email}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-zinc-500 hover:text-red-400 transition-colors ml-2"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : currentUserId ? (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2">
          <span className="text-zinc-500 text-sm">{DELETED_USER_LABEL}</span>
          <span className="text-zinc-600 text-xs font-mono">{currentUserId}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-zinc-500 hover:text-red-400 transition-colors ml-auto"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-left flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          <span>{currentUser ? 'Change assignee...' : 'Select assignee...'}</span>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-md shadow-lg max-h-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleInputChange}
                  placeholder="Search by email..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-zinc-500 text-center">Searching...</div>
              ) : options.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">No users found</div>
              ) : (
                options.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className="w-full px-3 py-2 text-left hover:bg-zinc-900 transition-colors border-b border-zinc-800 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <UserAvatar email={u.email} size="sm" />
                      <span className="text-white text-sm">{getUserDisplayName(u.email)}</span>
                      <span className="text-zinc-500 text-xs ml-auto">{u.email}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-2 border-t border-zinc-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className="px-3 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <span className="text-xs text-zinc-600">{options.length} shown</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
