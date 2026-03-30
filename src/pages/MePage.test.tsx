import React from 'react';
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AppDialogProvider } from '../components/dialogs';
import { apiJson } from '../auth/api';
import { MePage } from './MePage';

const mockLogout = vi.fn();
const mockRefresh = vi.fn();

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      userId: 'u-1',
      email: 'admin@example.local',
      role: 'admin',
      lastLoginAt: Date.now(),
    },
    logout: mockLogout,
    refresh: mockRefresh,
  }),
}));

vi.mock('../auth/api', () => ({
  apiBaseUrl: () => 'http://localhost:8080',
  apiJson: vi.fn(async (path: string) => {
    if (path === '/api/instance-banner') {
      return { backgroundColor: '#1e40af', message: '' };
    }
    if (path === '/api/admin/system-info') {
      return {
        sqliteDbPath: '/tmp/x.sqlite3',
        sqliteDbFileSizeBytes: 0,
        attachments: {
          totalSizeBytes: 0,
          perProject: [] as {
            projectId: string;
            projectName: string;
            attachmentCount: number;
            totalSizeBytes: number;
          }[],
        },
        fastembedCache: { path: '/tmp/.fastembed_cache', sizeBytes: 0 },
      };
    }
    if (path === '/api/admin/db-backup/settings') {
      return {
        settings: {
          enabled: false,
          scheduledTime: '02:30',
          retentionDays: 7,
          lastRunDay: null as string | null,
        },
      };
    }
    if (path === '/api/admin/db-backup/snapshots') {
      return [];
    }
    if (path === '/api/me/mcp-api-key') {
      return { hasKey: false, lastUsedAt: null, updatedAt: null, revokedAt: null };
    }
    throw new Error(`unexpected apiJson path: ${path}`);
  }),
  apiFetch: vi.fn(),
}));

vi.mock('./me/AssistantDialog', () => ({
  AssistantDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="assistant-dialog">
        <span>AI Assistant Dialog</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

function renderInDocument() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <AppDialogProvider>
        <MePage />
      </AppDialogProvider>
    );
  });
  return { container, root };
}

describe('MePage', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Back to App link with icon in header', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const backLink = container.querySelector('a[href="/"]');
    expect(backLink).toBeTruthy();
    expect(backLink?.textContent).toContain('Back to App');
  });

  it('renders AI Assistant button in header', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const assistantBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'AI Assistant'
    );
    expect(assistantBtn).toBeTruthy();
  });

  it('opens AI Assistant dialog when button is clicked', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const assistantBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'AI Assistant'
    ) as HTMLButtonElement;
    expect(assistantBtn).toBeTruthy();

    await act(async () => {
      assistantBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.querySelector('[data-testid="assistant-dialog"]')).toBeTruthy();
    expect(container.textContent).toContain('AI Assistant Dialog');
  });

  it('renders Change Password button in Email/Role panel', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const changePwBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Change Password'
    );
    expect(changePwBtn).toBeTruthy();
  });

  it('opens Change Password dialog when button is clicked', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const changePwBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Change Password'
    ) as HTMLButtonElement;

    await act(async () => {
      changePwBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    const dialogs = container.querySelectorAll('h3');
    const changePwDialog = Array.from(dialogs).find((h) => h.textContent === 'Change Password');
    expect(changePwDialog).toBeTruthy();
  });

  it('renders Instance banner button for admin', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const bannerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Instance banner')
    );
    expect(bannerBtn).toBeTruthy();
  });

  it('renders DB snapshots button for admin', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('DB snapshots'));
    expect(btn).toBeTruthy();
  });

  it('opens DB snapshots dialog from admin section', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DB snapshots')
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('DB snapshots');
    expect(container.textContent).toContain('Scheduled backups store the SQLite database only');
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('DB snapshots restore panel shows sign-in reminder', async () => {
    const prev = vi.mocked(apiJson).getMockImplementation();
    vi.mocked(apiJson).mockImplementation(async (path: string) => {
      if (path === '/api/admin/db-backup/snapshots') {
        return [
          { fileName: 'manual-test.sqlite3', createdAtMs: 1700000000000, sizeBytes: 1024, kind: 'manual' },
        ];
      }
      return prev!(path);
    });
    try {
      const { container } = renderInDocument();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      const dbBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('DB snapshots')
      ) as HTMLButtonElement;
      await act(async () => {
        dbBtn.click();
        await new Promise((r) => setTimeout(r, 0));
      });
      const restoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Restore')
      ) as HTMLButtonElement;
      expect(restoreBtn).toBeTruthy();
      await act(async () => {
        restoreBtn.click();
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(container.textContent).toContain('land on the sign-in page');
    } finally {
      vi.mocked(apiJson).mockImplementation(prev!);
    }
  });

  it('opens Instance banner dialog from admin section', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const bannerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Instance banner')
    ) as HTMLButtonElement;
    expect(bannerBtn).toBeTruthy();
    await act(async () => {
      bannerBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('Background color');
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('renders MCP API Key button', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('MCP API Key');
  });

  it('opens MCP API Key dialog when button is clicked', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const mcpBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('MCP API Key')
    ) as HTMLButtonElement;

    await act(async () => {
      mcpBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    const dialogs = container.querySelectorAll('h3');
    const mcpDialog = Array.from(dialogs).find((h) => h.textContent === 'MCP API Key');
    expect(mcpDialog).toBeTruthy();
  });

  it('keeps Settings visible when dialog is opened and closed', async () => {
    const { container } = renderInDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('Settings');

    const assistantBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'AI Assistant'
    ) as HTMLButtonElement;
    await act(async () => {
      assistantBtn?.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('Settings');

    const closeBtn = container.querySelector('[data-testid="assistant-dialog"] button');
    if (closeBtn) {
      await act(async () => {
        (closeBtn as HTMLButtonElement).click();
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(container.textContent).toContain('Settings');
  });
});
