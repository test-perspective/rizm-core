import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmSettingsDialog } from './LlmSettingsDialog';
import { fetchOpenRouterModels } from '../../api/openrouter';
import type { LlmConfig } from '../../utils/aiTransform';

vi.mock('../../api/openrouter', () => ({
  fetchOpenRouterModels: vi.fn(),
}));

describe('LlmSettingsDialog', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  const baseConfig: LlmConfig = {
    provider: 'deepseek',
    model: undefined,
    deepseekApiKey: undefined,
    openrouterApiKey: undefined,
  };

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders nothing when open is false', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={false}
          onClose={() => {}}
          config={baseConfig}
          onSave={() => {}}
        />
      );
    });

    expect(container.querySelector('.fixed.inset-0')).toBeNull();
    root.unmount();
    container.remove();
  });

  it('renders provider select and Save when open', () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={() => {}}
          config={baseConfig}
          onSave={() => {}}
        />
      );
    });

    expect(container.textContent).toContain('LLM Settings');
    expect(container.textContent).toContain('Provider');
    expect(container.textContent).toContain('Save');
    expect(container.textContent).toContain('DeepSeek API Key');

    root.unmount();
    container.remove();
  });

  it('calls onSave with updated config when Save clicked', () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([]);

    const onSave = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={() => {}}
          config={{ ...baseConfig, provider: 'deepseek' }}
          onSave={onSave}
        />
      );
    });

    const deepseekInput = container.querySelector('input[placeholder="sk-..."]') as HTMLInputElement;
    expect(deepseekInput).toBeTruthy();
    act(() => {
      const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setNativeValue?.call(deepseekInput, 'sk-test-key');
      deepseekInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save');
    expect(saveButton).toBeTruthy();
    act(() => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        deepseekApiKey: 'sk-test-key',
      })
    );

    root.unmount();
    container.remove();
  });

  it('fetches Open Router models and shows Open Router fields when provider is openrouter', async () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={() => {}}
          config={{ ...baseConfig, provider: 'openrouter' }}
          onSave={() => {}}
        />
      );
    });

    expect(fetchOpenRouterModels).toHaveBeenCalled();
    expect(container.textContent).toContain('Open Router API Key');
    expect(container.textContent).toContain('Model');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const modelInput = container.querySelector('input[placeholder*="Search or select model"]');
    expect(modelInput).toBeTruthy();

    root.unmount();
    container.remove();
  });

  it('closes on backdrop click (mousedown and mouseup both on backdrop)', () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([]);

    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={onClose}
          config={baseConfig}
          onSave={() => {}}
        />
      );
    });

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();

    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });

  it('does not close when drag-select ends on backdrop (mousedown inside, mouseup on backdrop)', () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([]);

    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={onClose}
          config={baseConfig}
          onSave={() => {}}
        />
      );
    });

    const backdrop = container.querySelector('.fixed.inset-0');
    const innerContent = container.querySelector('.bg-zinc-900');
    const input = container.querySelector('input');
    expect(backdrop).toBeTruthy();
    expect(innerContent).toBeTruthy();
    expect(input).toBeTruthy();

    act(() => {
      input?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it('uses autocomplete hints to reduce browser password manager on DeepSeek fields (REQ-266)', () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={() => {}}
          config={{ ...baseConfig, provider: 'deepseek' }}
          onSave={() => {}}
        />
      );
    });

    const modelInput = container.querySelector('input[placeholder="deepseek-chat"]') as HTMLInputElement;
    const keyInput = container.querySelector('input[placeholder="sk-..."]') as HTMLInputElement;
    expect(modelInput?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(keyInput?.getAttribute('autocomplete')).toBe('new-password');

    root.unmount();
    container.remove();
  });

  it('uses autocomplete hints on Open Router model search and API key (REQ-266)', async () => {
    vi.mocked(fetchOpenRouterModels).mockResolvedValue([{ id: 'x/y', name: 'Y' }]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LlmSettingsDialog
          open={true}
          onClose={() => {}}
          config={{ ...baseConfig, provider: 'openrouter' }}
          onSave={() => {}}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const modelInput = container.querySelector('input[placeholder*="Search or select model"]') as HTMLInputElement;
    const keyInput = container.querySelector('input[placeholder="sk-or-..."]') as HTMLInputElement;
    expect(modelInput?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(keyInput?.getAttribute('autocomplete')).toBe('new-password');

    root.unmount();
    container.remove();
  });
});
