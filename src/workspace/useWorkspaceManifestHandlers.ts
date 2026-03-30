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
  updateSchema: (manifest: ProjectManifest, opts?: { removeEntityProperty?: { entityId: string; propName: string } }) => void;
  updateManifest: (manifest: ProjectManifest, opts?: { source?: string }) => void;
  dialog: {
    alert: (opts: { title?: string; message: string }) => Promise<void>;
  };
}

export function useWorkspaceManifestHandlers({
  manifest,
  currentEntityId,
  currentViewId,
  updateSchema,
  updateManifest,
  dialog,
}: UseWorkspaceManifestHandlersOptions) {
  const handleAddPropertyDefinition = async (prop: PropertyDefinition) => {
    if (!manifest) return;
    try {
      const next = addPropertyToEntity(manifest, currentEntityId, currentViewId, prop);
      const validated = parseProjectManifest(next);
      updateSchema(validated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Failed to Add Field', message: msg });
    }
  };

  const handleRemovePropertyDefinition = async (propName: string) => {
    try {
      if (propName === 'taskKey') {
        await dialog.alert({ message: 'taskKey is a system-managed field and cannot be deleted.' });
        return;
      }
      if (!manifest) return;
      const next = removePropertyFromEntity(manifest, currentEntityId, propName);
      const validated = parseProjectManifest(next);
      updateSchema(validated, { removeEntityProperty: { entityId: currentEntityId, propName } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Failed to Remove Field', message: msg });
    }
  };

  const handleReorderProperties = async (orderedPropNames: string[]) => {
    if (!manifest) return;
    try {
      const next = reorderPropertiesInEntity(manifest, currentEntityId, orderedPropNames);
      const validated = parseProjectManifest(next);
      updateSchema(validated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Failed to Reorder Fields', message: msg });
    }
  };

  const handleUpsertPropertyOption = async (entityTypeId: string, propName: string, option: string) => {
    if (!manifest) return;
    try {
      const next = upsertPropertyOption(manifest, entityTypeId, propName, option);
      if (next !== manifest) {
        updateManifest(next, { source: 'labels' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dialog.alert({ title: 'Failed to Save Label', message: msg });
    }
  };

  return {
    handleAddPropertyDefinition,
    handleRemovePropertyDefinition,
    handleReorderProperties,
    handleUpsertPropertyOption,
  };
}
