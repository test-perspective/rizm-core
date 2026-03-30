import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('KeelWorkspace hook order (rename flow)', () => {
  it('declares handleRenameBoardColumn before the loading early return', () => {
    const pathToSource = join(here, 'KeelWorkspace.tsx');
    const src = readFileSync(pathToSource, 'utf8');
    const rename = src.indexOf('handleRenameBoardColumn');
    const guard = src.indexOf(
      'if (loading || !activeProject || !manifest || !currentView || !currentEntity)'
    );
    expect(rename).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(rename).toBeLessThan(guard);
  });
});
