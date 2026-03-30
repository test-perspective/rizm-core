import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { STATUS_COLORS } from './StatusInline';

type StatusDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string, color: string) => void;
  initialValues?: { text: string; color: string };
};

export function StatusDialog({ open, onClose, onConfirm, initialValues }: StatusDialogProps) {
  const [text, setText] = useState(initialValues?.text ?? 'Status');
  const [color, setColor] = useState(initialValues?.color ?? 'blue');

  useEffect(() => {
    if (open) {
      setText(initialValues?.text ?? 'Status');
      setColor(initialValues?.color ?? 'blue');
    }
  }, [open, initialValues?.text, initialValues?.color]);

  const handleConfirm = () => {
    const trimmed = text.trim() || 'Status';
    onConfirm(trimmed, color);
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative bg-zinc-900 rounded-lg w-full max-w-sm overflow-hidden flex flex-col border border-zinc-700">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">
            {initialValues ? 'Edit Status' : 'Insert Status'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Label</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Status"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColor(c.key)}
                  className={`px-2 py-1 text-xs rounded border transition-all ${
                    color === c.key
                      ? `${c.class} ring-2 ring-white ring-offset-2 ring-offset-zinc-900`
                      : `${c.class} opacity-70 hover:opacity-100`
                  }`}
                  title={c.label}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
            type="button"
          >
            {initialValues ? 'Update' : 'Insert'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
