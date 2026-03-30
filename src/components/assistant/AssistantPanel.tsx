import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Loader2, Send } from 'lucide-react';
import { isBackendEnabled } from '../../utils/storage';
import type { AiHistoryMessage } from '../../utils/aiHistory';
import type { AiProgressEvent } from '../aiCommandBar/AiProgressDialog';
import { formatConversationPanelText } from '../aiCommandBar/aiProgressEventCopyText';
import { CopyTextButton } from '../common/CopyTextButton';

export type AssistantPanelProps = {
  inputRef?: RefObject<HTMLTextAreaElement>;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  history: AiHistoryMessage[];
  onClearHistory: () => void;
  presetsOnly: boolean;
  placeholder?: string;
  progressEvents: AiProgressEvent[];
  progressRunning: boolean;
  onCancelProgress: () => void;
};

export function AssistantPanel({
  inputRef,
  input,
  onInputChange,
  onSubmit,
  isProcessing,
  history,
  onClearHistory,
  presetsOnly,
  placeholder = 'e.g., Match the structure of the Customer Support project...',
  progressEvents,
  progressRunning,
  onCancelProgress,
}: AssistantPanelProps) {
  const backendReady = isBackendEnabled() && !presetsOnly;
  const disableSubmit = !input.trim() || isProcessing || !backendReady;
  const conversationScrollRef = useRef<HTMLDivElement>(null);

  const panelClipboardText = useMemo(
    () => formatConversationPanelText(history, progressEvents, { progressRunning }),
    [history, progressEvents, progressRunning]
  );

  useEffect(() => {
    const el = conversationScrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' });
  }, [history.length, progressEvents.length]);

  return (
    <>
      {!backendReady && (
        <div className="mb-3 text-xs text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
          Backend is disabled (VITE_KEEL_BACKEND_URL) or presets-only mode is enabled.
        </div>
      )}

      <div className="mb-3 flex-1 min-h-0 flex flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-zinc-300">Conversation</label>
          <div className="flex items-center gap-3 shrink-0">
            <CopyTextButton
              text={panelClipboardText}
              aria-label="Copy conversation"
              title="Copy conversation"
            />
            <button
              type="button"
              onClick={onClearHistory}
              disabled={isProcessing || history.length === 0}
              className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear history
            </button>
          </div>
        </div>
        <div
          ref={conversationScrollRef}
          className="flex-1 min-h-[180px] max-h-[280px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300 space-y-3 select-text"
        >
          {history.length === 0 && progressEvents.length === 0 && (
            <p className="text-zinc-500">No conversation yet. Send a message to start.</p>
          )}
          {history.map((item, idx) => (
            <div key={`${item.createdAt}-${idx}`} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                {item.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <p className="whitespace-pre-wrap break-words">{item.content}</p>
            </div>
          ))}
          {progressEvents.map((event, idx) => {
            if (event.type === 'user') {
              return (
                <div key={`evt-${idx}`} className="flex justify-end">
                  <div className="max-w-[85%] bg-violet-600/20 border border-violet-500/40 text-violet-100 px-3 py-2 rounded-lg text-sm whitespace-pre-wrap">
                    {event.message}
                  </div>
                </div>
              );
            }
            if (event.type === 'toolCall') {
              return (
                <div key={`evt-${idx}`} className="flex justify-start">
                  <div className="max-w-[85%] bg-zinc-900 border border-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm">
                    Tool: <span className="font-mono">{event.name}</span>
                  </div>
                </div>
              );
            }
            if (event.type === 'llmOutput') {
              return (
                <div key={`evt-${idx}`} className="flex justify-start">
                  <div className="max-w-[85%] bg-indigo-950/30 border border-indigo-900/70 text-indigo-100 px-3 py-2 rounded-lg text-sm whitespace-pre-wrap">
                    <p className="whitespace-pre-wrap">{event.text}</p>
                  </div>
                </div>
              );
            }
            if (event.type === 'phase') {
              return (
                <div key={`evt-${idx}`} className="flex justify-start">
                  <div className="max-w-[85%] bg-zinc-900/80 border border-zinc-700 text-zinc-400 px-3 py-2 rounded-lg text-sm">
                    {event.message}
                  </div>
                </div>
              );
            }
            if (event.type === 'error') {
              return (
                <div key={`evt-${idx}`} className="flex justify-start">
                  <div className="max-w-[85%] bg-red-950/40 border border-red-900 text-red-200 px-3 py-2 rounded-lg text-sm whitespace-pre-wrap">
                    {event.message}
                  </div>
                </div>
              );
            }
            if (event.type === 'result') {
              return (
                <div key={`evt-${idx}`} className="flex justify-start">
                  <div className="max-w-[85%] bg-emerald-950/40 border border-emerald-900 text-emerald-200 px-3 py-2 rounded-lg text-sm">
                    {event.message || 'Completed.'}
                  </div>
                </div>
              );
            }
            return null;
          })}
          {progressRunning && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-zinc-900 border border-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-300 shrink-0" />
                <span>Processing...</span>
                <button
                  type="button"
                  onClick={onCancelProgress}
                  className="ml-2 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative rounded-lg border border-zinc-700 bg-zinc-900 focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-0">
        <textarea
          ref={inputRef}
          rows={3}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !disableSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          aria-label="Assistant message"
          className="w-full min-w-0 min-h-[80px] resize-y bg-transparent rounded-lg px-3 pt-2.5 pb-11 pr-12 text-sm leading-snug text-white placeholder-zinc-500 placeholder:text-xs focus:outline-none focus:ring-0 disabled:opacity-60"
          disabled={isProcessing}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disableSubmit}
          title="Send"
          aria-label="Send"
          className="absolute bottom-2 right-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-md hover:bg-violet-500 disabled:pointer-events-none disabled:opacity-40 transition-colors"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </>
  );
}
