import { useCallback } from 'react';
import type { Entity, Project, ProjectManifest, ViewConfig } from '../types';
import type { AppDialogAPI } from '../components/dialogs/types';
import { waitForManifestPutQueueDrain } from '../hooks/useKeel/manifestPutQueue';
import {
  finalizeSelectOptionRenameInManifest,
  prepareSelectOptionRenameInManifest,
} from '../utils/renameSelectOption';

type RefreshActiveProject = (opts?: { bypassProjectRefreshBlock?: boolean }) => Promise<Project | null>;

export type UseRenameBoardColumnInput = {
  manifest: ProjectManifest | null;
  currentView: ViewConfig | null | undefined;
  entities: Entity[];
  activeProjectId: string;
  updateSchema: (next: ProjectManifest) => void;
  modifyEntity: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  setProjectRefreshBlocked: (v: boolean) => void;
  refreshActiveProject: RefreshActiveProject;
  dialog: AppDialogAPI;
  setBoardColumnRenameBusy: (v: boolean) => void;
};

export function useRenameBoardColumn(input: UseRenameBoardColumnInput) {
  const {
    manifest,
    currentView,
    entities,
    activeProjectId,
    updateSchema,
    modifyEntity,
    setProjectRefreshBlocked,
    refreshActiveProject,
    dialog,
    setBoardColumnRenameBusy,
  } = input;

  return useCallback(
    async (from: string, to: string) => {
      if (!manifest || !currentView || currentView.type !== 'board' || !currentView.groupBy) return;
      const entityTypeId = currentView.entityId;
      const propName = currentView.groupBy;
      const fromT = from.trim();
      const toT = to.trim();
      if (!fromT || !toT || fromT === toT) return;

      setProjectRefreshBlocked(true);
      let prepared: ProjectManifest;
      try {
        try {
          prepared = prepareSelectOptionRenameInManifest(manifest, entityTypeId, propName, fromT, toT);
        } catch (e) {
          console.error('Board column rename (prepare):', e);
          await dialog.alert({
            title: 'Cannot rename column',
            message: e instanceof Error ? e.message : 'Unknown error',
          });
          return;
        }

        setBoardColumnRenameBusy(true);
        updateSchema(prepared);
        await waitForManifestPutQueueDrain(activeProjectId);

        const idsToMigrate = entities
          .filter((e) => e.entityId === entityTypeId && e.properties?.[propName] === fromT)
          .map((e) => e.id);

        for (const id of idsToMigrate) {
          const ok = await modifyEntity(id, { [propName]: toT });
          if (!ok) {
            console.error('Board column rename: entity migration failed', id);
            await dialog.alert({
              title: 'Rename incomplete',
              message: 'Some tasks could not be updated. Try again after refresh.',
            });
            return;
          }
        }

        // Entity PATCH can advance the server's manifest ETag even when manifest JSON is unchanged.
        // Finalize PUT must use the current ETag and a manifest derived from the latest server state.
        const syncedProject = await refreshActiveProject({ bypassProjectRefreshBlock: true });
        if (!syncedProject) {
          await dialog.alert({
            title: 'Rename failed',
            message: 'Could not sync project before finalizing the column rename.',
          });
          return;
        }

        const finalized = finalizeSelectOptionRenameInManifest(
          syncedProject.config.manifest,
          entityTypeId,
          propName,
          fromT,
          toT
        );
        updateSchema(finalized);
        await waitForManifestPutQueueDrain(activeProjectId);
      } catch (e) {
        console.error('Board column rename:', e);
        await dialog.alert({
          title: 'Rename failed',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      } finally {
        setProjectRefreshBlocked(false);
        await refreshActiveProject({ bypassProjectRefreshBlock: true }).catch((e) =>
          console.error('Failed to refresh project after column rename:', e)
        );
        setBoardColumnRenameBusy(false);
      }
    },
    [
      manifest,
      currentView,
      entities,
      activeProjectId,
      updateSchema,
      modifyEntity,
      setProjectRefreshBlocked,
      refreshActiveProject,
      dialog,
      setBoardColumnRenameBusy,
    ]
  );
}
