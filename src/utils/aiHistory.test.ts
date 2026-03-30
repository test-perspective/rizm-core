import { beforeEach, describe, expect, it } from 'vitest';

import { appendAiHistoryPair, clearAiHistory, getAiHistory, setAiHistory } from './aiHistory';

describe('aiHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and loads history by project and tab', () => {
    setAiHistory('project-1', 'assistant', [
      { role: 'user', content: 'first', createdAt: 10 },
      { role: 'assistant', content: 'second', createdAt: 11 },
    ]);

    const history = getAiHistory('project-1', 'assistant');
    expect(history).toEqual([
      { role: 'user', content: 'first', createdAt: 10 },
      { role: 'assistant', content: 'second', createdAt: 11 },
    ]);
    expect(getAiHistory('project-1', 'transform')).toEqual([]);
  });

  it('ignores invalid json payload', () => {
    localStorage.setItem('keel_ai_history:project-1:assistant', '{invalid');
    expect(getAiHistory('project-1', 'assistant')).toEqual([]);
  });

  it('appends a user/assistant pair', () => {
    const next = appendAiHistoryPair('project-2', 'transform', 'please update', 'updated');
    expect(next).toHaveLength(2);
    expect(next[0]?.role).toBe('user');
    expect(next[1]?.role).toBe('assistant');
  });

  it('clears only selected tab', () => {
    setAiHistory('project-3', 'assistant', [{ role: 'user', content: 'a', createdAt: 1 }]);
    setAiHistory('project-3', 'transform', [{ role: 'user', content: 'b', createdAt: 2 }]);

    clearAiHistory('project-3', 'assistant');
    expect(getAiHistory('project-3', 'assistant')).toEqual([]);
    expect(getAiHistory('project-3', 'transform')).toHaveLength(1);
  });

  it('uses me as storage key when projectId is empty', () => {
    setAiHistory('', 'assistant', [
      { role: 'user', content: 'hello', createdAt: 1 },
      { role: 'assistant', content: 'hi', createdAt: 2 },
    ]);
    expect(getAiHistory('', 'assistant')).toEqual([
      { role: 'user', content: 'hello', createdAt: 1 },
      { role: 'assistant', content: 'hi', createdAt: 2 },
    ]);
    clearAiHistory('', 'assistant');
    expect(getAiHistory('', 'assistant')).toEqual([]);
  });
});
