import { useMemo, useRef, useEffect, useCallback } from 'react';
import { isBackendEnabled } from '../../utils/storage';
import { fetchProjectKeyAvailability, fetchProjectKeySuggestion } from '../../api/projects';
import { normalizeProjectKey, isValidProjectKey } from './sidebarUtils';

export function useProjectKeySuggestion(
  projects: { projectKey?: string | null }[],
  newProjectOpen: boolean,
  newProjectName: string,
  newProjectKey: string,
  keyManuallyEdited: boolean,
  setNewProjectKey: (key: string) => void,
  setKeyAvailability: (a: 'unknown' | 'available' | 'taken') => void,
  setKeyAvailabilityChecking: (v: boolean) => void
) {
  const usedKeys = useMemo(() => {
    return new Set(
      projects
        .map((p) => (p.projectKey ?? '').trim().toUpperCase())
        .filter(Boolean)
    );
  }, [projects]);

  const suggestProjectKeyLocal = useCallback((projectName: string) => {
    const base = normalizeProjectKey(projectName).replace(/[^A-Z0-9]/g, '');
    const candidates: string[] = [];
    if (base.length >= 3) candidates.push(base.slice(0, 3));
    const letters = normalizeProjectKey(projectName).replace(/[^A-Z]/g, '');
    if (letters.length >= 1) {
      const padded = (letters.slice(0, 3) + 'XXX').slice(0, 3);
      candidates.push(padded);
    }
    candidates.push('NEW');
    for (const c of candidates) {
      const key = c.slice(0, 3);
      if (key.length === 3 && !usedKeys.has(key)) return key;
    }
    const prefix = candidates[0]?.slice(0, 1) || 'N';
    for (let i = 1; i < 1000; i++) {
      const suffix = String(i).padStart(2, '0');
      const key = (prefix + suffix).slice(0, 3);
      if (key.length === 3 && !usedKeys.has(key)) return key;
    }
    return '001';
  }, [usedKeys]);

  const suggestRequestRef = useRef(0);
  const suggestProjectKey = useCallback(async (projectName: string) => {
    const requestId = ++suggestRequestRef.current;
    const trimmed = projectName.trim();
    if (!trimmed) {
      setNewProjectKey('NEW');
      setKeyAvailability('unknown');
      return;
    }
    if (!isBackendEnabled()) {
      const localKey = suggestProjectKeyLocal(trimmed);
      setNewProjectKey(localKey);
      setKeyAvailability(usedKeys.has(normalizeProjectKey(localKey)) ? 'taken' : 'available');
      return;
    }
    try {
      const key = await fetchProjectKeySuggestion(trimmed);
      if (suggestRequestRef.current !== requestId) return;
      setNewProjectKey(key);
      setKeyAvailability('available');
    } catch {
      if (suggestRequestRef.current !== requestId) return;
      setNewProjectKey(suggestProjectKeyLocal(trimmed));
      setKeyAvailability('unknown');
    }
  }, [suggestProjectKeyLocal, usedKeys, setNewProjectKey, setKeyAvailability]);

  const availabilityRequestRef = useRef(0);
  useEffect(() => {
    if (!newProjectOpen) return;
    const key = normalizeProjectKey(newProjectKey);
    if (!key || !isValidProjectKey(key)) {
      setKeyAvailability('unknown');
      return;
    }
    if (!isBackendEnabled()) {
      setKeyAvailability(usedKeys.has(key) ? 'taken' : 'available');
      return;
    }
    const requestId = ++availabilityRequestRef.current;
    setKeyAvailabilityChecking(true);
    fetchProjectKeyAvailability(key)
      .then((available) => {
        if (availabilityRequestRef.current !== requestId) return;
        setKeyAvailability(available ? 'available' : 'taken');
      })
      .catch(() => {
        if (availabilityRequestRef.current !== requestId) return;
        setKeyAvailability('unknown');
      })
      .finally(() => {
        if (availabilityRequestRef.current !== requestId) return;
        setKeyAvailabilityChecking(false);
      });
  }, [newProjectOpen, newProjectKey, usedKeys, setKeyAvailability, setKeyAvailabilityChecking]);

  useEffect(() => {
    if (!newProjectOpen || keyManuallyEdited) return;
    void suggestProjectKey(newProjectName);
  }, [newProjectOpen, newProjectName, keyManuallyEdited, suggestProjectKey]);

  return { suggestProjectKey, usedKeys };
}
