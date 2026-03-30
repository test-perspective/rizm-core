import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as importApi from '../../api/import';
import { ImportWizard } from './ImportWizard';

vi.mock('../../api/import', () => ({
  createImportSession: vi.fn(),
  verifyImportConnection: vi.fn(),
  fetchImportMetadata: vi.fn(),
  fetchLastImportConfig: vi.fn(() => Promise.resolve({})),
  saveImportMapping: vi.fn(),
  startImport: vi.fn(),
  getImportJobStatus: vi.fn(),
}));

vi.mock('../../utils/storage', () => ({
  isBackendEnabled: vi.fn(() => true),
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function footerNextButton(): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('Next') && !b.textContent?.includes('Verify')
  ) as HTMLButtonElement | undefined;
}

describe('ImportWizard', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders provider step when open', async () => {
    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ImportWizard open={true} onClose={onClose} />);
    });

    expect(document.body.textContent).toContain('Import from Jira (Cloud)');
    expect(document.body.textContent).toContain('Provider');
    const nextBtn = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Next')
    );
    expect(nextBtn).toBeDefined();
  });

  it('does not render when closed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ImportWizard open={false} onClose={() => {}} />);
    });

    expect(document.body.textContent).not.toContain('Import from Jira (Cloud)');
  });

  it('disables metadata Next while project metadata fetch is in progress', async () => {
    const projA = { id: 'pa', key: 'A', name: 'Alpha' };
    const projB = { id: 'pb', key: 'B', name: 'Beta' };
    const fields = [{ id: 'summary', name: 'Summary', fieldType: 'string', custom: false }];
    const baseMeta = {
      provider: 'jira' as const,
      projects: [projA, projB],
      fields,
      statuses: [{ id: 'st1', name: 'Open' }],
    };

    let releaseB: (() => void) | undefined;

    vi.mocked(importApi.createImportSession).mockResolvedValue({ sessionId: 's1' });
    vi.mocked(importApi.verifyImportConnection).mockResolvedValue(undefined);
    vi.mocked(importApi.fetchImportMetadata).mockImplementation(async (_sid, key?: string) => {
      if (key == null || key === '') {
        return { ...baseMeta };
      }
      if (key === 'A') {
        return { ...baseMeta };
      }
      if (key === 'B') {
        await new Promise<void>((resolve) => {
          releaseB = resolve;
        });
        return { ...baseMeta, statuses: [{ id: 'st2', name: 'Closed' }] };
      }
      return { ...baseMeta };
    });

    const onClose = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ImportWizard open={true} onClose={onClose} />);
    });

    await act(async () => {
      footerNextButton()?.click();
    });

    const urlInput = document.querySelector('input[type="url"]') as HTMLInputElement;
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const tokenInput = document.querySelector('input[type="password"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(urlInput, 'https://x.atlassian.net');
      setInputValue(emailInput, 'u@example.com');
      setInputValue(tokenInput, 'token');
    });

    await act(async () => {
      const verifyBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Verify')
      );
      verifyBtn?.click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Select project to import');

    const projectSelect = document.body.querySelector('select') as HTMLSelectElement;
    expect(projectSelect).toBeTruthy();

    await act(async () => {
      projectSelect.value = projB.id;
      projectSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const nextWhileLoading = footerNextButton();
    expect(nextWhileLoading).toBeDefined();
    expect(nextWhileLoading?.disabled).toBe(true);
    expect(document.body.textContent).toContain('Loading project fields and statuses');
    expect(releaseB).toBeDefined();

    await act(async () => {
      releaseB!();
      await Promise.resolve();
    });

    const nextAfterLoad = footerNextButton();
    expect(nextAfterLoad?.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('Loading project fields and statuses');
  });
});
