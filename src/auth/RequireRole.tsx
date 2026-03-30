import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Role } from './types';

const rank: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export function RequireRole({ minRole, children }: { minRole: Role; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  if (rank[user.role] < rank[minRole]) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white">You do not have permission.</div>
      </div>
    );
  }

  return <>{children}</>;
}

