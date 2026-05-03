import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectOverflowMenu } from './ProjectOverflowMenu';

describe('ProjectOverflowMenu', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('invokes onAddProject from menu', () => {
    const onAdd = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<ProjectOverflowMenu onAddProject={onAdd} menuButtonTestId="pom-test" />);
    });

    const trigger = container.querySelector('[data-testid="pom-test"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Project')
    );
    expect(addBtn).not.toBeUndefined();

    act(() => {
      addBtn?.click();
    });

    expect(onAdd).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('anchors dropdown with left-0 when dropdownPanelAlign is start', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ProjectOverflowMenu
          onAddProject={() => {}}
          menuButtonTestId="pom-align-test"
          dropdownPanelAlign="start"
        />
      );
    });

    const trigger = container.querySelector('[data-testid="pom-align-test"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const panel = container.querySelector('.absolute.left-0');
    expect(panel).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
