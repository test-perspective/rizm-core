import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ViewConfig, PropertyDefinition } from '../types';

interface BoardConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  view: ViewConfig;
  groupByProperty: PropertyDefinition | null;
  onSave: (view: ViewConfig) => void;
}

export function BoardConfigDialog({
  isOpen,
  onClose,
  view,
  groupByProperty,
  onSave,
}: BoardConfigDialogProps) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set(view.hiddenColumns ?? []));
  const [columnOrder, setColumnOrder] = useState<string[]>(view.columnOrder ?? []);

  useEffect(() => {
    if (!isOpen) return;
    setHiddenColumns(new Set(view.hiddenColumns ?? []));
    setColumnOrder(view.columnOrder ?? []);
  }, [isOpen, view]);

  if (!isOpen) return null;

  if (!groupByProperty || !groupByProperty.options) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Board Settings</h3>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors" type="button">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <p className="text-zinc-400">No groupBy property is configured.</p>
          </div>
        </div>
      </div>
    );
  }

  const columns = groupByProperty.options;
  const orderedColumns = columnOrder.length > 0
    ? [...columnOrder.filter((col) => columns.includes(col)), ...columns.filter((col) => !columnOrder.includes(col))]
    : columns;

  const handleToggleColumn = (column: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  const handleSave = () => {
    const nextView: ViewConfig = {
      ...view,
      hiddenColumns: hiddenColumns.size > 0 ? Array.from(hiddenColumns) : undefined,
      columnOrder: columnOrder.length > 0 ? columnOrder : undefined,
    };
    onSave(nextView);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Board Settings</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Configure column visibility
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-white">Column Settings</div>
            </div>
            <div className="divide-y divide-zinc-800">
              {orderedColumns.map((column) => {
                const isHidden = hiddenColumns.has(column);
                return (
                  <div key={column} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white">{column}</div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => handleToggleColumn(column)}
                        className="w-4 h-4 bg-zinc-950 border-zinc-800 rounded"
                      />
                      <span className="text-xs text-zinc-400">{isHidden ? 'Hidden' : 'Visible'}</span>
                    </label>
                  </div>
                );
              })}
              {orderedColumns.length === 0 && (
                <div className="px-4 py-6 text-sm text-zinc-400">No columns available.</div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
