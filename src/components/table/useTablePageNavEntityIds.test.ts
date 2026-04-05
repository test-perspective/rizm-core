import { describe, expect, it, vi } from 'vitest';
import { computeTablePageEntityIds, createTablePageNavIdsSync } from './useTablePageNavEntityIds';

describe('computeTablePageEntityIds', () => {
  it('returns a slice of sorted row ids for the current page', () => {
    const api = { getSortedRowIds: () => ['a', 'b', 'c', 'd', 'e'] };
    expect(computeTablePageEntityIds(api, 0, 2)).toEqual(['a', 'b']);
    expect(computeTablePageEntityIds(api, 1, 2)).toEqual(['c', 'd']);
    expect(computeTablePageEntityIds(api, 2, 2)).toEqual(['e']);
  });

  it('returns empty when api is missing or throws', () => {
    expect(computeTablePageEntityIds(null, 0, 10)).toEqual([]);
    expect(
      computeTablePageEntityIds(
        { getSortedRowIds: () => { throw new Error('fail'); } },
        0,
        10
      )
    ).toEqual([]);
  });
});

describe('createTablePageNavIdsSync', () => {
  it('invokes onChange with page slice after microtask', async () => {
    const apiRef = { current: { getSortedRowIds: () => ['x', 'y', 'z'] } };
    const onChange = vi.fn();
    const sync = createTablePageNavIdsSync(apiRef, 0, 2, onChange);
    sync();
    expect(onChange).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledWith(['x', 'y']);
  });

  it('does not call onChange when the computed id list is unchanged', async () => {
    const apiRef = { current: { getSortedRowIds: () => ['x', 'y', 'z'] } };
    const onChange = vi.fn();
    const sync = createTablePageNavIdsSync(apiRef, 0, 2, onChange);
    sync();
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
    sync();
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
