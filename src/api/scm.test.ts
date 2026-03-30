import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiJson } from '../auth/api';
import { fetchBitbucketBranches } from './scm';

vi.mock('../auth/api', () => ({
  apiJson: vi.fn(),
}));

describe('scm api', () => {
  const apiJsonMock = vi.mocked(apiJson);

  beforeEach(() => {
    apiJsonMock.mockResolvedValue({ branches: [], mainbranch: 'main' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetchBitbucketBranches calls apiJson without q when options omitted', async () => {
    await fetchBitbucketBranches('proj-1');
    expect(apiJsonMock).toHaveBeenCalledWith('/api/projects/proj-1/scm/bitbucket/branches');
  });

  it('fetchBitbucketBranches calls apiJson with q when options.q provided', async () => {
    await fetchBitbucketBranches('proj-1', { q: 'feature' });
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/projects/proj-1/scm/bitbucket/branches?q=' + encodeURIComponent('feature')
    );
  });

  it('fetchBitbucketBranches encodes projectId and q', async () => {
    await fetchBitbucketBranches('my/project', { q: 'a b' });
    expect(apiJsonMock).toHaveBeenCalledWith(
      '/api/projects/my%2Fproject/scm/bitbucket/branches?q=' + encodeURIComponent('a b')
    );
  });

  it('fetchBitbucketBranches returns mainbranch from response', async () => {
    apiJsonMock.mockResolvedValue({ branches: ['main', 'develop'], mainbranch: 'main' });
    const res = await fetchBitbucketBranches('p1');
    expect(res.branches).toEqual(['main', 'develop']);
    expect(res.mainbranch).toBe('main');
  });
});
