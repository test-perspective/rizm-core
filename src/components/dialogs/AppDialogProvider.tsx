import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type {
  AppDialogAPI,
  DialogRequest,
  AlertOptions,
  ConfirmOptions,
  PromptOptions,
} from './types';
import { createDialogRequest, enqueue, dequeue, peek } from './dialogQueue';

const AppDialogContext = createContext<AppDialogAPI | null>(null);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const current = peek(queue);

  // Set initial value when the prompt dialog opens
  useEffect(() => {
    if (current?.type === 'prompt') {
      const opts = current.options as PromptOptions;
      setPromptValue(opts.defaultValue ?? '');
      setPromptError(null);
      setCopied(false);
    }
  }, [current?.id, current?.type, current?.options]);

  // autoFocus for prompt input
  useEffect(() => {
    if (current?.type === 'prompt' && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [current?.id, current?.type]);

  const closeAndResolve = useCallback((value: unknown) => {
    setQueue((q) => {
      const first = peek(q);
      if (first) {
        first.resolve(value);
      }
      return dequeue(q);
    });
    setPromptValue('');
    setPromptError(null);
    setCopied(false);
  }, []);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (current.type === 'alert') {
          closeAndResolve(undefined);
        } else if (current.type === 'confirm') {
          closeAndResolve(false);
        } else if (current.type === 'prompt') {
          closeAndResolve(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [current, closeAndResolve]);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      const request = createDialogRequest<void>('alert', options, resolve);
      setQueue((q) => enqueue(q, request));
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const request = createDialogRequest<boolean>('confirm', options, resolve);
      setQueue((q) => enqueue(q, request));
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      const request = createDialogRequest<string | null>('prompt', options, resolve);
      setQueue((q) => enqueue(q, request));
    });
  }, []);

  const api = useMemo<AppDialogAPI>(() => ({ alert, confirm, prompt }), [alert, confirm, prompt]);

  // Alert handlers
  const handleAlertOk = () => closeAndResolve(undefined);

  // Confirm handlers
  const handleConfirmOk = () => closeAndResolve(true);
  const handleConfirmCancel = () => closeAndResolve(false);

  // Prompt handlers
  const handlePromptOk = () => {
    if (current?.type === 'prompt') {
      const opts = current.options as PromptOptions;
      if (opts.validate) {
        const err = opts.validate(promptValue);
        if (err) {
          setPromptError(err);
          return;
        }
      }
    }
    closeAndResolve(promptValue);
  };
  const handlePromptCancel = () => closeAndResolve(null);
  const handlePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPromptValue(val);
    if (current?.type === 'prompt') {
      const opts = current.options as PromptOptions;
      if (opts.validate) {
        const err = opts.validate(val);
        setPromptError(err ?? null);
      } else {
        setPromptError(null);
      }
    }
  };
  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !promptError) {
      e.preventDefault();
      handlePromptOk();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (current?.type === 'alert') {
        closeAndResolve(undefined);
      } else if (current?.type === 'confirm') {
        closeAndResolve(false);
      } else if (current?.type === 'prompt') {
        closeAndResolve(null);
      }
    }
  };

  // Render dialog based on current type
  const renderDialog = () => {
    if (!current) return null;

    if (current.type === 'alert') {
      const opts = current.options as AlertOptions;
      return (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={opts.title ? 'dialog-title' : undefined}
            aria-describedby="dialog-message"
          >
            {opts.title && (
              <div className="px-6 py-4 border-b border-zinc-800">
                <h2 id="dialog-title" className="text-lg font-semibold text-white">
                  {opts.title}
                </h2>
              </div>
            )}
            <div className="px-6 py-4">
              <p id="dialog-message" className="text-sm text-zinc-300 whitespace-pre-wrap">
                {opts.message}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={handleAlertOk}
                autoFocus
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                {opts.confirmText ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (current.type === 'confirm') {
      const opts = current.options as ConfirmOptions;
      return (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={opts.title ? 'dialog-title' : undefined}
            aria-describedby="dialog-message"
          >
            {opts.title && (
              <div className="px-6 py-4 border-b border-zinc-800">
                <h2 id="dialog-title" className="text-lg font-semibold text-white">
                  {opts.title}
                </h2>
              </div>
            )}
            <div className="px-6 py-4">
              <p id="dialog-message" className="text-sm text-zinc-300 whitespace-pre-wrap">
                {opts.message}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                {opts.cancelText ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmOk}
                autoFocus
                className={
                  opts.danger
                    ? 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900'
                    : 'px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900'
                }
              >
                {opts.confirmText ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (current.type === 'prompt') {
      const opts = current.options as PromptOptions;
      const isReadOnly = opts.readOnly ?? false;
      return (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={opts.title ? 'dialog-title' : undefined}
          >
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 id="dialog-title" className="text-lg font-semibold text-white">
                {opts.title ?? 'Input'}
              </h2>
              <button
                type="button"
                onClick={handlePromptCancel}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              {opts.message && (
                <p className="text-sm text-zinc-300 whitespace-pre-wrap mb-4">
                  {opts.message}
                </p>
              )}
              <div className="relative">
                <input
                  ref={inputRef}
                  type={opts.inputType ?? 'text'}
                  value={promptValue}
                  onChange={handlePromptChange}
                  onKeyDown={handlePromptKeyDown}
                  placeholder={opts.placeholder}
                  readOnly={isReadOnly}
                  className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    promptError ? 'border-red-500' : 'border-zinc-800'
                  } ${isReadOnly ? 'pr-10' : ''}`}
                  autoComplete="one-time-code"
                />
                {isReadOnly && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {promptError && (
                <p className="mt-2 text-xs text-red-400">{promptError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={handlePromptCancel}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                {opts.cancelText ?? 'Cancel'}
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handlePromptOk}
                  disabled={!!promptError}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                >
                  {opts.confirmText ?? 'OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {renderDialog()}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogAPI {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }
  return ctx;
}
