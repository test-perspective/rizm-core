import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiJson } from '../auth/api';
import { fetchOpenRouterModels } from './openrouter';

vi.mock('../auth/api', () => ({
  apiJson: vi.fn(),
}));

describe('openrouter api', () => {
  const apiJsonMock = vi.mocked(apiJson);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetchOpenRouterModels returns data.data when present', async () => {
    const models = [{ id: 'openai/gpt-4o', name: 'GPT-4o' }];
    apiJsonMock.mockResolvedValue({ data: models });
    const result = await fetchOpenRouterModels();
    expect(apiJsonMock).toHaveBeenCalledWith('/api/ai/openrouter-models');
    expect(result).toEqual(models);
  });

  it('fetchOpenRouterModels returns empty array when data is array at top level', async () => {
    apiJsonMock.mockResolvedValue([{ id: 'm1' }]);
    const result = await fetchOpenRouterModels();
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('fetchOpenRouterModels returns empty array when data has no data or array', async () => {
    apiJsonMock.mockResolvedValue({});
    const result = await fetchOpenRouterModels();
    expect(result).toEqual([]);
  });

  it('fetchOpenRouterModels propagates apiJson errors', async () => {
    apiJsonMock.mockRejectedValue(new Error('Network error'));
    await expect(fetchOpenRouterModels()).rejects.toThrow('Network error');
  });
});
