import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectManifest } from '../types';
import { parseProjectManifest } from '../utils/manifestValidation';
import { useWorkspaceManifestHandlers } from './useWorkspaceManifestHandlers';

/**
 * REQ-322: deleting a field waits on a type-the-name confirmation, so the handler
 * resumes with a `manifest` prop that a previous delete may already have superseded.
 * Writing that stale copy back put the previously deleted field straight back.
 */

const manifestWith = (props: string[]): ProjectManifest =>
  parseProjectManifest({
    name: 'M',
    entities: [
      {
        id: 'task',
        name: 'Task',
        namePlural: 'Tasks',
        properties: props.map((name) => ({ name, type: 'text', visible: true })),
      },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table', entityId: 'task', visibleProperties: props },
    ],
    defaultView: 'table',
  });

const taskProps = (m: ProjectManifest) =>
  m.entities.find((e) => e.id === 'task')!.properties.map((p) => p.name);

describe('useWorkspaceManifestHandlers', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handlers: ReturnType<typeof useWorkspaceManifestHandlers> | null = null;

  const updateSchema = vi.fn();
  const updateManifest = vi.fn();
  const dialog = { alert: vi.fn().mockResolvedValue(undefined) };

  function Harness({ manifest }: { manifest: ProjectManifest }) {
    handlers = useWorkspaceManifestHandlers({
      manifest,
      currentEntityId: 'task',
      currentViewId: 'table',
      updateSchema,
      updateManifest,
      dialog,
    });
    return null;
  }

  const render = (manifest: ProjectManifest) => {
    act(() => {
      root.render(<Harness manifest={manifest} />);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('deletes against the newest manifest, not the one captured at render time', async () => {
    const before = manifestWith(['title', 'link', 'assigneeId']);
    render(before);
    const staleHandlers = handlers!;

    // A first delete already landed and the component re-rendered with the result,
    // but `staleHandlers` still closes over the pre-delete manifest.
    render(manifestWith(['title', 'assigneeId']));

    await act(async () => {
      await staleHandlers.handleRemovePropertyDefinition('assigneeId');
    });

    expect(dialog.alert).not.toHaveBeenCalled();
    expect(updateSchema).toHaveBeenCalledTimes(1);
    expect(taskProps(updateSchema.mock.calls[0][0] as ProjectManifest)).toEqual(['title']);
  });

  it('passes a rebuild that replays the deletion onto a newer server manifest', async () => {
    render(manifestWith(['title', 'assigneeId']));

    await act(async () => {
      await handlers!.handleRemovePropertyDefinition('assigneeId');
    });

    const opts = updateSchema.mock.calls[0][1] as {
      rebuild: (m: ProjectManifest) => ProjectManifest;
      onError: (e: unknown) => void;
    };
    expect(taskProps(opts.rebuild(manifestWith(['title', 'link', 'assigneeId'])))).toEqual([
      'title',
      'link',
    ]);
    // Idempotent: the server may already have it removed.
    expect(taskProps(opts.rebuild(manifestWith(['title'])))).toEqual(['title']);

    opts.onError(new Error('boom'));
    expect(dialog.alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to Remove Field', message: 'boom' })
    );
  });

  it('refuses to delete taskKey', async () => {
    render(manifestWith(['taskKey', 'title']));

    await act(async () => {
      await handlers!.handleRemovePropertyDefinition('taskKey');
    });

    expect(updateSchema).not.toHaveBeenCalled();
    expect(dialog.alert).toHaveBeenCalled();
  });
});
