import type { Entity } from '../../types';

/**
 * Resolves doc JSON for an entity. Used by WikiEditorPane to determine what content to display.
 * - Prefers docById when available
 * - Falls back to selected.properties.doc when showing selected page (e.g. from list)
 * - Returns undefined when selected page doc is still unresolved
 */
export function getDocForEntity(
  entity: Entity,
  docById: Record<string, string | undefined>,
  selected: Entity | null
): string | undefined {
  const fromCache = docById[entity.id];
  if (fromCache !== undefined) return fromCache;
  if (entity.id !== selected?.id) return undefined;
  const fromProps = selected?.properties?.doc;
  if (fromProps != null) {
    const s = String(fromProps).trim();
    return s.length > 0 ? s : '[]';
  }
  return undefined;
}
