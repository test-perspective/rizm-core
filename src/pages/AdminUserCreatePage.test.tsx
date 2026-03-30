import React from 'react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AdminUserCreatePage } from './AdminUserCreatePage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

const mockApiJson = vi.fn();

vi.mock('../auth/api', () => ({
  apiJson: (...args: unknown[]) => mockApiJson(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../utils/storage', () => ({
  getBackendUrl: () => 'http://test.example',
  isBackendEnabled: () => true,
}));

const userRow = (email: string, role: string) => ({
  id: `id-${email}`,
  email,
  role,
  isDisabled: false,
  createdAt: 0,
  updatedAt: 0,
  lastLoginAt: null,
});

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderInDocument() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<AdminUserCreatePage />);
  });
  return { container, root };
}

describe('AdminUserCreatePage', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/admin/users' && (!init || (init as { method?: string }).method !== 'POST')) {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error('unexpected api call'));
    });
  });

  it('default role is editor', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await Promise.resolve();
    });
    const roleSelect = container.querySelector('[data-testid="admin-create-role-select"]') as HTMLSelectElement;
    expect(roleSelect).toBeTruthy();
    expect(roleSelect?.value).toBe('editor');
  });

  it('shows "This user already exists" and disables Create when email exists', async () => {
    mockApiJson.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/admin/users' && (!init || (init as { method?: string }).method !== 'POST')) {
        return Promise.resolve([userRow('existing@example.local', 'editor')]);
      }
      return Promise.reject(new Error('unexpected api call'));
    });

    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const emailInput = container.querySelector('[data-testid="admin-create-email-input"]') as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    await act(async () => {
      setInputValue(emailInput, 'existing@example.local');
    });

    const emailExistsEl = container.querySelector('[data-testid="admin-create-email-exists"]');
    expect(emailExistsEl).toBeTruthy();
    expect(emailExistsEl?.textContent).toContain('This user already exists');

    const submitBtn = container.querySelector('[data-testid="admin-create-submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(true);
  });

  it('shows success banner after create (with initial password, no temp pw)', async () => {
    const createdUser = userRow('newuser@example.local', 'editor');
    mockApiJson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        user: createdUser,
        tempPassword: null,
      });

    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const emailInput = container.querySelector('[data-testid="admin-create-email-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, 'newuser@example.local');
    });

    const submitBtn = container.querySelector('[data-testid="admin-create-submit"]') as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    await act(async () => {
      submitBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const successEl = container.querySelector('[data-testid="admin-create-success"]');
    expect(successEl).toBeTruthy();
    expect(successEl?.textContent).toContain('User created successfully');
  });

  it('disables Create after success (same email, prevents double submit)', async () => {
    const createdUser = userRow('double@example.local', 'editor');
    mockApiJson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        user: createdUser,
        tempPassword: null,
      });

    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const emailInput = container.querySelector('[data-testid="admin-create-email-input"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(emailInput, 'double@example.local');
    });

    const submitBtn = container.querySelector('[data-testid="admin-create-submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const submitBtnAfter = container.querySelector('[data-testid="admin-create-submit"]') as HTMLButtonElement;
    expect(submitBtnAfter.disabled).toBe(true);
    expect(mockApiJson).toHaveBeenCalledTimes(2);
  });
});
