import { useRef } from 'react';
import type { PropertyDefinition } from '../types';
import {
  addPropertyToEntity,
  removePropertyFromEntity,
  reorderPropertiesInEntity,
} from '../utils/manifestMutations';
import { parseProjectManifest } from '../utils/manifestValidation';
import { upsertPropertyOption } from '../utils/manifestLabelOptions';
import type { ProjectManifest } from '../types';

export interface UseWorkspaceManifestHandlersOptions {
  manifest: ProjectManifest | null;
  currentEntityId: string;
  currentViewId: string;
  updateSchema: (
    manifest: ProjectManifest,
    opts?: {
      removeEntityProperty?: { entityId: string; propName: string };
      rebuild?: (latest: ProjectManifest) => ProjectManifest;
      onError?: (error: unknown) => void;
    }
  ) => void;
  updateManifest: (
    manifest: ProjectManifest,
    opts?: { source?: string; rebuild?: (latest: ProjectManifest) => ProjectManifest }
  ) => void;
  dialog: {
    alert: (opts: { title?: string; message: string }) => Promise<void>;
  };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useWorkspaceManifestHandlers({
  manifest,
  currentEntityId,
  currentViewId,
  updateSchema,
  updateManifest,
  dialog,
}: UseWorkspaceManifestHandlersOptions) {
  // Deleting a field waits on a confirmation dialog, so by the time the handler
  // resumes, the `manifest` it closed over at render time can already be one edit
  // old. Basing the write on that stale copy silently undoes the previous edit, so
  // always read the newest manifest we hold (REQ-322).
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;

  /**
   * A schema change can lose a race with another manifest write and come back as a
   * 412. `rebuild` replays the same intent on whatever the server now holds, and
   * `onError` makes a write that still could not be saved visible instead of letting
   * the follow-up refresh silently undo it (REQ-322).
   */
  const reportFailure = (title: string) => (e: unknown) => {
    void dialog.alert({ title, message: errorMessage(e) });
  };

  const handleAddPropertyDefinition = async (prop: PropertyDefinition) => {
    const current = manifestRef.current;
    if (!current) return;
    try {
      const next = addPropertyToEntity(current, currentEntityId, currentViewId, prop);
      const validated = parseProjectManifest(next);
      updateSchema(validated, {
        rebuild: (latest) =>
          parseProjectManifest(
            addPropertyToEntity(latest, currentEntityId, currentViewId, prop, { existingOk: true })
          ),
        onError: reportFailure('Failed to Add Field'),
      });
    } catch (e) {
      await dialog.alert({ title: 'Failed to Add Field', message: errorMessage(e) });
    }
  };

  const handleRemovePropertyDefinition = async (propName: string) => {
    try {
      if (propName === 'taskKey') {
        await dialog.alert({ message: 'taskKey is a system-managed field and cannot be deleted.' });
        return;
      }
      const current = manifestRef.current;
      if (!current) return;
      const next = removePropertyFromEntity(current, currentEntityId, propName);
      const validated = parseProjectManifest(next);
      updateSchema(validated, {
        removeEntityProperty: { entityId: currentEntityId, propName },
        rebuild: (latest) =>
          parseProjectManifest(
            removePropertyFromEntity(latest, currentEntityId, propName, { missingOk: true })
          ),
        onError: reportFailure('Failed to Remove Field'),
      });
    } catch (e) {
      await dialog.alert({ title: 'Failed to Remove Field', message: errorMessage(e) });
    }
  };

  const handleReorderProperties = async (orderedPropNames: string[]) => {
    const current = manifestRef.current;
    if (!current) return;
    try {
      const next = reorderPropertiesInEntity(current, currentEntityId, orderedPropNames);
      const validated = parseProjectManifest(next);
      updateSchema(validated, {
        rebuild: (latest) => {
          // Someone else added or removed a property in the meantime: their change
          // matters more than this ordering, so leave the order alone.
          const current = latest.entities.find((e) => e.id === currentEntityId)?.properties ?? [];
          const sameSet =
            current.length === orderedPropNames.length &&
            current.every((p) => orderedPropNames.includes(p.name));
          if (!sameSet) return latest;
          return parseProjectManifest(
            reorderPropertiesInEntity(latest, currentEntityId, orderedPropNames)
          );
        },
        onError: reportFailure('Failed to Reorder Fields'),
      });
    } catch (e) {
      await dialog.alert({ title: 'Failed to Reorder Fields', message: errorMessage(e) });
    }
  };

  const handleUpsertPropertyOption = async (entityTypeId: string, propName: string, option: string) => {
    const current = manifestRef.current;
    if (!current) return;
    try {
      const next = upsertPropertyOption(current, entityTypeId, propName, option);
      if (next !== current) {
        updateManifest(next, {
          source: 'labels',
          // Add the option to the server's latest manifest rather than re-posting a
          // stale copy, which would put back properties someone just deleted.
          rebuild: (latest) => upsertPropertyOption(latest, entityTypeId, propName, option),
        });
      }
    } catch (e) {
      await dialog.alert({ title: 'Failed to Save Label', message: errorMessage(e) });
    }
  };

  return {
    handleAddPropertyDefinition,
    handleRemovePropertyDefinition,
    handleReorderProperties,
    handleUpsertPropertyOption,
  };
}
