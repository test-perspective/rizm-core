import { createReactInlineContentSpec } from '@blocknote/react';
import type { Entity } from '../../types';

export type TaskLinkInlineDeps = {
  entitiesRef: { current: Entity[] };
  onEntityClickRef: { current: ((entity: Entity) => void) | undefined };
  isMountedRef: { current: boolean };
};

const LINKED_CLASS_NAME =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ' +
  'text-violet-400 hover:text-violet-300 hover:bg-violet-500/20 cursor-pointer underline';

/**
 * Find the active project's task entity for a task key.
 *
 * REQ-309: a task that moved here from another project answers to the keys it
 * held before, so text written under the old key keeps linking.
 */
export function findEntityByTaskKey(entities: Entity[], taskKey: string): Entity | undefined {
  const current = entities.find((e) => {
    const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
    return tk === taskKey;
  });
  if (current) return current;

  return entities.find((e) => {
    const previous = e.properties?.previousTaskKeys;
    if (!Array.isArray(previous)) return false;
    return previous.some((k) => typeof k === 'string' && k.trim() === taskKey);
  });
}

/**
 * REQ-311: a task key that does not resolve to a task in the active project renders as plain
 * prose - no chip, no tooltip, no handlers. Keys belonging to another project used to fall into
 * the "deleted entity" branch and got a strikethrough plus a dead click target.
 *
 * `data-keel-task-link` is deliberately omitted for unresolved keys: WikiEditorPane's read-mode
 * click handler uses that attribute to suppress entering edit mode, and plain text should not.
 */
export function TaskLinkInline({ taskKey, deps }: { taskKey: string; deps: TaskLinkInlineDeps }) {
  const { entitiesRef, onEntityClickRef, isMountedRef } = deps;
  const linkedEntity = findEntityByTaskKey(entitiesRef.current, taskKey);

  if (!linkedEntity) {
    return <span data-keel-task-link-state="unresolved">{taskKey}</span>;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!isMountedRef.current) return;
        if (onEntityClickRef.current) {
          try {
            onEntityClickRef.current(linkedEntity);
          } catch {
            // ignore
          }
        }
      }, 0);
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  return (
    <span
      data-keel-task-link
      data-keel-task-link-state="linked"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={LINKED_CLASS_NAME}
      title={`Click to open: ${taskKey}`}
      style={{ userSelect: 'none', pointerEvents: 'auto' }}
    >
      {taskKey}
    </span>
  );
}

export function createTaskLinkInlineSpec(deps: TaskLinkInlineDeps) {
  return createReactInlineContentSpec(
    {
      type: 'taskLink',
      propSchema: { taskKey: { default: '' } },
      content: 'none',
    },
    {
      render: (props) => <TaskLinkInline taskKey={props.inlineContent.props.taskKey} deps={deps} />,
    }
  );
}
