import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { BoardDivider, Entity, PropertyDefinition, ViewConfig } from '../../types';
import { BoardColumn } from './BoardColumn';
import { ORDER_KEY } from './boardOrder';

// Keep this suite focused on the insert-slot logic: dnd-kit and the card/divider
// renderers are stubbed so no real drag machinery is needed.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

vi.mock('./BoardCard', () => ({
  SortableCard: ({ entity }: { entity: Entity }) => <div data-testid={`card-${entity.id}`} />,
}));

vi.mock('./BoardDivider', () => ({
  SortableDivider: ({ divider }: { divider: BoardDivider }) => (
    <div data-testid={`divider-${divider.id}`} />
  ),
}));

vi.mock('../dialogs', () => ({
  useAppDialog: () => ({ prompt: vi.fn() }),
}));

const COLUMN_ID = 'In Progress';

const entity = (id: string, order: number | null): Entity => ({
  id,
  entityId: 'task',
  createdAt: 1000,
  updatedAt: 1000,
  properties: order !== null ? { [ORDER_KEY]: order } : {},
});

const baseView: ViewConfig = {
  id: 'board',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
};

type RenderOverrides = {
  items?: string[];
  entityById?: Record<string, Entity>;
  view?: ViewConfig;
  boardDividers?: BoardDivider[];
  onEntityUpdate?: (entityId: string, patch: Record<string, unknown>) => void;
  onViewConfigUpdate?: (view: ViewConfig) => void;
  onInlineCreate?: (
    columnId: string,
    title: string,
    options?: { order?: number }
  ) => string | undefined;
  isDragActive?: boolean;
};

function renderColumn(overrides: RenderOverrides = {}) {
  const props = {
    columnId: COLUMN_ID,
    title: COLUMN_ID,
    count: 0,
    items: [] as string[],
    entityById: {} as Record<string, Entity>,
    visibleProps: [] as PropertyDefinition[],
    onEntityClick: vi.fn(),
    onEntityUpdate: vi.fn(),
    view: baseView,
    projectId: 'p1',
    scmIntegrationEnabled: false,
    ...overrides,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<BoardColumn {...props} />);
  });
  return { container, root, props };
}

const slot = (container: HTMLElement, index: number) =>
  container.querySelector(`[data-testid="board-insert-slot-${COLUMN_ID}-${index}"]`) as
    | HTMLButtonElement
    | null;

const input = (container: HTMLElement) =>
  container.querySelector(
    `[data-testid="board-inline-create-input-${COLUMN_ID}"]`
  ) as HTMLTextAreaElement | null;

async function submit(container: HTMLElement, title: string) {
  const el = input(container)!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, title);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
}

describe('BoardColumn insert slots', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one slot before each item and none after the last', () => {
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      onInlineCreate: vi.fn(),
    });

    expect(slot(container, 0)).not.toBeNull();
    expect(slot(container, 1)).not.toBeNull();
    expect(slot(container, 2)).toBeNull();
    // The lane bottom is still covered by the existing + Create button.
    expect(
      container.querySelector(`[data-testid="board-lane-create-${COLUMN_ID}"]`)
    ).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('does not render slots without onInlineCreate or while dragging', () => {
    const noHandler = renderColumn({
      items: ['e1'],
      entityById: { e1: entity('e1', 1000) },
    });
    expect(slot(noHandler.container, 0)).toBeNull();
    act(() => noHandler.root.unmount());
    noHandler.container.remove();

    const dragging = renderColumn({
      items: ['e1'],
      entityById: { e1: entity('e1', 1000) },
      onInlineCreate: vi.fn(),
      isDragActive: true,
    });
    expect(slot(dragging.container, 0)).toBeNull();
    act(() => dragging.root.unmount());
    dragging.container.remove();
  });

  it('opens the inline input in place of the clicked slot', async () => {
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      onInlineCreate: vi.fn(),
    });

    await act(async () => {
      slot(container, 1)!.click();
    });

    expect(input(container)).not.toBeNull();
    // The input replaced slot 1, i.e. it sits between the two cards.
    expect(slot(container, 1)).toBeNull();
    const card1 = container.querySelector(`[data-testid="card-e1"]`)!;
    const card2 = container.querySelector(`[data-testid="card-e2"]`)!;
    const created = container.querySelector(`[data-testid="board-inline-create-${COLUMN_ID}"]`)!;
    expect(card1.compareDocumentPosition(created) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(created.compareDocumentPosition(card2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });

  it('creates with the midpoint order when both neighbours are ordered', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const onEntityUpdate = vi.fn();
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      onInlineCreate,
      onEntityUpdate,
    });

    await act(async () => {
      slot(container, 1)!.click();
    });
    await submit(container, 'Between');

    expect(onInlineCreate).toHaveBeenCalledWith(COLUMN_ID, 'Between', { order: 2000 });
    expect(onEntityUpdate).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('creates before the first card when the top slot is used', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', 2000), e2: entity('e2', 3000) },
      onInlineCreate,
    });

    await act(async () => {
      slot(container, 0)!.click();
    });
    await submit(container, 'First');

    expect(onInlineCreate).toHaveBeenCalledWith(COLUMN_ID, 'First', { order: 1000 });

    act(() => root.unmount());
    container.remove();
  });

  it('reindexes the lane when a neighbour has no order yet', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const onEntityUpdate = vi.fn();
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', null), e2: entity('e2', 3000) },
      onInlineCreate,
      onEntityUpdate,
    });

    await act(async () => {
      slot(container, 1)!.click();
    });
    await submit(container, 'Needs reindex');

    expect(onEntityUpdate.mock.calls).toEqual([
      ['e1', { [ORDER_KEY]: 0 }],
      ['e2', { [ORDER_KEY]: 2000 }],
    ]);
    expect(onInlineCreate).toHaveBeenCalledWith(COLUMN_ID, 'Needs reindex', { order: 1000 });

    act(() => root.unmount());
    container.remove();
  });

  it('keeps the input open on the next slot for consecutive creates', async () => {
    const onInlineCreate = vi.fn(() => 'new-1');
    const { container, root } = renderColumn({
      items: ['e1', 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      onInlineCreate,
    });

    await act(async () => {
      slot(container, 0)!.click();
    });
    await submit(container, 'First');

    // Slot 0 is free again and the input moved down to slot 1 with an empty value.
    expect(slot(container, 0)).not.toBeNull();
    expect(slot(container, 1)).toBeNull();
    expect(input(container)?.value).toBe('');

    act(() => root.unmount());
    container.remove();
  });

  it('re-anchors a section divider when inserting directly above it', async () => {
    const dividerId = 'divider::d1';
    const boardDividers: BoardDivider[] = [
      { id: dividerId, title: 'Section', columnId: COLUMN_ID, afterId: 'e1' },
    ];
    const onViewConfigUpdate = vi.fn();
    const { container, root } = renderColumn({
      items: ['e1', dividerId, 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      view: { ...baseView, boardDividers },
      boardDividers,
      onInlineCreate: vi.fn(() => 'new-1'),
      onViewConfigUpdate,
    });

    // Slot 1 sits between the card e1 and the divider, i.e. still inside the first section.
    await act(async () => {
      slot(container, 1)!.click();
    });
    await submit(container, 'Above the divider');

    expect(onViewConfigUpdate).toHaveBeenCalledTimes(1);
    const nextView = onViewConfigUpdate.mock.calls[0][0] as ViewConfig;
    expect(nextView.boardDividers).toEqual([
      { id: dividerId, title: 'Section', columnId: COLUMN_ID, afterId: 'new-1', sort: 0 },
    ]);

    act(() => root.unmount());
    container.remove();
  });

  it('leaves divider anchors alone when inserting below one', async () => {
    const dividerId = 'divider::d1';
    const boardDividers: BoardDivider[] = [
      { id: dividerId, title: 'Section', columnId: COLUMN_ID, afterId: 'e1' },
    ];
    const onViewConfigUpdate = vi.fn();
    const { container, root } = renderColumn({
      items: ['e1', dividerId, 'e2'],
      entityById: { e1: entity('e1', 1000), e2: entity('e2', 3000) },
      view: { ...baseView, boardDividers },
      boardDividers,
      onInlineCreate: vi.fn(() => 'new-1'),
      onViewConfigUpdate,
    });

    // Slot 2 sits between the divider and e2, i.e. the second section.
    await act(async () => {
      slot(container, 2)!.click();
    });
    await submit(container, 'Below the divider');

    const nextView = onViewConfigUpdate.mock.calls[0][0] as ViewConfig;
    expect(nextView.boardDividers).toEqual([
      { id: dividerId, title: 'Section', columnId: COLUMN_ID, afterId: 'e1', sort: 0 },
    ]);

    act(() => root.unmount());
    container.remove();
  });
});
