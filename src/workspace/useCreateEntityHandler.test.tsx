import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';
import { ORDER_KEY } from '../components/board/boardOrder';
import {
  resolveTitleLikeProperty,
  useCreateEntityHandler,
  type CreateEntityOptions,
} from './useCreateEntityHandler';

const statusProp: PropertyDefinition = {
  name: 'status',
  type: 'select',
  options: ['Todo', 'In Progress', 'Done'],
};

const titleProp: PropertyDefinition = {
  name: 'title',
  type: 'text',
};

const boardView: ViewConfig = {
  id: 'board',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
};

function taskEntity(id: string, status: string, order?: number): Entity {
  return {
    id,
    entityId: 'task',
    createdAt: 1000,
    updatedAt: 1000,
    properties: {
      title: `Task ${id}`,
      status,
      ...(order !== undefined ? { [ORDER_KEY]: order } : {}),
    },
  };
}

const navigate = vi.fn();
const addEntity = vi.fn((entityTypeId: string, properties: Record<string, unknown>) => ({
  id: 'new-entity-id',
  entityId: entityTypeId,
  createdAt: 2000,
  updatedAt: 2000,
  properties,
}));

type HarnessProps = {
  options?: CreateEntityOptions;
  titleLikeProperty?: string;
  entityProperties?: PropertyDefinition[];
};

function CreateEntityHarness({
  options,
  titleLikeProperty,
  entityProperties = [statusProp, titleProp],
}: HarnessProps) {
  const { handleCreateEntity } = useCreateEntityHandler({
    currentView: boardView,
    currentEntity: {
      id: 'task',
      properties: entityProperties,
      titleLikeProperty,
    },
    currentEntities: [taskEntity('1', 'In Progress', 2000)],
    activeProjectId: 'proj-1',
    effectiveViewId: 'board',
    buildPath: ({ projectId, viewId, entityId }) =>
      `/p/${projectId}/v/${viewId}${entityId ? `/e/${entityId}` : ''}`,
    navigate,
    addEntity,
  });

  return (
    <button
      type="button"
      data-testid="run-create"
      onClick={() => {
        (globalThis as { __lastCreateResult?: Entity }).__lastCreateResult = handleCreateEntity(options);
      }}
    />
  );
}

describe('resolveTitleLikeProperty', () => {
  it('prefers explicit titleLikeProperty from entity definition', () => {
    expect(
      resolveTitleLikeProperty({
        titleLikeProperty: 'name',
        properties: [titleProp, { name: 'name', type: 'text' }],
      })
    ).toBe('name');
  });

  it('falls back to title property when titleLikeProperty is not set', () => {
    expect(resolveTitleLikeProperty({ properties: [titleProp] })).toBe('title');
  });
});

describe('useCreateEntityHandler', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    navigate.mockClear();
    addEntity.mockClear();
    delete (globalThis as { __lastCreateResult?: Entity }).__lastCreateResult;
  });

  function renderHarness(props: HarnessProps = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<CreateEntityHarness {...props} />);
    });
    return { container, root };
  }

  async function runCreate(container: HTMLElement) {
    const button = container.querySelector('[data-testid="run-create"]') as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    return (globalThis as { __lastCreateResult?: Entity }).__lastCreateResult;
  }

  it('creates entity with title, lane, and bottom order without opening detail panel', async () => {
    const { container, root } = renderHarness({
      options: { groupByValue: 'In Progress', title: 'Inline task', openDetail: false },
    });

    const result = await runCreate(container);

    expect(addEntity).toHaveBeenCalledWith('task', {
      title: 'Inline task',
      status: 'In Progress',
      [ORDER_KEY]: 3000,
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(result?.properties.title).toBe('Inline task');
    expect(result?.properties.status).toBe('In Progress');
    expect(result?.properties[ORDER_KEY]).toBe(3000);

    act(() => root.unmount());
    container.remove();
  });

  it('navigates to detail panel by default after create', async () => {
    const { container, root } = renderHarness({ options: { groupByValue: 'Todo' } });

    await runCreate(container);

    expect(navigate).toHaveBeenCalledWith('/p/proj-1/v/board/e/new-entity-id', { replace: false });

    act(() => root.unmount());
    container.remove();
  });

  it('writes title to titleLikeProperty when entity uses name', async () => {
    const nameProp: PropertyDefinition = { name: 'name', type: 'text' };
    const { container, root } = renderHarness({
      options: { groupByValue: 'Done', title: 'Named task', openDetail: false },
      titleLikeProperty: 'name',
      entityProperties: [statusProp, nameProp],
    });

    await runCreate(container);

    expect(addEntity).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({
        name: 'Named task',
        status: 'Done',
      })
    );

    act(() => root.unmount());
    container.remove();
  });
});
