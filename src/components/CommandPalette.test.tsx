import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { CommandPalette } from './CommandPalette';
import { searchApi } from '../api/search';

vi.mock('../api/search', () => ({
  searchApi: vi.fn().mockResolvedValue([]),
}));

describe('CommandPalette', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    // Ensure timer mode doesn't leak into other tests.
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('defaults to global search on direct input', async () => {
    vi.clearAllMocks();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommandPalette
          isOpen={true}
          onClose={() => {}}
          onAICommand={() => {}}
          onCreateEntity={() => {}}
          activeProjectId="p1"
          activeProjectKey="PRJ"
          projectKeyById={new Map([['p1', 'PRJ']])}
          onSelectResult={() => {}}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'hello');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(searchApi).toHaveBeenCalledWith({
      query: 'hello',
      scope: 'global',
      projectId: undefined,
      types: ['task', 'page'],
      limit: 10,
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('uses project scope when project token is present', async () => {
    vi.clearAllMocks();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommandPalette
          isOpen={true}
          onClose={() => {}}
          onAICommand={() => {}}
          onCreateEntity={() => {}}
          activeProjectId="p1"
          activeProjectKey="PRJ"
          projectKeyById={new Map([['p1', 'PRJ']])}
          onSelectResult={() => {}}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'project:PRJ hello');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(searchApi).toHaveBeenCalledWith({
      query: 'hello',
      scope: 'project',
      projectId: 'p1',
      types: ['task', 'page'],
      limit: 10,
    });

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('calls onClose when backdrop is clicked (mousedown and mouseup both on backdrop)', async () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommandPalette
          isOpen={true}
          onClose={onClose}
          onAICommand={() => {}}
          onCreateEntity={() => {}}
          activeProjectId="p1"
          activeProjectKey="PRJ"
          projectKeyById={new Map([['p1', 'PRJ']])}
          onSelectResult={() => {}}
        />
      );
    });

    const backdrop = container.querySelector('[data-testid="command-palette-backdrop"]');
    expect(backdrop).not.toBeNull();

    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not close when drag-select ends on backdrop (mousedown inside input, mouseup on backdrop)', async () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CommandPalette
          isOpen={true}
          onClose={onClose}
          onAICommand={() => {}}
          onCreateEntity={() => {}}
          activeProjectId="p1"
          activeProjectKey="PRJ"
          projectKeyById={new Map([['p1', 'PRJ']])}
          onSelectResult={() => {}}
        />
      );
    });

    const backdrop = container.querySelector('[data-testid="command-palette-backdrop"]');
    const input = container.querySelector('input');
    expect(backdrop).not.toBeNull();
    expect(input).not.toBeNull();

    act(() => {
      input?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
