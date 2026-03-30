import { GitBranch, GitPullRequest, Paperclip } from 'lucide-react';

import type { Entity, PropertyDefinition, ScmBranchInfo, ScmPullRequestInfo, UserSummary } from '../../types';
import { TagPill } from '../common/TagPill';
import { UserAvatar } from '../UserAvatar';
import { DELETED_USER_LABEL } from '../../utils/userDisplay';

const renderValue = (
  value: any,
  prop: PropertyDefinition,
  allEntities: Entity[] = [],
  onEntityClick?: (entity: Entity) => void,
  usersById: Record<string, UserSummary> = {}
) => {
  if (value === null || value === undefined) return null;

  if (prop.type === 'user') {
    const userId = typeof value === 'string' ? value.trim() : '';
    if (!userId) return null;
    const user = usersById[userId];
    if (!user) {
      return (
        <span className="text-zinc-500 text-xs" title={`User ID: ${userId}`}>
          {DELETED_USER_LABEL}
        </span>
      );
    }
    return (
      <div title={user.email}>
        <UserAvatar email={user.email} size="sm" />
      </div>
    );
  }

  if (prop.type === 'select') {
    const colors: Record<string, string> = {
      Done: 'bg-green-500/20 text-green-300 border-green-500/30',
      'In Progress': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      Todo: 'bg-zinc-700 text-zinc-300 border-zinc-600',
      High: 'bg-red-500/20 text-red-300 border-red-500/30',
      Medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      Low: 'bg-zinc-700 text-zinc-300 border-zinc-600',
    };

    const colorClass = colors[String(value)] || 'bg-zinc-700 text-zinc-300 border-zinc-600';
    return <span className={`px-2 py-1 text-xs rounded border ${colorClass}`}>{String(value)}</span>;
  }

  if (prop.type === 'labels') {
    const labels = Array.isArray(value)
      ? value.map((x) => String(x)).filter((x) => x.trim().length > 0)
      : [];
    if (labels.length === 0) return null;
    const maxLabels = 5;
    const displayLabels = labels.slice(0, maxLabels);
    const hasMore = labels.length > maxLabels;
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {displayLabels.map((label) => (
          <TagPill key={label} value={label} />
        ))}
        {hasMore && <span className="text-zinc-500 text-xs">...</span>}
      </div>
    );
  }

  if (prop.type === 'link') {
    const taskKeys = Array.isArray(value)
      ? value.filter((tk): tk is string => typeof tk === 'string' && tk.trim().length > 0).map((tk) => tk.trim())
      : typeof value === 'string' && value.trim()
        ? [value.trim()]
        : [];

    if (taskKeys.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {taskKeys.map((taskKey) => {
          const linkedEntity = allEntities.find((e) => {
            const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
            return tk === taskKey;
          });

          const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (linkedEntity && onEntityClick) {
              onEntityClick(linkedEntity);
            }
          };

          return (
            <button
              key={taskKey}
              type="button"
              onClick={handleClick}
              className={`px-2 py-1 text-xs rounded border font-mono ${
                linkedEntity
                  ? 'text-violet-400 border-violet-500/30 hover:bg-violet-500/20 hover:text-violet-300 cursor-pointer'
                  : 'text-zinc-500 border-zinc-600 line-through cursor-default'
              }`}
              title={linkedEntity ? `Click to open: ${taskKey}` : `Deleted entity: ${taskKey}`}
            >
              {taskKey}
            </button>
          );
        })}
      </div>
    );
  }

  return <span className="text-zinc-400 text-sm">{String(value)}</span>;
};

type CardContentProps = {
  entity: Entity;
  visibleProps: PropertyDefinition[];
  allEntities?: Entity[];
  onEntityClick?: (entity: Entity) => void;
  variant?: 'card' | 'row';
  usersById?: Record<string, UserSummary>;
  scmIntegrationEnabled?: boolean;
  scmBranch?: ScmBranchInfo | null;
  scmPullRequest?: ScmPullRequestInfo | null;
  /** Reserve right space for 3-dot menu to avoid overlap */
  reserveRightForMenu?: boolean;
};

export const CardContent = ({
  entity,
  visibleProps,
  allEntities = [],
  onEntityClick,
  variant = 'card',
  usersById = {},
  scmIntegrationEnabled = false,
  scmBranch,
  scmPullRequest,
  reserveRightForMenu = false,
}: CardContentProps) => {
  const displayProps = visibleProps.filter((p) => p.type !== 'richtext' && p.name !== 'comments');
  const taskKey = entity.properties?.taskKey;
  const hasAttachments =
    Array.isArray((entity.properties as any)?.attachments) && (entity.properties as any).attachments.length > 0;
  const branchUrl = scmIntegrationEnabled ? scmBranch?.url : undefined;
  const prUrl = scmIntegrationEnabled ? scmPullRequest?.url : undefined;
  const title =
    entity.properties?.title ??
    (displayProps.length > 0 ? entity.properties?.[displayProps[0].name] : undefined);

  if (variant === 'row') {
    const otherProps = displayProps.filter((p) => p.name !== 'title' && p.name !== 'taskKey');
    return (
      <div className={`flex items-center gap-3 w-full ${reserveRightForMenu ? 'pr-10' : ''}`}>
        {taskKey ? (
          <div className="text-xs text-zinc-400 font-mono shrink-0 flex items-center gap-2">
            <span>{String(taskKey)}</span>
            <div className="flex items-center gap-2">
              {branchUrl ? (
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-200"
                  title="Open branch"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(branchUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                </button>
              ) : null}
              {prUrl ? (
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-200"
                  title="Open pull request"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(prUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                </button>
              ) : null}
              {hasAttachments ? (
                <span className="text-zinc-500" title="Has attachments">
                  <Paperclip className="w-3 h-3" />
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="font-medium text-white text-[10pt] truncate flex-1 min-w-0">{title || 'Untitled'}</div>
        <div className="flex items-center gap-2 shrink-0">
          {otherProps.map((prop) => (
            <div key={prop.name} className="shrink-0">
              {renderValue(entity.properties[prop.name], prop, allEntities, onEntityClick, usersById)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {taskKey ? (
        <div
          className={`text-xs text-zinc-400 mb-1 font-mono flex items-center justify-between gap-2 ${reserveRightForMenu ? 'pr-10' : ''}`}
        >
          <span className="truncate">{String(taskKey)}</span>
          <div className="flex items-center gap-2 shrink-0">
            {branchUrl ? (
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-200"
                title="Open branch"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(branchUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <GitBranch className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {prUrl ? (
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-200"
                title="Open pull request"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(prUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                <GitPullRequest className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {hasAttachments ? (
              <span className="shrink-0 text-zinc-500" title="Has attachments">
                <Paperclip className="w-3.5 h-3.5" />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="font-medium text-white mb-2 text-[10pt]">{title || 'Untitled'}</div>
      <div className="flex flex-wrap gap-2">
        {displayProps
          .filter((p) => p.name !== 'title' && p.name !== 'taskKey')
          .map((prop) => (
            <div key={prop.name}>
              {renderValue(entity.properties[prop.name], prop, allEntities, onEntityClick, usersById)}
            </div>
          ))}
      </div>
    </>
  );
};
