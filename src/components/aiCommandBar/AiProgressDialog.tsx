import { useEffect, useMemo, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { formatProgressDialogClipboardText } from './aiProgressEventCopyText';
import { CopyTextButton } from '../common/CopyTextButton';

export type AiProgressEvent =
  | { type: 'user'; message: string }
  | { type: 'phase'; message: string }
  | { type: 'toolCall'; name: string }
  | { type: 'llmOutput'; text: string }
  | { type: 'result'; message?: string }
  | { type: 'error'; message: string };

type AiProgressDialogProps = {
  isOpen: boolean;
  title: string;
  events: AiProgressEvent[];
  isRunning: boolean;
  onCancel: () => void;
  onClose: () => void;
};

export function AiProgressDialog({
  isOpen,
  title,
  events,
  isRunning,
  onCancel,
  onClose,
}: AiProgressDialogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const dialogClipboardText = useMemo(
    () => formatProgressDialogClipboardText(events, { isRunning }),
    [events, isRunning]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-xs text-zinc-500 mt-1">Streaming progress</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CopyTextButton
              text={dialogClipboardText}
              aria-label="Copy conversation"
              title="Copy conversation"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="p-6 space-y-3 max-h-[60vh] overflow-y-auto select-text">
          {events.length === 0 ? (
            <div className="text-sm text-zinc-500">Waiting for progress...</div>
          ) : (
            events.map((event, idx) => {
              if (event.type === 'user') {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[80%] bg-violet-600/20 border border-violet-500/40 text-violet-100 px-4 py-3 rounded-lg text-sm whitespace-pre-wrap">
                      {event.message}
                    </div>
                  </div>
                );
              }
              if (event.type === 'toolCall') {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[80%] bg-zinc-900 border border-zinc-700 text-zinc-200 px-4 py-3 rounded-lg text-sm">
                      Tool: <span className="font-mono">{event.name}</span>
                    </div>
                  </div>
                );
              }
              if (event.type === 'llmOutput') {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[80%] bg-indigo-950/30 border border-indigo-900/70 text-indigo-100 px-4 py-3 rounded-lg text-sm whitespace-pre-wrap font-mono">
                      <div className="text-[10px] uppercase tracking-wide text-indigo-300 mb-1">LLM</div>
                      <div>{event.text}</div>
                    </div>
                  </div>
                );
              }
              if (event.type === 'error') {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[80%] bg-red-950/40 border border-red-900 text-red-200 px-4 py-3 rounded-lg text-sm whitespace-pre-wrap">
                      {event.message}
                    </div>
                  </div>
                );
              }
              if (event.type === 'result') {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="max-w-[80%] bg-emerald-950/40 border border-emerald-900 text-emerald-200 px-4 py-3 rounded-lg text-sm">
                      {event.message || 'Completed.'}
                    </div>
                  </div>
                );
              }
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-[80%] bg-zinc-900 border border-zinc-800 text-zinc-200 px-4 py-3 rounded-lg text-sm whitespace-pre-wrap">
                    {event.message}
                  </div>
                </div>
              );
            })
          )}
          {isRunning && (
            <div className="flex justify-start">
              <div className="max-w-[80%] bg-zinc-900 border border-zinc-700 text-zinc-200 px-4 py-3 rounded-lg text-sm inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
                <span>Running...</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-200"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
