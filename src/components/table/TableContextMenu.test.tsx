import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { Entity } from '../../types';
import { TableContextMenu } from './TableContextMenu';

const entity: Entity = {
  id: 't1',
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: { taskKey: 'AAA-1', title: 'A' },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(props: Partial<React.ComponentProps<typeof TableContextMenu>>) {
  await act(async () => {
    root.render(
      <TableContextMenu
        anchor={{ x: 10, y: 10 }}
        entity={entity}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
        onCopyTaskKey={vi.fn()}
        onCopyDetailUrl={vi.fn()}
        {...props}
      />
    );
  });
}

function moveItem(): HTMLElement | null {
  return document.body.querySelector('[data-testid="table-context-move-to-project"]');
}

describe('TableContextMenu', () => {
  it('omits Move to project when no handler is wired up', async () => {
    await render({});
    expect(moveItem()).toBeNull();
  });

  it('names the single task it would move', async () => {
    await render({ onMoveToProject: vi.fn(), moveTargetCount: 1 });
    expect(moveItem()?.textContent).toBe('Move to project…');
  });

  it('shows the count when the cell selection covers several rows', async () => {
    await render({ onMoveToProject: vi.fn(), moveTargetCount: 3 });
    expect(moveItem()?.textContent).toBe('Move to project… (3 tasks)');
  });

  it('triggers the move handler when clicked', async () => {
    const onMoveToProject = vi.fn();
    await render({ onMoveToProject, moveTargetCount: 1 });
    await act(async () => {
      moveItem()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onMoveToProject).toHaveBeenCalled();
  });
});
