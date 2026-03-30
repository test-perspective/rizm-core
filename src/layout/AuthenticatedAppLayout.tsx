import { Outlet } from 'react-router-dom';
import { RequireAuth } from '../auth/RequireAuth';
import { InstanceBanner } from '../components/InstanceBanner';

/** Pathless layout: session gate, then global instance banner + nested routes. */
export function AuthenticatedAppLayout() {
  return (
    <RequireAuth>
      <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950">
        <InstanceBanner />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <Outlet />
        </div>
      </div>
    </RequireAuth>
  );
}
