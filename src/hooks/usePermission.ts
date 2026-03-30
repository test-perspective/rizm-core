import { useAuth } from '../auth/AuthContext';
import { checkPermission } from '../api/permissions';
import { useEffect, useState } from 'react';

export function usePermission(projectId: string) {
  const { user } = useAuth();
  const [canRead, setCanRead] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setCanRead(false);
      setCanWrite(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    checkPermission(projectId)
      .then((result) => {
        if (!cancelled) {
          setCanRead(result.canRead);
          setCanWrite(result.canWrite);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanRead(false);
          setCanWrite(false);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, user]);

  return { canRead, canWrite, loading };
}
