import React from 'react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AdminUsersPage } from './AdminUsersPage';

const mockApiJson = vi.fn();
const mockApiFetch = vi.fn();
const confirmMock = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../auth/api', () => ({
  apiJson: (...args: unknown[]) => mockApiJson(...args),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../components/dialogs', () => ({
  useAppDialog: () => ({
    confirm: confirmMock,
    prompt: vi.fn(),
    alert: vi.fn(),
  }),
}));

const userRow = {
  id: 'u-1',
  email: 'editor@example.local',
  role: 'editor' as const,
  isDisabled: false,
  createdAt: 0,
  updatedAt: 0,
  lastLoginAt: null,
};

function renderInDocument() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<AdminUsersPage />);
  });
  return { container, root };
}

describe('AdminUsersPage', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockResolvedValue([userRow]);
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    });
    confirmMock.mockResolvedValue(false);
  });

  it('does not call delete API when delete confirmation is canceled', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete'
    ) as HTMLButtonElement | undefined;
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.click();
      await Promise.resolve();
    });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('calls delete API and reloads users when confirmed', async () => {
    confirmMock.mockResolvedValue(true);
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete'
    ) as HTMLButtonElement | undefined;
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/admin/users/u-1', { method: 'DELETE' });
    expect(mockApiJson).toHaveBeenCalledTimes(2);
  });
});

