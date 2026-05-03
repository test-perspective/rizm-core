import { vi } from 'vitest';

export const baseProject = {
  id: 'p1',
  name: 'My Project',
  projectKey: 'MP',
  createdAt: 1,
  updatedAt: 2,
  entities: [],
  config: {
    manifest: {
      name: 'My Project',
      entities: [],
      views: [],
      defaultView: 'board',
    },
  },
};

export const baseProjectMeta = {
  id: 'p1',
  name: 'My Project',
  projectKey: 'MP',
  createdAt: 1,
  updatedAt: 2,
};

export function makeDefaultDialogApi() {
  return {
    confirm: vi.fn().mockResolvedValue(false),
    alert: vi.fn(),
    prompt: vi.fn().mockResolvedValue(null as string | null),
  };
}
