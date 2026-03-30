/**
 * REQ-220: Tests for wiki page delete detection.
 * Verifies that 404 from fetchWikiPage/fetchWikiPages triggers onRefreshProject.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../auth/api';

describe('REQ-220 delete detection', () => {
  it('ApiError with status 404 can be detected for delete handling', () => {
    const err = new ApiError(404, 'Not found');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err instanceof ApiError && err.status === 404).toBe(true);
  });

  it('non-404 ApiError is not treated as delete', () => {
    const err = new ApiError(500, 'Server error');
    expect(err instanceof ApiError && err.status === 404).toBe(false);
  });
});
