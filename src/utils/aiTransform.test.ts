import { describe, expect, it } from 'vitest';
import { getManifestForTransformationInput } from './aiTransform';

describe('getManifestForTransformationInput', () => {
  it('matches crm keywords', () => {
    const m = getManifestForTransformationInput('Transform to CRM');
    expect(m?.entities[0]?.name).toBe('Contact');
    expect(m?.defaultView).toBe('table');
  });

  it('matches inventory keywords', () => {
    const m = getManifestForTransformationInput('make this an inventory tracker');
    expect(m?.entities[0]?.name).toBe('Item');
    expect(m?.views.some((v) => v.type === 'board')).toBe(true);
  });

  it('matches book keywords', () => {
    const m = getManifestForTransformationInput('Change to book tracker');
    expect(m?.entities[0]?.name).toBe('Book');
  });

  it('matches bug keywords', () => {
    const m = getManifestForTransformationInput('convert to issue tracker');
    expect(m?.entities[0]?.name).toBe('Bug');
    expect(m?.defaultView).toBe('kanban');
  });

  it('returns null when no keyword matches', () => {
    expect(getManifestForTransformationInput('hello world')).toBeNull();
  });
});

