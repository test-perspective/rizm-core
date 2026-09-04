/**
 * Hover affordance shown in the gap between two board cards (REQ-310).
 * Clicking it opens the inline create input at that exact position in the lane.
 *
 * The wrapper is zero-height on purpose: the hit area is absolutely positioned
 * over the `space-y-2` gap of BoardColumnShell so adding slots never shifts the
 * card layout.
 */
export const BoardInsertSlot = ({
  columnId,
  index,
  onClick,
}: {
  columnId: string;
  index: number;
  onClick: (index: number) => void;
}) => {
  return (
    <div className="relative h-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(index);
        }}
        // Visible on hover/keyboard focus; on hover-less (touch) devices keep a faint hint.
        className="absolute inset-x-0 -top-2 z-10 flex h-4 items-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-40"
        aria-label="ここにタスクを追加"
        title="ここにタスクを追加"
        data-testid={`board-insert-slot-${columnId}-${index}`}
      >
        <span className="h-px flex-1 bg-violet-400/70" aria-hidden />
        <span className="mx-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[11px] font-bold leading-none text-white" aria-hidden>
          +
        </span>
        <span className="h-px flex-1 bg-violet-400/70" aria-hidden />
      </button>
    </div>
  );
};
