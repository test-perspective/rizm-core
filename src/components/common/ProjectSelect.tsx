import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, Paper, TextField } from '@mui/material';
import type { AutocompleteRenderGroupParams } from '@mui/material/Autocomplete';
import type { ProjectMeta } from '../../types';
import {
  buildProjectOptions,
  formatProjectLabel,
  getRecentProjectIds,
  matchProjects,
  PROJECT_OPTIONS_MAX,
} from '../../utils/recentProjects';

/** REQ-318: section labels in the project picker dropdown. */
export const PROJECT_SELECT_GROUP_RECENT = 'Recent';
export const PROJECT_SELECT_GROUP_ALL = 'All projects';
/** REQ-318: dropdown is wider than the narrow trigger (header is 200px). */
export const PROJECT_SELECT_POPPER_MIN_WIDTH_PX = 320;

/** Cap the menu to the remaining viewport so it cannot grow the page. */
const fitMenuToViewport = {
  name: 'fitProjectSelectMenuToViewport',
  enabled: true,
  phase: 'beforeWrite' as const,
  fn({ state }: { state: any }) {
    const top = state.modifiersData.popperOffsets?.y ?? 0;
    const available = Math.max(160, window.innerHeight - top - 8);
    const contentHeight = state.rects.popper.height;
    const height = Math.min(contentHeight, available);
    state.styles.popper = {
      ...state.styles.popper,
      maxHeight: `${available}px`,
      height: `${height}px`,
    };
  },
};

const renderProjectSelectGroup = (params: AutocompleteRenderGroupParams) => (
  <li key={params.key}>
    <div
      className="sticky top-0 z-10 px-3 py-1 text-xs font-medium tracking-wide text-zinc-400 bg-zinc-900 border-b border-zinc-800"
      data-testid={
        params.group === PROJECT_SELECT_GROUP_RECENT
          ? 'project-select-group-recent'
          : 'project-select-group-all'
      }
    >
      {params.group}
    </div>
    <ul className="m-0 p-0 list-none">{params.children}</ul>
  </li>
);

export type ProjectSelectProps = {
  projects: ProjectMeta[];
  /** 選択中の projectId。 */
  value: string;
  onChange: (projectId: string) => void;
  /** 指定するとフローティングラベル付きで描画する (ダイアログ用)。 */
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** 外側 div のクラス (サイドバーの flex-1 min-w-0 など)。 */
  className?: string;
  /** input に付与する data-testid。 */
  testId?: string;
};

/**
 * REQ-312 / REQ-318: typeahead project picker.
 * Recents (up to the storage cap) are pinned under Recent; the rest are alphabetical under All projects.
 */
export function ProjectSelect({
  projects,
  value,
  onChange,
  label,
  ariaLabel = 'Project',
  disabled = false,
  className,
  testId,
}: ProjectSelectProps) {
  const selected = useMemo<ProjectMeta>(() => {
    const found = projects.find((p) => p.id === value);
    if (found) return found;
    // 一覧取得前など該当が無いとき用の暫定エントリ (disableClearable の型は null を許さない)。
    return { id: value, name: value, createdAt: 0, updatedAt: 0 };
  }, [projects, value]);
  const selectedLabel = value ? formatProjectLabel(selected) : '';
  const [inputValue, setInputValue] = useState(selectedLabel);

  // 選択が外部から変わったとき (URL 遷移・プロジェクト追加など) 入力欄を追従させる。
  useEffect(() => {
    setInputValue(selectedLabel);
  }, [selectedLabel]);

  // 「最近表示した順」は遷移のたびに変わるので、開くたびに読み直す。
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(getRecentProjectIds);
  const recentIdSet = useMemo(() => new Set(recentProjectIds), [recentProjectIds]);

  // options は全件 (最近表示した順に前詰め)。絞り込みは filterOptions で MUI に任せる:
  // MUI は入力が選択中ラベルそのままのときだけ絞り込みを外すので、
  // 「開いた直後は全件・打ち始めたら絞り込む」がそのまま得られる。
  const options = useMemo(
    () => buildProjectOptions({ projects, recentProjectIds }),
    [projects, recentProjectIds]
  );

  /**
   * 打ち切りで隠れた件数。filterOptions は Autocomplete の描画中に呼ばれ、ポップアップの
   * Paper も同じ描画で作られるため、ref 経由で最新値を受け渡せる。
   */
  const hiddenCountRef = useRef(0);

  const paperComponent = useCallback(
    ({ children, ...paperProps }: React.HTMLAttributes<HTMLElement>) => (
      <Paper
        {...paperProps}
        sx={{
          overflow: 'hidden !important',
          height: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
        {hiddenCountRef.current > 0 && (
          <div
            className="px-3 py-2 text-xs text-zinc-500 border-t border-zinc-800"
            data-testid="project-select-truncation"
          >
            {hiddenCountRef.current} more — type to narrow
          </div>
        )}
      </Paper>
    ),
    []
  );

  return (
    <div className={className}>
      <Autocomplete
        value={selected}
        onChange={(_event, next) => {
          // 「最近表示した順」は表示側 (useRecordRecentProject) が記録するため、ここでは記録しない。
          if (next) onChange(next.id);
        }}
        inputValue={inputValue}
        onInputChange={(_event, next) => setInputValue(next)}
        onOpen={() => setRecentProjectIds(getRecentProjectIds())}
        options={options}
        filterOptions={(opts, state) => {
          const matched = matchProjects(opts, state.inputValue);
          hiddenCountRef.current = Math.max(0, matched.length - PROJECT_OPTIONS_MAX);
          return matched.slice(0, PROJECT_OPTIONS_MAX);
        }}
        PaperComponent={paperComponent}
        groupBy={(option) =>
          recentIdSet.has(option.id) ? PROJECT_SELECT_GROUP_RECENT : PROJECT_SELECT_GROUP_ALL
        }
        renderGroup={renderProjectSelectGroup}
        getOptionLabel={(option) => formatProjectLabel(option)}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        disabled={disabled}
        openOnFocus
        selectOnFocus
        autoHighlight
        blurOnSelect
        disableClearable
        renderOption={(optionProps, option) => (
          <li {...optionProps} key={option.id}>
            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="text-sm truncate">{option.name}</span>
              {option.projectKey && (
                <span className="text-xs text-zinc-500 ml-auto shrink-0">{option.projectKey}</span>
              )}
            </div>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            variant="outlined"
            size="small"
            placeholder="Search project..."
            inputProps={{
              ...params.inputProps,
              'aria-label': ariaLabel,
              ...(testId ? { 'data-testid': testId } : {}),
            }}
            InputProps={{
              ...params.InputProps,
              sx: {
                color: 'white',
                fontSize: '0.875rem',
                backgroundColor: 'rgb(24 24 27)', // zinc-900
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgb(39 39 42)', // zinc-800
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgb(82 82 91)', // zinc-500
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgb(124 58 237)', // violet-600
                  borderWidth: 2,
                },
              },
            }}
          />
        )}
        sx={{
          width: '100%',
          '& .MuiAutocomplete-inputRoot': {
            padding: '2px 9px',
          },
        }}
        slotProps={{
          popper: {
            // Drawer (zIndex 1200) より前面。minWidth beats MUI's inline width matching the trigger.
            // fixed so a tall menu cannot grow the page (which produced a window scrollbar).
            popperOptions: { strategy: 'fixed' },
            modifiers: [fitMenuToViewport],
            sx: {
              zIndex: 15000,
              minWidth: PROJECT_SELECT_POPPER_MIN_WIDTH_PX,
              maxWidth: 'calc(100vw - 16px)',
              overflow: 'hidden',
            },
          },
          listbox: {
            sx: {
              bgcolor: 'rgb(24 24 27)',
              color: 'white',
              flex: '1 1 auto',
              minHeight: 0,
              // Override MUI's 40vh clip; the Paper maxHeight keeps the menu in the viewport.
              maxHeight: 'none',
              overflowX: 'hidden',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              '&::-webkit-scrollbar': {
                display: 'none',
              },
              '& .MuiAutocomplete-option': {
                '&:hover': {
                  bgcolor: 'rgb(39 39 42)',
                },
                '&[aria-selected="true"]': {
                  bgcolor: 'rgb(124 58 237 / 0.3)',
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
