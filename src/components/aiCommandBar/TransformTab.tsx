import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Loader2, Send, Wand2 } from 'lucide-react';
import { isBackendEnabled } from '../../utils/storage';
import type { AiHistoryMessage } from '../../utils/aiHistory';
import type { AiProgressEvent } from './AiProgressDialog';
import { formatConversationPanelText } from './aiProgressEventCopyText';
import { CopyTextButton } from '../common/CopyTextButton';

const READY_PHRASES = [
  'ready to generate',
  'ready to generate the manifest',
  'preparation complete',
  "i'm ready to generate",
  'ready to create',
  'generate the manifest',
  'generating the manifest',
  'will generate',
  'generating',
];

function isAssistantReadyToGenerate(history: AiHistoryMessage[]): boolean {
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  if (!lastAssistant?.content) return false;
  const lower = lastAssistant.content.toLowerCase();
  return READY_PHRASES.some((phrase) => lower.includes(phrase.toLowerCase()));
}

/** Bitbucket repo URL in history or draft input — Generate must work even if the assistant never said "ready" (REQ-275). */
function conversationHasBitbucketRepoUrl(history: AiHistoryMessage[], draftInput: string): boolean {
  const blob = [draftInput, ...history.map((h) => h.content)].join('\n').toLowerCase();
  return blob.includes('bitbucket.org/');
}

type TransformTabProps = {
  inputRef: RefObject<HTMLTextAreaElement>;
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
  onGenerateManifest: () => void;
  isProcessing: boolean;
  presetsOnly: boolean;
  quickTransformKeys: string[];
  onQuickTransform: (key: string) => void;
  history: AiHistoryMessage[];
  onClearHistory: () => void;
  onReusePrompt: (value: string) => void;
  progressEvents: AiProgressEvent[];
  progressRunning: boolean;
  onCancelProgress: () => void;
};

export const TransformTab = ({
  inputRef,
  input,
  onInputChange,
  onSendMessage,
  onGenerateManifest,
  isProcessing,
  presetsOnly,
  quickTransformKeys,
  onQuickTransform,
  history,
  onClearHistory,
  onReusePrompt,
  progressEvents,
  progressRunning,
  onCancelProgress,
}: TransformTabProps) => {
  const backendReady = isBackendEnabled() && !presetsOnly;
  const canGenerate =
    backendReady &&
    (isAssistantReadyToGenerate(history) || conversationHasBitbucketRepoUrl(history, input));
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
      <div className="mb-3">
        <p className="text-[11px] text-zinc-500 mb-1.5">Quick transforms</p>
        <div className="flex flex-wrap gap-1.5">
          {quickTransformKeys.map((key) => (
            <button
              key={String(key)}
              onClick={() => onQuickTransform(key)}
              className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors"
            >
              <span className="capitalize">{String(key)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex-1 min-h-0 flex flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-300">Conversation</p>
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
            <div key={`${item.createdAt}-${idx}`} className="rounded px-2 py-1 space-y-1">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 shrink-0">
                  {item.role === 'user' ? 'You' : 'Assistant'}
                </p>
                {item.role === 'user' && (
                  <button
                    type="button"
                    onClick={() => onReusePrompt(item.content)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 shrink-0"
                    aria-label="Reuse prompt"
                  >
                    Reuse
                  </button>
                )}
              </div>
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

      <div className="flex flex-col gap-2">
        <div className="relative rounded-lg border border-zinc-700 bg-zinc-900 focus-within:ring-2 focus-within:ring-violet-500 focus-within:ring-offset-0">
          <textarea
            ref={inputRef}
            rows={3}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isProcessing && backendReady) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            placeholder="e.g., Transform this into a CRM system..."
            aria-label="Transform prompt"
            className="w-full min-w-0 min-h-[80px] resize-y bg-transparent rounded-lg px-3 pt-2.5 pb-11 pr-12 text-sm leading-snug text-white placeholder-zinc-500 placeholder:text-xs focus:outline-none focus:ring-0 disabled:opacity-60"
            disabled={isProcessing}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onSendMessage}
            disabled={!input.trim() || isProcessing || !backendReady}
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
        <button
          type="button"
          onClick={onGenerateManifest}
          disabled={isProcessing || !canGenerate}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg font-medium hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title={
            !canGenerate && backendReady
              ? 'Continue the conversation until the assistant is ready, or include a bitbucket.org/… repository URL.'
              : undefined
          }
        >
          <Wand2 className="w-5 h-5" />
          <span>Generate Manifest</span>
        </button>
      </div>
    </>
  );
};
