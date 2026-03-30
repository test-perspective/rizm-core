import type { Entity, EntityDefinition, ProjectManifest, PropertyDefinition, ViewConfig } from '../types';

// Keep in sync with `src/components/board/boardOrder.ts` (avoid importing UI code from utils).
const ORDER_KEY = '__keelOrder';

type ReconcileResult = {
  manifest: ProjectManifest;
  addedLegacyEntityIds: string[];
  addedLegacyViewIds: string[];
  defaultViewChanged: boolean;
};

const pickUniqueId = (base: string, taken: Set<string>): string => {
  let id = base;
  let i = 1;
  while (taken.has(id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  return id;
};

const uniqByName = (props: PropertyDefinition[]): PropertyDefinition[] => {
  const seen = new Set<string>();
  const out: PropertyDefinition[] = [];
  for (const p of props) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
};

const toTitle = (id: string): string => {
  const cleaned = id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return id;
  return cleaned
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
};

const pluralize = (name: string): string => {
  const n = name.trim();
  if (!n) return name;
  if (n.endsWith('s')) return n;
  return `${n}s`;
};

const inferPropertyType = (values: unknown[]): PropertyDefinition['type'] => {
  const vs = values.filter((v) => v !== null && v !== undefined);
  if (vs.length === 0) return 'text';

  const allBoolean = vs.every((v) => typeof v === 'boolean');
  if (allBoolean) return 'boolean';

  const allNumber = vs.every((v) => typeof v === 'number' && Number.isFinite(v as number));
  if (allNumber) return 'number';

  const allDateLike = vs.every((v) => {
    if (typeof v === 'string') {
      // Very small heuristic: yyyy-mm-dd or ISO-ish
      return /^\d{4}-\d{2}-\d{2}/.test(v) || !Number.isNaN(Date.parse(v));
    }
    return false;
  });
  if (allDateLike) return 'date';

  return 'text';
};

const inferPropertiesFromEntities = (entities: Entity[]): PropertyDefinition[] => {
  const keys = new Set<string>();
  for (const e of entities) {
    for (const k of Object.keys(e.properties ?? {})) {
      if (!k) continue;
      if (k === ORDER_KEY) continue; // internal ordering key
      keys.add(k);
    }
  }
  const props: PropertyDefinition[] = [];
  for (const name of keys) {
    const values = entities.map((e) => (e.properties ? e.properties[name] : undefined));
    props.push({ name, type: inferPropertyType(values), visible: true });
  }
  // Stable-ish order: prefer common display fields first
  const preferred = ['title', 'name', 'email', 'company', 'status', 'stage', 'priority'];
  props.sort((a, b) => {
    const ai = preferred.indexOf(a.name);
    const bi = preferred.indexOf(b.name);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return props;
};

const pickVisibleProps = (props: PropertyDefinition[]): string[] => {
  const candidates = props
    .filter((p) => p.name && p.name !== ORDER_KEY)
    .filter((p) => p.visible !== false);
  if (candidates.length === 0) return [];
  // Keep it simple: first up to 5 properties.
  return candidates.slice(0, 5).map((p) => p.name);
};

const ensureAtLeastOneProperty = (def: EntityDefinition): EntityDefinition => {
  const props = def.properties ?? [];
  if (props.length > 0) return def;
  // Placeholder property so the generated view can be valid.
  return {
    ...def,
    properties: [{ name: 'title', type: 'text', visible: true }],
  };
};

const mergeEntityDefinitionProperties = (
  base: EntityDefinition,
  additions: PropertyDefinition[]
): EntityDefinition => {
  const existing = base.properties ?? [];
  const existingNames = new Set(existing.map((p) => p.name));
  const merged = [...existing];
  for (const p of additions) {
    if (!p?.name) continue;
    if (existingNames.has(p.name)) continue;
    merged.push(p);
    existingNames.add(p.name);
  }
  return { ...base, properties: uniqByName(merged) };
};

const getDefaultViewEntityId = (manifest: ProjectManifest): string | null => {
  const v = manifest.views.find((x) => x.id === manifest.defaultView) ?? null;
  return v?.entityId ?? null;
};

/**
 * Reconcile a new manifest with existing project data so data doesn't "disappear"
 * after AI Transform (most commonly due to entityId mismatch).
 *
 * This is intentionally conservative: it does NOT rewrite entity.entityId nor does it
 * attempt semantic field mapping. It only ensures there is a view+entity definition
 * path to access already persisted entities.
 */
export const reconcileManifestWithData = (
  oldManifest: ProjectManifest,
  incoming: ProjectManifest,
  entities: Entity[]
): ReconcileResult => {
  const entityIdsInData = Array.from(new Set((entities ?? []).map((e) => e.entityId).filter(Boolean)));
  const newEntityIds = new Set(incoming.entities.map((e) => e.id));

  const oldEntityById = new Map(oldManifest.entities.map((e) => [e.id, e] as const));
  const nextEntities: EntityDefinition[] = incoming.entities.map((e) => ({ ...e, properties: [...(e.properties ?? [])] }));
  const nextViews: ViewConfig[] = incoming.views.map((v) => ({ ...v, visibleProperties: [...(v.visibleProperties ?? [])] }));

  // 1) Merge missing properties for entityIds that exist in both manifests (prevents value "hiding")
  for (let i = 0; i < nextEntities.length; i += 1) {
    const def = nextEntities[i];
    const old = oldEntityById.get(def.id);
    if (!old) continue;
    nextEntities[i] = mergeEntityDefinitionProperties(def, old.properties ?? []);
  }

  const takenViewIds = new Set(nextViews.map((v) => v.id));
  const addedLegacyEntityIds: string[] = [];
  const addedLegacyViewIds: string[] = [];

  // 2) Add legacy entity definitions + legacy list views for entityIds present in data but missing in manifest.
  for (const entityId of entityIdsInData) {
    if (newEntityIds.has(entityId)) continue;

    const dataForEntity = entities.filter((e) => e.entityId === entityId);
    const inferredProps = inferPropertiesFromEntities(dataForEntity);

    const oldDef = oldEntityById.get(entityId);
    const baseDef: EntityDefinition =
      oldDef ??
      ({
        id: entityId,
        name: toTitle(entityId),
        namePlural: pluralize(toTitle(entityId)),
        properties: [],
      } as EntityDefinition);

    const mergedDef = ensureAtLeastOneProperty(mergeEntityDefinitionProperties(baseDef, inferredProps));
    nextEntities.push(mergedDef);
    newEntityIds.add(entityId);
    addedLegacyEntityIds.push(entityId);

    const legacyBaseId = `legacy-${entityId}`;
    const legacyViewId = pickUniqueId(legacyBaseId, takenViewIds);
    takenViewIds.add(legacyViewId);

    const visible = pickVisibleProps(mergedDef.properties ?? []);
    nextViews.push({
      id: legacyViewId,
      name: `Legacy: ${mergedDef.name}`,
      type: 'table',
      entityId,
      visibleProperties: visible.length > 0 ? visible : ['title'],
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
    addedLegacyViewIds.push(legacyViewId);
  }

  // 3) Ensure views do not end up with empty visibleProperties (defensive)
  const finalEntities = nextEntities.map(ensureAtLeastOneProperty);
  const entityDefById = new Map(finalEntities.map((e) => [e.id, e] as const));
  for (let i = 0; i < nextViews.length; i += 1) {
    const v = nextViews[i];
    const entityDef = entityDefById.get(v.entityId);
    if (!entityDef) continue;
    const allowed = new Set((entityDef.properties ?? []).map((p) => p.name));
    const filtered = (v.visibleProperties ?? []).filter((p) => allowed.has(p));
    if (filtered.length > 0) {
      nextViews[i] = { ...v, visibleProperties: filtered };
      continue;
    }
    const fallback = pickVisibleProps(entityDef.properties ?? []);
    nextViews[i] = { ...v, visibleProperties: fallback.length > 0 ? fallback : ['title'] };
  }

  // 4) Default view safety: if defaultView has 0 entities but legacy views exist with data, switch to legacy
  const defaultEntityId = getDefaultViewEntityId(incoming);
  const defaultCount = defaultEntityId ? entities.filter((e) => e.entityId === defaultEntityId).length : 0;
  let defaultView = incoming.defaultView;
  let defaultViewChanged = false;
  if (defaultCount === 0 && addedLegacyViewIds.length > 0) {
    defaultView = addedLegacyViewIds[0];
    defaultViewChanged = defaultView !== incoming.defaultView;
  }

  const manifest: ProjectManifest = {
    ...incoming,
    entities: finalEntities,
    views: nextViews,
    defaultView,
  };

  return { manifest, addedLegacyEntityIds, addedLegacyViewIds, defaultViewChanged };
};

