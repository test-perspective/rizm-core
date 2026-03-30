import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entity, UserSummary } from '../types';
import { resolveUsersApi } from '../api/users';

export const useResolvedUsers = (entities: Entity[]) => {
  const [usersById, setUsersById] = useState<Record<string, UserSummary>>({});
  const pendingUserIdsRef = useRef<Set<string>>(new Set());

  const resolveUsers = useCallback(async (userIds: string[]) => {
    const idsToResolve = userIds.filter((id) => id && !pendingUserIdsRef.current.has(id));
    if (idsToResolve.length === 0) return;

    idsToResolve.forEach((id) => pendingUserIdsRef.current.add(id));

    try {
      const users = await resolveUsersApi(idsToResolve);
      setUsersById((prev) => {
        const next = { ...prev };
        for (const u of users) {
          next[u.id] = u;
        }
        return next;
      });
    } catch (e) {
      console.error('Failed to resolve users:', e);
    } finally {
      idsToResolve.forEach((id) => pendingUserIdsRef.current.delete(id));
    }
  }, []);

  useEffect(() => {
    if (!entities || entities.length === 0) return;
    const userIds: string[] = [];
    for (const entity of entities) {
      const assigneeId = entity.properties?.assigneeId;
      if (typeof assigneeId === 'string' && assigneeId.trim()) {
        userIds.push(assigneeId.trim());
      }
    }
    if (userIds.length > 0) {
      resolveUsers(userIds);
    }
  }, [entities, resolveUsers]);

  return { usersById, resolveUsers };
};
