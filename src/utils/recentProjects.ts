import type { ProjectMeta } from '../types';

const RECENT_PROJECTS_STORAGE_KEY = 'keel_ui:recentProjectIds';
export const RECENT_PROJECTS_MAX_SIZE = 20;

/**
 * REQ-318: pin every stored recent at the front of the picker (storage cap is 20).
 * REQ-312 originally used 4 so the current project plus 3 previous recents stayed visible;
 * older recents then dropped into the alphabetical rest and looked like they had vanished.
 */
export const DEFAULT_RECENT_PROJECTS_PINNED_COUNT = RECENT_PROJECTS_MAX_SIZE;
/**
 * REQ-312: プロジェクトが多数でも候補リストが重くならないよう表示件数を打ち切る。
 * 500 件を全部描画するとオープン時に 70ms 超のロングタスク + 18,000px のスクロールになり、
 * 「スクロールして探す」手段として機能しないため、打ち切って絞り込みへ誘導する。
 */
export const PROJECT_OPTIONS_MAX = 50;

/** Unicode NFC + trim で部分一致を安定させる (recentLabels.ts と同じ規則)。 */
const normalizeForProjectMatch = (value: string): string =>
  value.trim().normalize('NFC').toLowerCase();

/** プロジェクト表示名。3 箇所に重複していた `名前 (KEY)` の組み立てをここに一本化する。 */
export const formatProjectLabel = (project: ProjectMeta): string =>
  `${project.name}${project.projectKey ? ` (${project.projectKey})` : ''}`;

const normalizeIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const safeReadRecentProjectIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = normalizeIds(parsed.filter((item): item is string => typeof item === 'string'));
    return ids.slice(0, RECENT_PROJECTS_MAX_SIZE);
  } catch {
    return [];
  }
};

export const getRecentProjectIds = (): string[] => safeReadRecentProjectIds();

export const recordRecentProject = (projectId: string): void => {
  const trimmed = projectId.trim();
  if (!trimmed) return;

  const next = normalizeIds([trimmed, ...safeReadRecentProjectIds()]).slice(
    0,
    RECENT_PROJECTS_MAX_SIZE
  );
  try {
    localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

type BuildProjectOptionsArgs = {
  projects: ProjectMeta[];
  /** {@link getRecentProjectIds} の結果 (最近表示した順)。呼び出し側が読むことで並び替えを純粋関数に保つ。 */
  recentProjectIds: string[];
  pinnedCount?: number;
};

/**
 * MUI Autocomplete の `options` に渡す並び順: 最近表示したプロジェクトを先頭に固定し、
 * 残りは名前の昇順に並べる (多数あるとき「先頭 N 件」の中身が予測可能になる)。
 * 絞り込みはしない (MUI 側の filterOptions に {@link matchProjects} を渡す)。
 * 全件を options として渡すことで、選択中の値が絞り込みで消えても MUI の警告が出ず、
 * 「打った文字の最上位候補がハイライトされる」既定挙動もそのまま活きる。
 */
export const buildProjectOptions = ({
  projects,
  recentProjectIds,
  pinnedCount = DEFAULT_RECENT_PROJECTS_PINNED_COUNT,
}: BuildProjectOptionsArgs): ProjectMeta[] => {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const pinned: ProjectMeta[] = [];
  for (const id of recentProjectIds) {
    if (pinned.length >= Math.max(0, pinnedCount)) break;
    const project = byId.get(id);
    if (project) pinned.push(project);
  }
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const rest = projects
    .filter((p) => !pinnedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return [...pinned, ...rest];
};

/**
 * MUI Autocomplete の `filterOptions` 用: 名前とプロジェクトキーの両方を照合する
 * (例: "REQ" で拾える)。件数の打ち切りは呼び出し側が {@link PROJECT_OPTIONS_MAX} で行い、
 * 隠れた件数をユーザーに知らせる。
 */
export const matchProjects = (options: ProjectMeta[], inputValue: string): ProjectMeta[] => {
  const query = normalizeForProjectMatch(inputValue);
  if (!query) return options;

  return options.filter(
    (p) =>
      normalizeForProjectMatch(p.name).includes(query) ||
      normalizeForProjectMatch(p.projectKey ?? '').includes(query)
  );
};
