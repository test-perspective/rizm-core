import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity, PropertyDefinition } from '../types';
import { EntityDetailPanel } from './EntityDetailPanel';

const mockHandleClose = vi.fn();
const mockSetSchemaOpen = vi.fn();
let mockSchemaOpen = false;

vi.mock('./entityDetail/useEntityDetailPanelModel', () => ({
  useEntityDetailPanelModel: () => ({
    user: { id: 'u1', userId: 'u1', email: 'a@b.c', role: 'admin' },
    canEditSchema: true,
    canComment: true,
    canAttach: true,
    values: {},
    setValues: vi.fn(),
    setLastSavedValues: vi.fn(),
    valuesEntityId: 'e1',
    richtextResetToken: {},
    schemaOpen: mockSchemaOpen,
    setSchemaOpen: mockSetSchemaOpen,
    comments: [],
    editingCommentId: null,
    commentDraftById: {},
    commentDirtyById: {},
    handleAddComment: vi.fn(),
    handleEditComment: vi.fn(),
    handleCommentDraftChange: vi.fn(),
    handleSaveComment: vi.fn(),
    handleCancelEditComment: vi.fn(),
    handleDeleteComment: vi.fn(),
    handleNewCommentDraftChange: vi.fn(),
    handleChange: vi.fn(),
    commitDeferredProp: vi.fn(),
    handleClose: mockHandleClose,
    handleDelete: vi.fn(),
    panelTitle: 'TASK-1',
    isTask: true,
  }),
}));

vi.mock('./SchemaEditorDialog', () => ({
  SchemaEditorDialog: () => null,
}));

vi.mock('./entityDetail/attachments/AttachmentsSection', () => ({
  AttachmentsSection: () => null,
}));

vi.mock('./entityDetail/comments/CommentsSection', () => ({
  CommentsSection: () => null,
}));

vi.mock('./entityDetail/inputs/PropertyInput', () => ({
  PropertyInput: () => null,
}));

const baseEntity: Entity = {
  id: 'e1',
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: { taskKey: 'TASK-1', title: 'Test' },
};

const baseProps = {
  entity: baseEntity,
  projectId: 'p1',
  entityTypeId: 'task',
  viewId: 'v1',
  properties: [{ name: 'title', type: 'text', visible: true }] as PropertyDefinition[],
  entities: [],
  onClose: vi.fn(),
  onUpdate: vi.fn(),
  onServerEntity: vi.fn(),
  onDelete: vi.fn(),
  onAddPropertyDefinition: vi.fn(),
  onRemovePropertyDefinition: vi.fn(),
  onUpsertPropertyOption: vi.fn(),
};

describe('EntityDetailPanel', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSchemaOpen = false;
  });

  it('hides Edit Fields when allowSchemaEdit is false', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} allowSchemaEdit={false} />);
    });

    expect(container.querySelector('[data-testid="entity-detail-edit-fields"]')).toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows Edit Fields when allowSchemaEdit is true (default) and canEditSchema', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    expect(container.querySelector('[data-testid="entity-detail-edit-fields"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders a non-interactive left strip when backdropExcludeLeftPx is set (notes pane)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} backdropExcludeLeftPx={240} />);
    });

    const strip = container.querySelector('[aria-hidden="true"]') as HTMLElement | null;
    expect(strip).not.toBeNull();
    expect(strip?.className).toContain('pointer-events-none');
    expect(strip?.style.width).toBe('240px');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('calls onNavigateDetailPrev on ArrowLeft when provided', async () => {
    mockSchemaOpen = false;
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} onNavigateDetailPrev={onPrev} onNavigateDetailNext={onNext} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not navigate with ArrowLeft when focus is in an input', async () => {
    mockSchemaOpen = false;
    const onPrev = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <div>
          <input data-testid="focus-trap" />
          <EntityDetailPanel {...baseProps} onNavigateDetailPrev={onPrev} />
        </div>
      );
    });

    const input = container.querySelector('[data-testid="focus-trap"]') as HTMLInputElement;
    input.focus();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });

    expect(onPrev).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('calls handleClose on Escape when schema editor is closed', async () => {
    mockSchemaOpen = false;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(mockHandleClose).toHaveBeenCalledTimes(1);
    expect(mockSetSchemaOpen).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('calls setSchemaOpen(false) on Escape when schema editor is open, does not call handleClose', async () => {
    mockSchemaOpen = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(mockSetSchemaOpen).toHaveBeenCalledWith(false);
    expect(mockHandleClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders resize handle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    const handle = container.querySelector('[data-testid="entity-detail-resize-handle"]');
    expect(handle).toBeTruthy();
    expect(handle?.getAttribute('role')).toBe('separator');
    expect(handle?.getAttribute('aria-orientation')).toBe('vertical');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('updates panel width on mousedown + mousemove', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    const handle = container.querySelector('[data-testid="entity-detail-resize-handle"]');
    const panel = container.querySelector('[data-testid="entity-detail-panel"]') as HTMLElement;
    expect(handle).toBeTruthy();
    expect(panel).toBeTruthy();

    const initialWidth = panel?.style.width;

    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    });
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, bubbles: true }));
    });

    expect(panel.style.width).not.toBe(initialWidth);
    const w = parseInt(panel.style.width, 10);
    expect(w).toBe(722);

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('clamps panel width to MIN_WIDTH when dragging right', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EntityDetailPanel {...baseProps} />);
    });

    const handle = container.querySelector('[data-testid="entity-detail-resize-handle"]');
    const panel = container.querySelector('[data-testid="entity-detail-panel"]') as HTMLElement;

    await act(async () => {
      handle?.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true }));
    });
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, bubbles: true }));
    });

    const w = parseInt(panel.style.width, 10);
    expect(w).toBe(360);

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
