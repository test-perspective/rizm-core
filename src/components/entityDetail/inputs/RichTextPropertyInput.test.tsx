import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { PropertyDefinition } from '../../../types';
import { RichTextPropertyInput } from './RichTextPropertyInput';

vi.mock('../../RichTextEditor', () => ({
  RichTextEditor: () => <div data-testid="rich-text-editor-stub" />,
}));

const descriptionProp: PropertyDefinition = { name: 'description', type: 'richtext', visible: true };

describe('RichTextPropertyInput', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('REQ-236: starts expanded in read mode with toggle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextPropertyInput
          entityId="e1"
          prop={descriptionProp}
          value="[]"
          isValuesReady
          entities={[]}
          onChange={() => {}}
        />
      );
    });

    const toggle = container.querySelector('[data-testid="richtext-property-content-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="rich-text-editor-stub"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('REQ-236: toggle collapses body so editor is unmounted', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextPropertyInput
          entityId="e1"
          prop={descriptionProp}
          value="[]"
          isValuesReady
          entities={[]}
          onChange={() => {}}
        />
      );
    });

    const toggle = container.querySelector('[data-testid="richtext-property-content-toggle"]') as HTMLButtonElement;
    act(() => {
      toggle.click();
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="rich-text-editor-stub"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('REQ-236: resets to expanded when entityId changes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextPropertyInput
          entityId="e1"
          prop={descriptionProp}
          value="[]"
          isValuesReady
          entities={[]}
          onChange={() => {}}
        />
      );
    });

    let toggle = container.querySelector('[data-testid="richtext-property-content-toggle"]') as HTMLButtonElement;
    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      root.render(
        <RichTextPropertyInput
          entityId="e2"
          prop={descriptionProp}
          value="[]"
          isValuesReady
          entities={[]}
          onChange={() => {}}
        />
      );
    });

    toggle = container.querySelector('[data-testid="richtext-property-content-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="rich-text-editor-stub"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('REQ-236: edit mode hides collapse toggle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RichTextPropertyInput
          entityId="e1"
          prop={descriptionProp}
          value="[]"
          isValuesReady
          entities={[]}
          onChange={() => {}}
        />
      );
    });

    const body = container.querySelector('[data-testid="richtext-property-read-body"]') as HTMLElement | null;
    expect(body).not.toBeNull();
    act(() => {
      body?.click();
    });

    expect(container.querySelector('[data-testid="richtext-property-content-toggle"]')).toBeNull();
    expect(container.querySelector('[data-testid="rich-text-editor-stub"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
