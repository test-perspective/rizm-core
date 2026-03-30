import { describe, expect, test } from 'vitest';
import { buildBranchName, sanitizeBranchName, toScmPullRequestInfo } from './scm';

describe('scm', () => {
  test('builds branch name with prefix', () => {
    expect(buildBranchName('feature', 'PROJ-1', 'Add login')).toBe('feature/PROJ-1 Add login');
  });

  test('builds branch name without prefix', () => {
    expect(buildBranchName('none', 'PROJ-2', 'Fix bug')).toBe('PROJ-2 Fix bug');
  });

  test('sanitizes invalid characters while keeping spaces', () => {
    const raw = 'feature/PROJ-3 Add?login\\test..';
    const sanitized = sanitizeBranchName(raw);
    expect(sanitized).toBe('feature/PROJ-3 Add-login/test');
  });

  test('trims leading and trailing separators', () => {
    const raw = '/feature/PROJ-4 Title./';
    const sanitized = sanitizeBranchName(raw);
    expect(sanitized).toBe('feature/PROJ-4 Title');
  });

  test('maps pull request payload to scm info', () => {
    const info = toScmPullRequestInfo('bitbucket', { workspace: 'acme', repoSlug: 'demo' }, {
      id: '42',
      title: 'PROJ-9 Add feature',
      url: 'https://bitbucket.org/acme/demo/pull-requests/42',
      sourceBranch: 'feature/PROJ-9 Add feature',
      destinationBranch: 'main',
    });
    expect(info.provider).toBe('bitbucket');
    expect(info.repo.workspace).toBe('acme');
    expect(info.repo.repoSlug).toBe('demo');
    expect(info.id).toBe('42');
  });
});
