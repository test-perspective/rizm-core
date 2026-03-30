import { ReactNode } from 'react';
import { usePermission } from '../hooks/usePermission';

interface PermissionGuardProps {
  projectId: string;
  requireRead?: boolean;
  requireWrite?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({
  projectId,
  requireRead,
  requireWrite,
  fallback,
  children,
}: PermissionGuardProps) {
  const { canRead, canWrite, loading } = usePermission(projectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (requireRead && !canRead) {
    return (
      fallback || (
        <div className="flex items-center justify-center p-8">
          <div className="text-zinc-400">You do not have read permission.</div>
        </div>
      )
    );
  }

  if (requireWrite && !canWrite) {
    return (
      fallback || (
        <div className="flex items-center justify-center p-8">
          <div className="text-zinc-400">You do not have write permission.</div>
        </div>
      )
    );
  }

  return <>{children}</>;
}
