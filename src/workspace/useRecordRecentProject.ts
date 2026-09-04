import { useEffect } from 'react';
import type { ProjectMeta } from '../types';
import { recordRecentProject } from '../utils/recentProjects';

type UseRecordRecentProjectArgs = {
  loading: boolean;
  projects: ProjectMeta[];
  activeProjectId: string;
};

/**
 * REQ-312: プロジェクト選択の候補を「最近表示した順」で並べるため、実際に表示された
 * プロジェクトを記録する。ピッカーでの選択時ではなく表示時に記録することで、URL 直打ち・
 * 検索からの遷移・プロジェクト作成直後・前回セッションの復帰も同じように反映される。
 */
export const useRecordRecentProject = ({
  loading,
  projects,
  activeProjectId,
}: UseRecordRecentProjectArgs): void => {
  useEffect(() => {
    // 読み込み中や、閲覧権限が無く一覧に出ない id は「表示した」とみなさない。
    if (loading || !activeProjectId) return;
    if (!projects.some((p) => p.id === activeProjectId)) return;
    recordRecentProject(activeProjectId);
  }, [loading, projects, activeProjectId]);
};
