import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Entity, PropertyDefinition, ScmBranchInfo, ScmProjectConfig, ScmPullRequestInfo, UserSummary } from '../../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Menu, MenuItem } from '@mui/material';
import { MoreVertical, ArrowUpToLine, ArrowDownToLine, GripVertical } from 'lucide-react';
import { CreateBranchDialog } from '../scm/CreateBranchDialog';
import { CreatePullRequestDialog } from '../scm/CreatePullRequestDialog';
import {
  getEntityTitle,
  getTaskKey,
  toScmBranchInfo,
  toScmPullRequestInfo,
} from '../../utils/scm';
import { CardContent } from './BoardCardContent';
import { useIsMobile } from '../../hooks/useIsMobile';
export { CardContent } from './BoardCardContent';

export const SortableCard = ({
  entity,
  visibleProps,
  onClick,
  onEntityUpdate,
  allEntities = [],
  onEntityClick,
  variant = 'card',
  columnTaskIds = [],
  onMoveCard,
  usersById = {},
  projectId,
  scmIntegrationEnabled,
  scmConfig,
  scmConnected,
  scmLoading,
  onScmRefresh,
}: {
  entity: Entity;
  visibleProps: PropertyDefinition[];
  onClick: () => void;
  onEntityUpdate: (entityId: string, patch: Record<string, unknown>) => void | Promise<boolean>;
  allEntities?: Entity[];
  onEntityClick?: (entity: Entity) => void;
  variant?: 'card' | 'row';
  columnTaskIds?: string[];
  onMoveCard?: (entityId: string, position: 'top' | 'bottom') => void;
  usersById?: Record<string, UserSummary>;
  projectId: string;
  scmIntegrationEnabled: boolean;
  scmConfig: ScmProjectConfig | null;
  scmConnected: boolean;
  scmLoading: boolean;
  onScmRefresh?: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entity.id });

  const isMobile = useIsMobile();

  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const skipClickRef = useRef(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createPrOpen, setCreatePrOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);

  const cardIndex = columnTaskIds.indexOf(entity.id);
  const canMoveToTop = cardIndex > 0 && onMoveCard;
  const canMoveToBottom = cardIndex >= 0 && cardIndex < columnTaskIds.length - 1 && onMoveCard;

  useEffect(() => {
    const handleClickOutside = (ev: globalThis.MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(ev.target as Node)) {
        setMoveMenuOpen(false);
      }
    };
    if (moveMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [moveMenuOpen]);

  const scmBranch = entity.properties?.scmBranch as ScmBranchInfo | undefined;
  const scmPullRequest = entity.properties?.scmPullRequest as ScmPullRequestInfo | undefined;
  const scmReady = scmIntegrationEnabled && Boolean(scmConfig) && scmConnected;

  const handleContextMenu = (e: MouseEvent) => {
    if (!scmIntegrationEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenuAnchor({ x: e.clientX, y: e.clientY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      skipClickRef.current = true;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    onClick();
  };

  const closeContextMenu = () => setContextMenuAnchor(null);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        // REQ-286: on mobile the card body keeps `touch-action: auto` so the browser
        // handles swipes as scrolling/panning. Drag is initiated only from the grip
        // handle (rendered below), which has its own `touch-none` + listeners. On desktop
        // (md+) we keep the whole-card listeners so the existing click-and-drag UX is
        // preserved. The `md:touch-none` is essentially a no-op for mouse but documents
        // intent.
        variant === 'row'
          ? 'bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 hover:border-zinc-700 transition-colors group cursor-pointer touch-auto md:touch-none select-none relative'
          : 'bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors group cursor-pointer touch-auto md:touch-none select-none relative',
        isMobile && variant !== 'row' ? 'pl-9' : '',
        isDragging ? 'opacity-30' : '',
      ].join(' ')}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      {...attributes}
      {...(isMobile ? {} : listeners)}
    >
      {isMobile && (
        <span
          // REQ-286: dedicated drag handle for mobile. Mirrors the column-header grip
          // pattern (touch-none + dnd listeners) so the rest of the card can be panned
          // by the browser. stopPropagation on click so a tap on the grip doesn't open
          // the entity detail panel.
          className={[
            'absolute z-10 inline-flex items-center justify-center cursor-grab touch-none select-none text-zinc-500 active:cursor-grabbing',
            variant === 'row' ? 'left-1 top-1/2 -translate-y-1/2 w-6 h-8' : 'left-1 top-1 w-7 h-7',
          ].join(' ')}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to move card"
        >
          <GripVertical className="w-4 h-4" aria-hidden />
        </span>
      )}
      {onMoveCard && (
        <div
          // REQ-286: on mobile, hover does not exist — always show the 3-dot menu so users
          // can move cards without long-press DnD. Desktop keeps the on-hover affordance.
          className={[
            'absolute top-2 right-2 shrink-0 transition-opacity z-10',
            isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          ].join(' ')}
          ref={moveMenuRef}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMoveMenuOpen(!moveMenuOpen);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-2 sm:p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            type="button"
            aria-label="Menu"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {moveMenuOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canMoveToTop) onMoveCard(entity.id, 'top');
                    setMoveMenuOpen(false);
                  }}
                  disabled={!canMoveToTop}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  type="button"
                >
                  <ArrowUpToLine className="w-3 h-3 shrink-0" />
                  Move to top
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canMoveToBottom) onMoveCard(entity.id, 'bottom');
                    setMoveMenuOpen(false);
                  }}
                  disabled={!canMoveToBottom}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  type="button"
                >
                  <ArrowDownToLine className="w-3 h-3 shrink-0" />
                  Move to bottom
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <CardContent
        entity={entity}
        visibleProps={visibleProps}
        allEntities={allEntities}
        onEntityClick={onEntityClick}
        variant={variant}
        usersById={usersById}
        scmIntegrationEnabled={scmIntegrationEnabled}
        scmBranch={scmBranch}
        scmPullRequest={scmPullRequest}
        reserveRightForMenu={!!onMoveCard}
      />
      {scmIntegrationEnabled && (
        <Menu
          open={contextMenuAnchor !== null}
          onClose={closeContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenuAnchor !== null
              ? { top: contextMenuAnchor.y, left: contextMenuAnchor.x }
              : undefined
          }
          sx={{
            '& .MuiPaper-root': {
              bgcolor: 'rgb(24 24 27)',
              color: 'rgb(244 244 245)',
              border: '1px solid rgb(39 39 42)',
            },
            '& .MuiMenuItem-root': {
              fontSize: '0.875rem',
            },
            '& .MuiMenuItem-root:hover': {
              bgcolor: 'rgb(39 39 42)',
            },
          }}
        >
          <MenuItem
            onClick={() => {
              closeContextMenu();
              setCreateBranchOpen(true);
            }}
            disabled={!scmReady || scmLoading}
          >
            Create branch...
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeContextMenu();
              setCreatePrOpen(true);
            }}
            disabled={!scmReady || scmLoading || !scmBranch?.name}
          >
            Create pull request...
          </MenuItem>
        </Menu>
      )}
      <CreateBranchDialog
        open={createBranchOpen}
        onClose={() => setCreateBranchOpen(false)}
        projectId={projectId}
        entity={entity}
        scmConfig={scmConfig}
        onCreated={async (payload) => {
          if (!scmConfig) return false;
          try {
            const updateResult = await Promise.resolve(
              onEntityUpdate(entity.id, {
                scmBranch: toScmBranchInfo(scmConfig.provider, scmConfig.config, payload.name, payload.url),
              })
            );
            if (updateResult === false) return false;
          } catch (e) {
            console.error('Failed to update entity with branch metadata:', e);
            return false;
          }
          onScmRefresh?.();
          return true;
        }}
      />
      <CreatePullRequestDialog
        open={createPrOpen}
        onClose={() => setCreatePrOpen(false)}
        projectId={projectId}
        entity={entity}
        sourceBranch={scmBranch?.name ?? ''}
        onCreated={async (payload) => {
          if (!scmConfig) return false;
          const taskKey = getTaskKey(entity);
          const title = getEntityTitle(entity);
          try {
            const updateResult = await Promise.resolve(
              onEntityUpdate(entity.id, {
                scmPullRequest: toScmPullRequestInfo(scmConfig.provider, scmConfig.config, {
                  id: payload.id,
                  title: payload.title || `${taskKey} ${title}`.trim(),
                  url: payload.url,
                  sourceBranch: scmBranch?.name ?? '',
                  destinationBranch: payload.destinationBranch,
                }),
              })
            );
            if (updateResult === false) return false;
          } catch (e) {
            console.error('Failed to update entity with pull request metadata:', e);
            return false;
          }
          onScmRefresh?.();
          return true;
        }}
      />
    </div>
  );
};

