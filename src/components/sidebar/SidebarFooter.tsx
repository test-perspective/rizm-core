import { LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../UserAvatar';
import type { Me } from '../../auth/types';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SidebarFooterProps {
  user: Me;
}

export function SidebarFooter({ user }: SidebarFooterProps) {
  const isMobile = useIsMobile();
  return (
    <div className="p-3 border-t border-zinc-800">
      <Link
        to="/me"
        className="block px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        <div className="text-xs text-zinc-400">Signed in</div>
        <div className="mt-1 flex items-center gap-2">
          <UserAvatar email={user.email} size="sm" />
          <span className="text-sm text-white truncate" title={user.email}>
            {user.email}
          </span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">role: {user.role}</div>
      </Link>

      {/* REQ-286: Dashboard is desktop-only — hidden on mobile per request. */}
      {!isMobile && (
        <div className="mt-2 space-y-1">
          <Link
            to="/dashboard"
            className="w-full flex items-center gap-3 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors text-sm text-zinc-200"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
        </div>
      )}
    </div>
  );
}
