import React from 'react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { InstanceBanner } from './InstanceBanner';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { userId: 'u1', email: 'a@b.c', role: 'viewer', lastLoginAt: null },
    loading: false,
    isAnonymous: false,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

const apiJson = vi.fn();
vi.mock('../auth/api', () => ({
  apiJson: (...args: unknown[]) => apiJson(...args),
}));

vi.mock('../utils/storage', () => ({
  isBackendEnabled: () => true,
}));

describe('InstanceBanner', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    apiJson.mockReset();
  });

  it('renders nothing when message is empty', async () => {
    apiJson.mockResolvedValue({ backgroundColor: '#1e40af', message: '   ' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<InstanceBanner />);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
    root.unmount();
    document.body.removeChild(container);
  });

  it('renders banner when message is non-empty', async () => {
    apiJson.mockResolvedValue({ backgroundColor: '#000000', message: 'Maintenance tonight' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<InstanceBanner />);
      await new Promise((r) => setTimeout(r, 0));
    });
    const bar = container.querySelector('[role="status"]');
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain('Maintenance tonight');
    root.unmount();
    document.body.removeChild(container);
  });
});
