import type { ReactNode, Ref } from 'react';

export type BoardColumnShellProps = {
  isSingleColumn: boolean;
  /** Left cluster in the header row (e.g. drag handle + title). */
  headerStart: ReactNode;
  /** Right cluster in the header row (e.g. actions + count). */
  headerEnd: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  /** Extra classes merged into the body container. */
  bodyClassName?: string;
  /** Highlight body when a droppable column is active. */
  isDropOver?: boolean;
  children: ReactNode;
};

/**
 * Shared column chrome (border, header strip, body padding) for board columns
 * and the column drag overlay preview.
 */
export function BoardColumnShell({
  isSingleColumn,
  headerStart,
  headerEnd,
  bodyRef,
  bodyClassName = '',
  isDropOver = false,
  children,
}: BoardColumnShellProps) {
  const rootClass = isSingleColumn
    ? 'w-full bg-zinc-950 border border-zinc-800 rounded-lg'
    : 'w-80 flex-shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg';

  return (
    <div className={rootClass}>
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">{headerStart}</div>
          <div className="flex items-center gap-2">{headerEnd}</div>
        </div>
      </div>
      <div
        ref={bodyRef}
        className={[
          'p-3 space-y-2 min-h-[200px] rounded-b-lg',
          isDropOver ? 'bg-violet-500/5' : '',
          bodyClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
